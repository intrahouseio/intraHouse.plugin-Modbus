/**
 * plugin.js
 */
const util = require("util");

module.exports = {
  config: [], // Каналы принятые с сервера
  loglevel:1,
  debug:0,
  params: {
    host: "localhost",
    port: 502,
    serialport: "COM1",
    transport: "tcp",
    timeout: 1000,
    polldelay: 200,
    hex: 0,
    bo16: 'be',
    bo32: 'be',
    maxreadlen:240
  },

  setParams(obj) {
    if (typeof obj == "object") {
      Object.keys(obj).forEach(param => {
        if (this.params[param] != undefined) this.params[param] = obj[param];
        if (param == 'loglevel' && obj[param]) this.loglevel = obj[param];
        if (param == 'debug') this.setDebug(obj[param]);
      });
    }
  },

  setConfig(arr) {
    if (arr && util.isArray(arr)) {
      this.config = arr;
    }
  },

  sendToServer(type, data) {
    process.send({ type, data });
  },

  sendDataToServer(payload) {
    if (!payload) return;

    let data;
    if (util.isArray(payload)) {
      data = payload;
    }
    if (!data) return;
    process.send({ type: "data", data });
  },

  // loglevel=0 - Low (только старт-стоп и ошибки), 1 - middle, 2 - hight (все сообщ)
  log(txt, level) {

    if (this.loglevel < level)  return;
    if (this.debug) {
      process.send({ type: "debug", txt });
    } else {
      process.send({ type: "log", txt });
    }
  },
  setDebug (mode) {
    this.debug = mode == "on" ? 1 : 0;
  }
};
