let net = require('net')
let modbus = require('jsmodbus')
let netServer = new net.Server()
let server = new modbus.server.TCP(netServer)

server.on('connection', function () {

})

netServer.listen(8502)