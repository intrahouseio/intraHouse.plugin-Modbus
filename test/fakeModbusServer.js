/*
* Fake modbus server (units)
*/

const util = require("util");
var ModbusRTU = require("modbus-serial");

let val = 0;
let dir = 1;
var vector = {
  getInputRegister(addr, unitID) {
    console.log("getInputRegister adr=" + addr + " uId=" + unitID+ " val=" + String(addr+200));
    return addr+200;
  },

  getHoldingRegister(addr, unitID) {
    if (val >= 32) dir = -1;
    if (val == 0) dir = 1;
    val += dir;

    console.log("getHoldingRegister adr=" + addr + " uId=" + unitID+ " val=" + val);
    return val;
  },

  getCoil(addr, unitID) {
    console.log("getHoldingRegister adr=" + addr + " uId=" + unitID+ " val=" + Number(addr % 2 === 0));
    return addr % 2 === 0;
  },

  setRegister(addr, value, unitID) {
    console.log("set register addr=" +addr+"  value="+ util.inspect(value)+ "  unitID="+unitID);
    
  },
  setCoil(addr, value, unitID) {
    console.log("set coil", addr, value, unitID);
    
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
