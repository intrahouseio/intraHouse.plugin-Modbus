const util = require('util');
const tools = require('./tools');
const modbus = require('modbus-serial');

const networkErrors = ['ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  params: {},
  channels: [],

  async start(plugin) {
    this.plugin = plugin;

    this.plugin.onAct(this.parseAct.bind(this));

    process.on('exit', this.terminatePlugin.bind(this));
    process.on('SIGTERM', this.terminatePlugin.bind(this));

    try {
      for (item of this.channels) {
        item.unitid = parseInt(item.unitid);
        item.address = parseInt(item.address);
        item.vartype = this.getVartype(item.vartype);
      }

      this.polls = tools.getPolls(this.channels, this.params);
      this.plugin.log(`Polls = ${util.inspect(this.polls)}`, 2);

      this.queue = tools.getPollArray(this.polls);

      this.sendTime = 0;

      let connectionStr = '';

      if (this.params.transport !== 'rtu') {
        connectionStr = `${this.params.host}:${this.params.port}`;
      } else {
        connectionStr = this.params.serialPort;
      }

      this.client = new modbus();

      this.client.setTimeout(this.params.timeout);

      await this.connect();
      this.plugin.log(`Connected to ${connectionStr}`);

      await this.sendNext();
    } catch (err) {
      this.checkError(err);
    }
  },

  terminatePlugin() {
    if (this.client) {
      this.client.close();
    }
  },

  parseAct(message) {
    let data = [];

    try {
      for (item of message.data) {
        let id = item.id;
        let command = item.command;
    
        if (!command) {
          if (item.prop == 'set') {
            item.command = 'set';
          }
        }
    
        item.address = parseInt(item.address);
        item.address = parseInt(item.address);
        item.value = parseInt(item.value);
    
        if (item.usek) {
          item.value = tools.transformStoH(item.value, item);
        }
    
        item.vartype = this.getVartype(item.vartype);
    
        if (id && command) {
          this.queue.unshift(item);
    
          this.plugin.log(`Command to send: ${util.inspect(this.queue)}`, 2);
        }
      }

      if (data.length > 0) {
        this.plugin.sendData(data);
      }
    } catch (err) {
      this.checkError(err);
    }
  },

  async connect() {
    let options = { port: this.params.port };

    try {
      switch (this.params.transport) {
        case 'tcp':
          options.host = this.params.host;

          if (this.params.fixlocalport) {
            options.localPort = this.params.localport;
          }

          this.plugin.log(`Connecting options = ${util.inspect(options)}`, 1);
          await this.client.connectTCP(options);

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
        default:
          throw new Error(`Протокол ${this.params.transport} еще не имплементирован`);
      }
    } catch (err) {
      this.checkError(err)
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

  async read({ unitid, fcr, address, length, ref }) {
    this.client.setID(unitid);
    this.plugin.log(`READ: unitId = ${unitid}, FC = ${fcr}, address = ${this.showAddress(address)}, length = ${length}`);

    try {
      let res = await this.modbusReadCommand(fcr, address, length);

      this.plugin.sendData(tools.getDataFromResponse(res.buffer, ref));
      this.plugin.log(res.buffer, 2);

      await sleep(this.params.polldelay || 1);
      await this.sendNext();

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

  async write(item) {
    this.client.setID(item.unitid);
    let fcw = item.vartype == 'bool' ? 5 : 6;

    this.plugin.log(`WRITE: unitId = ${item.unitid}, FC = ${fcw}, address = ${this.showAddress(item.address)}, value = ${item.value}`, 1);

    // Результат на запись - принять!!
    try {
      let res = await this.modbusWriteCommand(fcw, item.address, item.value);

      // Получили ответ при записи
      this.plugin.log(`Write result: ${util.inspect(res)}`, 1);
      await sleep(this.plugin.polldelay || 1); // Интервал между запросами

      await this.sendNext();
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
          this.plugin.log(`writeRegister: address = ${this.showAddress(address)}, value = ${value}`, 1);
          return await this.client.writeRegister(address, value);

        default:
          throw new Error(`Функция ${fcr} на запись не поддерживается`);
      }
    } catch (err) {
      this.checkError(err);
    }
  },

  async sendNext() {
    if (this.queue.length <= 0) {
      this.queue = tools.getPollArray(this.polls);
    }

    let item = this.queue.shift();

    if (typeof item !== 'object') {
      item = this.polls[item];
    }

    this.plugin.log(`sendNext item = ${util.inspect(item)}`, 2);

    if (item.command) {
      await this.write(item);
    } else {
      await this.read(item);
    }
  },

  checkError(e) {
    if (e.errno && networkErrors.includes(e.errno)) {
      this.plugin.log('Network ERROR: ' + e.errno, 0);
    } else {
      this.plugin.log('ERROR: ' + util.inspect(e), 0);
    }

    // TODO - проверить ошибку и не всегда выходить
    this.terminatePlugin();
    process.exit(1);
  },

  getVartype(vt) {
    let bits = vt.substr(-2, 2);

    if (bits === '16') {
      return vt + this.params.bo16;
    }

    if (bits === '32' || vt === 'float') {
      return vt + this.params.bo32;
    }

    return vt;
  },

  showAddress(address) {
    if (isNaN(address)) {
      return 'NaN';
    } else {
      return `${address} (0x${Number(address).toString(16)})`;
    }
  }
};