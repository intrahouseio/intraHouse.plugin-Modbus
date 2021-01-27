/*
* Fake modbus server (units)
*/

var ModbusRTU = require("modbus-serial");

let val = 0;
let dir = 1;
var vector = {
  getInputRegister: function(addr, unitID) {
    console.log("getInputRegister adr=" + addr + " uId=" + unitID+ " val=" + String(addr+200));
    return addr+200;
  },

  getHoldingRegister: function(addr, unitID) {
    if (val >= 32) dir = -1;
    if (val == 0) dir = 1;
    val += dir;

    console.log("getHoldingRegister adr=" + addr + " uId=" + unitID+ " val=" + val);
    return val;
  },

  getCoil: function(addr, unitID) {
    console.log("getHoldingRegister adr=" + addr + " uId=" + unitID+ " val=" + Number(addr % 2 === 0));
    return addr % 2 === 0;
  },

  setRegister: function(addr, value, unitID) {
    console.log("set register", addr, value, unitID);
    return;
  },
  setCoil: function(addr, value, unitID) {
    console.log("set coil", addr, value, unitID);
    return;
  }
};

// set the server to answer for modbus requests
console.log("ModbusTCP listening on modbus://0.0.0.0:8502");
var serverTCP = new ModbusRTU.ServerTCP(vector, {
  host: "0.0.0.0",
  port: 8502,
  debug: true,
  unitID: 1
});
