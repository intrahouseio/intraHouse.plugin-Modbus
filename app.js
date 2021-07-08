const util = require('util');
const tools = require('./tools');
const Modbus = require('modbus-serial');

const networkErrors = ['ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  params: {},
  channels: [],

  async start(plugin) {
    this.plugin = plugin;

    this.plugin.onAct(this.parseAct.bind(this));
    this.plugin.onCommand(async data => this.parseCommand(data));

    this.plugin.channels.onChange(() => this.updateChannels(true));

    process.on('exit', this.terminatePlugin.bind(this));
    process.on('SIGTERM', () => {
      this.terminatePlugin.bind(this);
      process.exit(0);
    });

    try {
      await this.updateChannels(false);

      let connectionStr =
        this.params.transport !== 'rtu' ? `${this.params.host}:${this.params.port}` : this.params.serialPort;

      this.client = new Modbus();

      this.client.setTimeout(this.params.timeout);

      await this.connect();
      this.plugin.log(`Connected to ${connectionStr}`);

      await this.sendNext();
    } catch (err) {
      this.checkError(err);
    }
  },

  terminatePlugin() {
    console.log('TERMINATE PLUGIN');
    if (this.client) {
      this.client.close();
    }
  },

  parseAct(message) {
    try {
      message.data.forEach(aitem => {
        const item = this.formWriteObject(aitem);
        if (item) {
          this.queue.unshift(item);
          this.plugin.log(`Command to send: ${util.inspect(this.queue)}`);
        } 
        /*
        let id = item.id;
        let command = item.command;

        if (!command) item.command = 'set';

        item.address = parseInt(item.address);
        item.value = parseInt(item.value);

        item.vartype = this.getVartype(item.vartype);
        if (id) {
          this.queue.unshift(item);
          this.plugin.log(`Command to send: ${util.inspect(this.queue)}`);
        }
        */
      });
    } catch (err) {
      this.checkError(err);
    }
  },

  formWriteObject(chanItem) {
    if (!chanItem) return;
    // Копировать свойства канала в объект
    const res = {
      id: chanItem.id,
      unitid: chanItem.unitid,
      value: Number(chanItem.value) || 0,
      command: chanItem.value || 'set'
    };

    if (chanItem.diffw) {
      res.address = parseInt(chanItem.waddress);
      res.vartype = chanItem.wvartype;
      res.force = 0;
    } else {
      res.address = parseInt(chanItem.address);
      res.vartype = chanItem.vartype;
      res.force = chanItem.r ? 1 : 0;
    }

    if (!res.vartype) {
      this.plugin.log('ERROR: Command has empty vartype: '+util.inspect(chanItem))
      return;
    }
    res.vartype = this.getVartype(res.vartype);

    if (chanItem.usek) {
      res.usek = 1;
      res.ks0 = parseInt(chanItem.ks0);
      res.ks = parseInt(chanItem.ks);
      res.kh0 = parseInt(chanItem.kh0);
      res.kh = parseInt(chanItem.kh);
    }
    return res;
  },

  async parseCommand(message) {
    this.plugin.log(`Command '${message.command}' received. Data: ${util.inspect(message)}`);
    let payload = [];

    try {
      switch (message.command) {
        case 'read':
          if (message.data !== undefined) {
            for (const item of message.data) {
              payload.push(Object.assign({ value: await this.readValueCommand(item) }, item));
            }
            // payload = message.data.map(item => Object.assign({ value: this.readValueCommand(item) }, item));
          }
          this.plugin.sendResponse(Object.assign({ payload }, message), 1);
          break;

        case 'write':
          if (message.data !== undefined) {
            for (const item of message.data) {
              payload.push(await this.writeValueCommand(item));
            }
            // payload = message.data.map(item => this.writeValueCommand(item));
          }

          this.plugin.sendResponse(Object.assign({ payload }, message), 1);
          break;

        default:
          break;
      }
    } catch (err) {
      this.plugin.sendResponse(Object.assign({ payload: message }, message), 0);
      this.checkError(err);
    }
  },

  async updateChannels(getChannels) {
    if (this.queue !== undefined) {
      await this.sendNext(true);
    }

    this.plugin.log(`Requested channels update. Get channels: ${getChannels ? 'yes' : 'no'}`);

    if (getChannels === true) {
      this.channels = await this.plugin.channels.get();
    }

    if (this.channels.length === 0) {
      this.plugin.log(`Channels do not exist!`);
      this.terminatePlugin();
      process.exit(8);
    }

    this.channels.forEach(item => {
      item.unitid = parseInt(item.unitid);
      this.address = parseInt(item.address);
      item.vartype = this.getVartype(item.vartype);
    });

    this.polls = tools.getPolls(this.channels, this.params);
    this.plugin.log(`Polls = ${util.inspect(this.polls)}`, 2);

    this.queue = tools.getPollArray(this.polls);

    this.sendTime = 0;
  },

  async connect() {
    let options = { port: this.params.port };

    try {
      switch (this.params.transport) {
        case 'tcp':
          this.plugin.log(`Connecting options = ${util.inspect(options)}`, 1);
          await this.client.connectTCP(this.params.host, options);

          break;
        case 'rtutcp':
          await this.client.connectTcpRTUBuffered(this.params.host, options);

          break;
        case 'rtuOverTcp':
          await this.client.connectTelnet(this.params.host, options);

          break;
        case 'rtu':
          options = {
            baudRate: +this.params.baudRate,
            parity: this.params.parity,
            dataBits: this.params.dataBits,
            stopBits: this.params.stopBits
          };

          this.plugin.log(`Connecting options = ${util.inspect(options)}`, 1);
          await this.client.connectRTUBuffered(this.params.serialport, options);

          break;
        case 'ascii':
          options = {
            baudRate: +this.params.baudRate,
            parity: this.params.parity,
            dataBits: this.params.dataBits,
            stopBits: this.params.stopBits
          };

          this.plugin.log(`Connecting options = ${util.inspect(options)}`, 1);
          await this.client.connectAsciiSerial(this.params.serialport, options);

          break;
        default:
          throw new Error(`Протокол ${this.params.transport} еще не имплементирован`);
      }
    } catch (err) {
      this.checkError(err);
      this.plugin.log(`Connection fail! EXIT`, 1);
      process.exit(1);
    }
  },

  // Это пока не работает!!!
  async checkResponse() {
    if (Date.now() - this.sendTime > this.params.timeout) {
      if (this.waiting) {
        let adr = Number(this.waiting.substr(0, 2));
        this.plugin.sendData(tools.deviceError(adr, 'Timeout error! No response'));
        this.waiting = '';
      }

      await this.sendNext();
    }
  },

  async read(item, allowSendNext) {
    this.client.setID(item.unitid);
    this.plugin.log(
      `READ: unitId = ${item.unitid}, FC = ${item.fcr}, address = ${this.showAddress(item.address)}, length = ${
        item.length
      }`,
      1
    );

    try {
      let res = await this.modbusReadCommand(item.fcr, item.address, item.length);
      if (res && res.buffer) {
        this.plugin.sendData(tools.getDataFromResponse(res.buffer, item.ref));
        this.plugin.log(res.buffer, 2);
      }
    } catch (err) {
      this.checkError(err);
    }

    if (allowSendNext !== undefined && allowSendNext === true) {
      await sleep(this.params.polldelay || 1);

      setImmediate(() => {
        this.sendNext();
      });
    }
  },

  async readValueCommand(item) {
    this.client.setID(item.unitid);
    this.plugin.log(
      `READ: unitId = ${item.unitid}, FC = ${item.fcr}, address = ${this.showAddress(item.address)}, length = ${
        item.length
      }`,
      1
    );

    try {
      let res = await this.modbusReadCommand(item.fcr, item.address, item.length);

      return tools.parseBufferRead(res.buffer, { widx: item.offset, vartype: item.vartype });
    } catch (err) {
      this.checkError(err);
    }
  },

  async modbusReadCommand(fcr, address, length) {
    try {
      fcr = Number(fcr);

      switch (fcr) {
        case 2:
          return await this.client.readDiscreteInputs(address, length);
        case 1:
          return await this.client.readCoils(address, length);
        case 4:
          return await this.client.readInputRegisters(address, length);
        case 3:
          return await this.client.readHoldingRegisters(address, length);
        default:
          throw new Error(`Функция ${fcr} на чтение не поддерживается`);
      }
    } catch (err) {
      this.checkError(err);
    }
  },

  async write(item, allowSendNext) {
    console.log('WRITE START item=' + util.inspect(item));
    this.client.setID(parseInt(item.unitid));
    let fcw = item.vartype == 'bool' ? 5 : 6;
    let val = item.value;
    if (fcw == 6) {
      console.log('WRITE BEFORE tools val =' + util.inspect(val));
      val = tools.writeValue(item.value, item);

      console.log('WRITE tools val =' + util.inspect(val));
      if (Buffer.isBuffer(val) && val.length > 2) fcw = 16;
    }

    this.plugin.log(
      `WRITE: unitId = ${item.unitid}, FC = ${fcw}, address = ${this.showAddress(item.address)}, value = ${util.inspect(
        val
      )}`,
      1
    );
    console.log(
      `WRITE: unitId = ${item.unitid}, FC = ${fcw}, address = ${this.showAddress(item.address)}, value = ${util.inspect(
        val
      )}`
    );

    // Результат на запись - принять!!
    try {
      let res = await this.modbusWriteCommand(fcw, item.address, val);

      // Получили ответ при записи
      this.plugin.log(`Write result: ${util.inspect(res)}`, 1);
      console.log(`Write result: ${util.inspect(res)}`);

      if (item.force) {
        // Только если адрес для чтения и записи одинаковый
        // Отправить значение этого канала как при чтении
        this.plugin.sendData([{ id: item.id, value: item.value }]);
      }
    } catch (err) {
      this.checkError(err);
    }

    if (allowSendNext !== undefined && allowSendNext === true) {
      await sleep(this.plugin.polldelay || 1); // Интервал между запросами
      setImmediate(() => {
        this.sendNext();
      });
    }
  },

  async writeValueCommand(item) {
    this.client.setID(item.unitid);
    let fcw = item.vartype == 'bool' ? 5 : 6;
    let val = item.value;
    if (fcw == 6) {
      val = tools.writeValue(item.value, item);
      if (Buffer.isBuffer(val) && val.length > 2) fcw = 16;
    }

    this.plugin.log(
      `WRITE: unitId = ${item.unitid}, FC = ${fcw}, address = ${this.showAddress(item.address)}, value = ${util.inspect(
        val
      )}`,
      1
    );

    console.log(
      `writeValueCommand: unitId = ${item.unitid}, FC = ${fcw}, address = ${this.showAddress(
        item.address
      )}, value = ${util.inspect(val)}`
    );

    try {
      // let val = tools.writeValue(item.value, item);

      let res = await this.modbusWriteCommand(fcw, item.address, val);
      this.plugin.log(`Write result: ${util.inspect(res)}`, 1);
      console.log(`Write result: ${util.inspect(res)}`);
      if (item.force) {
        this.plugin.sendData([{ id: item.id, value: item.value }]);
      }

      return res;
    } catch (err) {
      this.checkError(err);
    }
  },

  async modbusWriteCommand(fcw, address, value) {
    try {
      switch (fcw) {
        case 5:
          this.plugin.log(`writeCoil: address = ${this.showAddress(address)}, value = ${value}`, 1);
          return await this.client.writeCoil(address, value);

        case 6:
          this.plugin.log(
            `writeSingleRegister: address = ${this.showAddress(address)}, value = ${util.inspect(value)}`,
            1
          );
          return await this.client.writeRegister(address, value);

        case 16:
          this.plugin.log(
            `writeMultipleRegisters: address = ${this.showAddress(address)}, value = ${util.inspect(value)}`,
            1
          );
          return await this.client.writeRegisters(address, value);

        default:
          throw new Error(`Функция ${fcw} на запись не поддерживается`);
      }
    } catch (err) {
      this.checkError(err);
    }
  },

  async sendNext(single) {
    if (this.queue.length <= 0) {
      this.queue = tools.getPollArray(this.polls);
    }

    let item = this.queue.shift();

    if (typeof item !== 'object') {
      item = this.polls[item];
    }

    this.plugin.log(`sendNext item = ${util.inspect(item)}`, 2);

    let isOnce = false;

    if (typeof single !== undefined && single === true) {
      isOnce = true;
    }

    if (this.params.transport != 'tcp' && !this.client.isOpen) {
      this.plugin.log('Port is not open! TRY RECONNECT');
      await this.connect();
    }

    if (item.command) {
      await this.write(item, !isOnce);
    } else {
      await this.read(item, !isOnce);
    }
  },

  checkError(e) {
    if (e.errno && networkErrors.includes(e.errno)) {
      this.plugin.log('Network ERROR: ' + e.errno, 0);
      console.log('Network ERROR: ' + e.errno);
    } else {
      this.plugin.log('ERROR: ' + util.inspect(e), 0);
      console.log('ERROR: ' + util.inspect(e));
    }

    // TODO - проверить ошибку и не всегда выходить
    if (this.params.transport == 'tcp') {
      this.terminatePlugin();
      process.exit(1);
    }
  },

  getVartype(vt) {
    let bits = vt.substr(-2, 2);

    if (vt === 'int8' || vt === 'uint8') {
      return vt + this.params.bo8;
    }

    if (bits === '16') {
      return vt + this.params.bo16;
    }

    if (bits === '32' || vt === 'float') {
      return vt + this.params.bo32;
    }

    if (bits === '64' || vt === 'double') {
      return vt + this.params.bo64;
    }

    return vt;
  },

  showAddress(address) {
    if (isNaN(address)) {
      return 'NaN';
    }
    return `${address} (0x${Number(address).toString(16)})`;
  }
};
