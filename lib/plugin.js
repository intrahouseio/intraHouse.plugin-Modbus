/**
 * plugin.js
 */
const util = require("util");

module.exports = {
  config: [], // Каналы принятые с сервера

  params: {
    host: "localhost",
    port: 502,
    serialport: "COM1",
    transport: "tcp",
    timeout: 100,
    polldeley: 200,
    dechex: 0
  },

  setParams(obj) {
    if (typeof obj == "object") {
      Object.keys(obj).forEach(param => {
        if (this.params[param] != undefined) this.params[param] = obj[param];
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
  }
};
