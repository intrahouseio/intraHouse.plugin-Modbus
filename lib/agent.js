/**
 * agent.js
 */

const util = require("util");
// const net = require("net");
// const Modbus = require('jsmodbus')
const Modbus = require("modbus-serial");
const protocol = require("./protocol");

const networkErrors = [
  "ESOCKETTIMEDOUT",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH"
];

// let socket = new net.Socket(); // jsmodbus

module.exports = {
  start(plugin) {
    this.plugin = plugin;
    this.plugin.log("config=" + util.inspect(this.plugin.config), 2);

    // Преобразовать адреса в десятичные, vartype с учетом byte order
    this.plugin.config.forEach(item => {
      if (this.plugin.params.hex) item.address = parseInt(item.address, 16);
      item.vartype = this.getVartype(item.vartype);
    });

    this.polls = protocol.getPolls(this.plugin.config, this.plugin.params);
    this.plugin.log("polls=" + util.inspect(this.polls), 2);
    this.tosend = protocol.getPollArray(this.polls);

    this.sendTime = 0; // Время последней посылки

    // jsmodbus
    /*
    socket = new net.Socket()
    this.client = new Modbus.client.TCP(socket);
    socket.on('connect',  () => {
        console.log("Connected!");
        this.sendNext();
    });
    socket.connect({host:plugin.params.host, port:plugin.params.port});
    */

    // modbus-serial

    this.client = new Modbus();
    let ipstr = this.getHostPortStr();

    this.connect()
      .then(() => {
        this.plugin.log("Connected to " + ipstr, 0);
        this.sendNext();
      })
      .catch(e => {
        this.plugin.log(ipstr + " connection error:" + JSON.stringify(e), 0);
        this.stop();
        process.exit(1);
      });
  },

  connect() {
    switch (this.plugin.params.transport) {
      case "tcp":
        return this.client.connectTCP(this.plugin.params.host, {
          port: this.plugin.params.port
        });

      case "tcprtu":
        return this.client.connectTCP(this.plugin.params.host, {
          port: this.plugin.params.port
        });

      default:
        return Promise.reject({
          errno:
            "Протокол " +
            this.plugin.params.transport +
            " в текущей версии не поддерживается"
        });
    }
  },

  stop() {
    if (this.client) this.client.close();
  },

  checkResponse() {
    if (Date.now() - this.sendTime > 500) {
      // 500 mc
      if (this.waiting) {
        let adr = Number(this.waiting.substr(0, 2));
        this.plugin.sendDataToServer(
          protocol.deviceError(adr, "Timeout error! No response")
        );
        this.waiting = "";
      }
      this.sendNext();
    }
  },

  read({ unitid, desc, address, length, ref }) {
    let that = this;

    this.client.setID(unitid);
    this.plugin.log(
      "READ unitid=" + unitid + " address=" + address + " length=" + length,
      2
    );

    this.modbusReadCommand(desc, address, length)
      .then(res => {
        // Получили ответ - разбираем и передаем на сервер
        this.plugin.sendDataToServer(
          protocol.getDataFromResponse(res.buffer, ref)
        );

        // console.log("DATA= " + util.inspect(res.data));

        // that.plugin.log("=> V " + JSON.stringify(res.response._body._values), "in");
        // that.pluginlog("=> A " + JSON.stringify(res.response._body._valuesAsArray), "in");

        // that.plugin.log("=> " + res.data, "in");

        that.plugin.log(res.buffer, 2); // Это сырой буфер

        return sleep(1000); // Интервал между запросами
      })
      .then(() => {
        that.sendNext();
      })
      .catch(e => {
        that.checkError(e);
      });
  },

  modbusReadCommand(desc, address, length) {
    switch (desc) {
     case "DI":
        return this.client.readDiscreteInputs(address, length);
      case "DO":
        return this.client.readCoils(address, length);

      case "AI":
        return this.client.readInputRegisters(address, length);

      case "AO":
        return this.client.readHoldingRegisters(address, length);

      default:
        return Promise.reject({ errno: "Тип " + desc + " не поддерживается" });
    }
  },

  write(item) {
    let that = this;

    // this.client.setID(item.unitid);
    this.client.setID(1);
    this.plugin.log("WRITE unitid=" + item.unitid, 2);

    let desc = item.vartype == "bool" ? "DO" : "AO";

    this.modbusWriteCommand(desc, item.address, item.value)
      .then(() => {
        that.sendNext();
      })
      .catch(e => {
        that.checkError(e);
      });
  },

  modbusWriteCommand(desc, address, value) {
    switch (desc) {
        case "DO":
        this.plugin.log(
            "writeCoil  address=" + address + " value=" + value,
            1
          );
          return this.client.writeCoil(address,value);

      case "AO":
        this.plugin.log(
          "writeRegister  address=" + address + " value=" + value,
          1
        );
        return this.client.writeRegister(address, value);

      default:
        return Promise.reject({
          errno: "Тип " + desc + "на запись не поддерживается"
        });
    }
  },

  sendNext() {
    if (this.tosend.length <= 0) {
      this.tosend = protocol.getPollArray(this.polls);
    }
    let item = this.tosend.shift();

    if (typeof item != "object") item = this.polls[item];
    this.plugin.log("sendNext item=" + util.inspect(item), 2);

    if (item.command) {
      this.write(item);
    } else {
      this.read(item);
    }
  },

  getHostPortStr() {
    return this.plugin.params.host + ":" + this.plugin.params.port;
  },

  checkError(e) {
    if (e.errno && networkErrors.includes(e.errno)) {
      this.plugin.log("Network ERROR: " + e.errno, 0);
    } else {
      this.plugin.log("ERROR: " + util.inspect(e), 0);
    }
    // TODO - проверить ошибку и не всегда выходить
    this.stop();
    process.exit(1);
  },

  /** Команды управления **/
  doCommand(item) {
    let id = item.id;
    let command = item.command;

    if (!command) {
      if (item.prop == "set") {
        item.command = "set";
      }
    }

    if (this.plugin.params.hex) {
      item.address = parseInt(item.address, 16);
    }

    if (item.usek) {
      item.value = protocol.transformStoH(item.value, item);
    }
    item.vartype = this.getVartype(item.vartype);
    // Команду добавляем в начало массива. Будет отправлена после получения предыдущего ответа
    if (id && command) {
      this.tosend.unshift(item);

      this.plugin.log("command to send:" + util.inspect(this.tosend), 2);
      this.sendNext();
    }
  },

  getVartype(vt) {
    let bits = vt.substr(-2, 2);
    if (bits == "16") {
      return vt + this.plugin.params.bo16;
    }
    if (bits == "32" || vt == "float") {
      return vt + this.plugin.params.bo32;
    }
    return vt;
  }
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
