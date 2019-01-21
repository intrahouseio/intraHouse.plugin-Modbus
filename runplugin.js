const child = require('child_process'); 


    let ps=child.fork('./modbus.js');

   ps.on('message', mes => {
      console.log('Message: '+JSON.stringify(mes));
    });

    ps.on('close', code => {
      console.log('PLUGIN CLOSED. code='+code);
    });