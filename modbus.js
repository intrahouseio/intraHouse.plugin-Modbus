const util = require("util");

const plugin = require("ih-plugin-api")();
const modbus = require("./app");

(async () => {
  plugin.log("Modbus Master plugin has started.");
  sendProcessInfo();
  setInterval(sendProcessInfo, 10000);
  try {
    modbus.params = await plugin.params.get();
    plugin.log('Received params...');

    modbus.channels = await plugin.channels.get();
    if (modbus.channels.length > 0) {
      plugin.log(`Received ${modbus.channels.length} channels...`);
    } else {
      plugin.log('Empty channels list!');
      process.exit(2);
    }

    await modbus.start(plugin);
  } catch (err) {
    plugin.exit(8, `Error! Message: ${util.inspect(err)}`);
  }
})();

function sendProcessInfo() {
  const mu = process.memoryUsage();
  const memrss = Math.floor(mu.rss/1024)
  const memheap = Math.floor(mu.heapTotal/1024)
  const memhuse = Math.floor(mu.heapUsed/1024)
  process.send({type:'procinfo', data:{memrss,memheap, memhuse }});
}