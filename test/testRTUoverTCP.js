// create an empty modbus client
var ModbusRTU = require("modbus-serial");
// var ModbusRTU = require("../index");
var client = new ModbusRTU();

// client.connectTcpRTUBuffered("192.168.0.252", { port: 4002, debug:true})
client.connectTelnet("192.168.0.252", { port: 4002, debug:true})
    .then(setClient)
    .then(function() {
        console.log("Connected");
    })
    .catch(function(e) {
        console.log(e.message);
    });

function setClient() {
    // set the client's unit id
    // set a timout for requests default is null (no timeout)
    client.setID(1);
    client.setTimeout(200000);

    // run program
    run();
}

function run() {
    // read the 4 registers starting at address 5
    // client.readDiscreteInputs(0, 22)
    client.readHoldingRegisters(0xb452, 1)
        .then(function(d) {
            console.log("Receive:", d.data);
        })
        .catch(function(e) {
            console.log(e.message);
        })
        .then(close);
}

function close() {
    client.close();
}

