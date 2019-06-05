/**
 * agent.js
 */

const util = require("util");

const _Modbus = require("modbus-serial");
const _TcpPort = require("modbus-serial").TcpPort;

/**  Расширение modbus-serial
* Причина - socket.connect делается исп синтаксис: this._client.connect(this.port, this.ip);
* Требуется исп синтаксис socket.connect(options), чтобы передать также локальный порт при необходимости
*/

var open = function(obj, next) {
  if (next) {
    // if we have a callback, use the callback
    obj.open(next);
  } else {
    // o/w use  a promise
    var promise = new Promise((resolve, reject) => {
      function cb(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
      obj.open(cb);
    });
    return promise;
  }
};

class TcpPort extends _TcpPort {
  constructor(options) {
    super(options);
    this.options = options;
    console.log("constructor " + util.inspect(options));
  }
  open(callback) {
    console.log(this.options);
    this.callback = callback;
    // this._client.connect(this.port, this.ip);
    this._client.connect(this.options);
  }
}

class Modbus extends _Modbus {
  connectTCP(options, next) {
    console.log("connectTCP options " + util.inspect(options));
    if (this._timeout) {
      options.timeout = this._timeout;
    }
    this._port = new TcpPort(options);

    // open and call next
    return open(this, next);
  }
}

const protocol = require("./protocol");

const networkErrors = [
  "ESOCKETTIMEDOUT",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH"
];

module.exports = {
  start(plugin) {
    this.plugin = plugin;
    this.plugin.log("config=" + util.inspect(this.plugin.config), 2);

    // Преобразовать адреса в десятичные, vartype с учетом byte order
    this.plugin.config.forEach(item => {
      item.unitid = parseInt(item.unitid);
      item.address = parseInt(item.address);
      item.vartype = this.getVartype(item.vartype);
    });

    this.polls = protocol.getPolls(this.plugin.config, this.plugin.params);
    this.plugin.log("polls=" + util.inspect(this.polls), 2);
    this.tosend = protocol.getPollArray(this.polls);

    this.sendTime = 0; // Время последней посылки
   
    let ipstr = this.getHostPortStr();

    this.client = new Modbus();
    // this.client.close();

    this.client.setTimeout(this.plugin.params.timeout);
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
    const options = {port: this.plugin.params.port};  

    switch (this.plugin.params.transport) {
      case "tcp":
        options.host = this.plugin.params.host;
        if (this.plugin.params.fixlocalport) options.localPort = this.plugin.params.localport;
        this.plugin.log("Connecting options " + util.inspect(options), 1);
        return this.client.connectTCP(options);
     
        /*
        return this.client.connectTCP({
          host: this.plugin.params.host,
          port: this.plugin.params.port,
          localPort: 7999
        });
        */

      case "rtutcp":
        return this.client.connectTcpRTUBuffered(this.plugin.params.host, options);

      case "rtuOverTcp":
        return this.client.connectTelnet(this.plugin.params.host, options);

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

  // Это пока не работает!!!
  checkResponse() {
    if (Date.now() - this.sendTime > this.plugin.params.timeout) {
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

  read({ unitid, fcr, address, length, ref }) {
    let that = this;

    this.client.setID(unitid);
    this.plugin.log(
      "READ unitid=" +
        unitid +
        " FC=" +
        fcr +
        " address=" +
        this.showAddress(address) +
        " length=" +
        length,
      1
    );

    this.modbusReadCommand(fcr, address, length)
      .then(res => {
        // Получили ответ - разбираем и передаем на сервер
        this.plugin.sendDataToServer(
          protocol.getDataFromResponse(res.buffer, ref)
        );

        that.plugin.log(res.buffer, 2); // Это сырой буфер

        return sleep(this.plugin.params.polldelay || 1); // Интервал между запросами
      })
      .then(() => {
        that.sendNext();
      })
      .catch(e => {
        that.checkError(e);
      });
  },

  modbusReadCommand(fcr, address, length) {
    fcr = Number(fcr);
    switch (fcr) {
      case 2:
        return this.client.readDiscreteInputs(address, length);

      case 1:
        return this.client.readCoils(address, length);

      case 4:
        return this.client.readInputRegisters(address, length);

      case 3:
        return this.client.readHoldingRegisters(address, length);

      default:
        return Promise.reject({
          errno: "Функция " + fcr + " не поддерживается"
        });
    }
  },

  write(item) {
    let that = this;

    this.client.setID(item.unitid);
    let fcw = item.vartype == "bool" ? 5 : 6;

    this.plugin.log(
      "WRITE unitid=" +
        item.unitid +
        " FC=" +
        fcw +
        " address=" +
        this.showAddress(item.address) +
        " value=" +
        item.value,
      1
    );

    // Результат на запись - принять!!
    this.modbusWriteCommand(fcw, item.address, item.value)
      .then(res => {
        // Получили ответ при записи
        that.plugin.log("write result: " + util.inspect(res), 1);
        return sleep(this.plugin.polldelay || 1); // Интервал между запросами
      })
      .then(() => {
        that.sendNext();
      })
      .catch(e => {
        that.checkError(e);
      });
  },

  modbusWriteCommand(fcw, address, value) {
    switch (fcw) {
      case 5:
        this.plugin.log(
          "writeCoil  address=" + this.showAddress(address) + " value=" + value,
          1
        );
        return this.client.writeCoil(address, value);

      case 6:
        this.plugin.log(
          "writeRegister  address=" +
            this.showAddress(address) +
            " value=" +
            value,
          1
        );
        return this.client.writeRegister(address, value);

      default:
        return Promise.reject({
          errno: "Функция " + fcw + "на запись не поддерживается"
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

    item.address = parseInt(item.address);
    item.address = parseInt(item.address);
    item.value = parseInt(item.value);

    if (item.usek) {
      item.value = protocol.transformStoH(item.value, item);
    }
    item.vartype = this.getVartype(item.vartype);
    // Команду добавляем в начало массива. Будет отправлена после получения предыдущего ответа
    if (id && command) {
      this.tosend.unshift(item);

      this.plugin.log("command to send:" + util.inspect(this.tosend), 2);
      // this.sendNext();
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
  },

  showAddress(address) {
    if (isNaN(address)) return "NOT A NUMBER!!";

    return String(address) + " (0x" + Number(address).toString(16) + ")";
  }
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
