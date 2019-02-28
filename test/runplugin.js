const child = require("child_process");

let ps = child.fork("../modbus.js");

ps.on("message", mes => {
  console.log("Message: " + JSON.stringify(mes));
  if (mes.type == "get") {
    console.log("TYPE get mes.tablename=" + mes.tablename);
    switch (mes.tablename) {
      case "params":
        ps.send({
          type: "get",
          params: {
            host: "localhost",
            port: 8502,
            transport: "tcp",
            timeout: 1000,
            polldelay: 200,
            hex: 0,
            bo16: "be",
            bo32: "be",
            maxreadlen: 240,
            fixlocalport:true,
            localport:7999
          }
        });
        break;

      case "config":
        ps.send({
          type: "get",
          config: [
            {
              id: "di1",
              desc: "DI",
              vartype: "bool",
              address: "0x0100",
              unitid: 1,
             fcr: "1",
              gr: true
            },
            {
              id: "ao1",
              desc: "AO",
              vartype: "int16",
              address: "0x0000",
              unitid: 1,
              fcr: "3",
              gr: true
            }
          ]
        });
        break;

      default:
    }
  }
});

ps.on("close", code => {
  console.log("PLUGIN CLOSED. code=" + code);
});
