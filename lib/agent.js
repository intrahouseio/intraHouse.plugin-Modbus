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
  start(plugin, logger) {
    this.plugin = plugin;
    this.logger = logger;

    this.polls = protocol.getPolls(this.plugin.config);
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
        this.logger.log("Connected to " + ipstr);
        this.sendNext();
      })
      .catch(e => {
        this.logger.log(ipstr + " connection error:" + JSON.stringify(e));
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

  sendToUnit({ unitid, desc, address, length, ref }) {
    let that = this;

    this.client.setID(unitid);
    console.log("sendToUnit unitid=" + unitid);

    //  this.client
    //    .readHoldingRegisters(0, 4)
    this.modbusCommand(desc, address, length)
      .then(res => {
        // Получили ответ - разбираем и передаем на сервер
        this.plugin.sendDataToServer(
          protocol.getDataFromResponse(res.buffer, ref)
        );

        console.log("DATA= " + util.inspect(res.data));

        // that.logger.log("=> V " + JSON.stringify(res.response._body._values), "in");
        // that.logger.log("=> A " + JSON.stringify(res.response._body._valuesAsArray), "in");

        // that.logger.log("=> " + res.data, "in");

        // that.logger.log(res.buffer); // Это сырой буфер

        return sleep(1000); // Интервал между запросами
      })
      .then(() => {
        that.sendNext();
      })
      .catch(e => {
        that.checkError(e);
      });
  },

  modbusCommand(desc, address, length) {
    switch (desc) {

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

  sendNext() {
    console.log("sendNext len=" + this.tosend.length);
    if (this.tosend.length <= 0) {
      this.tosend = protocol.getPollArray(this.polls);
    }
    let item = this.tosend.shift();

    console.log("sendNext1 item=" + util.inspect(item));
    if (typeof item != "object") item = this.polls[item];
    console.log("sendNext2 item=" + util.inspect(item));
    this.sendToUnit(item);
  },

  /*
  sendToUnit(payload) {
    if (!payload) return;

    try {
      let msg = protocol.formSendMessage(payload);
      this.client.write(msg);
      this.logger.log("<= " + msg, "out");
      this.sendTime = Date.now();
    } catch (e) {
      this.logger.log("ERROR write: " + payload, "out");
    }
  },
  */

  getHostPortStr() {
    return this.plugin.params.host + ":" + this.plugin.params.port;
  },

  checkError(e) {
    if (e.errno && networkErrors.includes(e.errno)) {
      this.logger.log("Network ERROR: " + e.errno);
    } else {
      this.logger.log("ERROR: " + util.inspect(e));
    }
    // TODO - проверить ошибку и не всегда выходить
    this.stop();
    process.exit(1);
  },

  /** Команды управления **/
  doCommand(item) {
    let id = item.id;
    let command = item.command;
    let value = item.value;

    if (!command) {
      if (item.prop == "set") {
        command = "set";
      }
    }

    // Команду добавляем в начало массива. Будет отправлена после получения предыдущего ответа
    if (id && command) {
      this.tosend.unshift(protocol.formCmdObj(id, command, value));
      this.logger.log("this.tosend= " + util.inspect(this.tosend), "command");
      this.sendNext();
    }
  }
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
