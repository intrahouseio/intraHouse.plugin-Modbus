/**
 * modbus.js
 * Modbus Master (клиент)
 */
const util = require("util");

const logger = require("./lib/logger");
const plugin = require("./lib/plugin");
const agent = require("./lib/agent");

plugin.unitId = process.argv[2];

logger.log("Plugin " + plugin.unitId + " has started.", "connect");

let step = 0;
next();

function next() {
  switch (step) {
    case 0:
      // Запрос на получение параметров
      getTable("params");
      step = 1;
      break;

    case 1:
      // Запрос на получение каналов для опроса
      getTable("config");
      step = 2;
      break;

    case 2:
      // Подключение
      agent.start(plugin, logger);
      // setInterval(checkResponse, 1000);
      step = 3;
      break;
    default:
  }
}

function getTable(name) {
  process.send({ type: "get", tablename: name + "/" + plugin.unitId });
}

// Проверка, что получен ответ  - потеря связи?
/*
function checkResponse() {
  let res = agent.checkResponse();
  if (res) {
    logger.log(res);
    agent.stop();
    process.exit(2);
  }
}
*/

/******************************** Входящие от IH ****************************************************/
process.on("message", message => {
  if (!message) return;
  if (typeof message == "string") {
    if (message == "SIGTERM") {
      agent.stop();
      process.exit();
    }
  }
  if (typeof message == "object" && message.type) {
    parseMessageFromServer(message);
  }
});

function parseMessageFromServer(message) {
  switch (message.type) {
    case "get":
      if (message.params) {
        plugin.setParams(message.params);
        if (message.params.debug) logger.setDebug(message.params.debug);
        // ПОКА
        if ( plugin.params.transport != 'tcp') {
            logger.log("Транспорт в текущей версии не поддерживается!");
            process.exit(0);
        }
        next();
      }
      if (message.config) {
        plugin.setConfig(message.config);
        next();
      }
      break;

    case "act":
      doAct(message.data);
      break;

    case "debug":
      if (message.mode) logger.setDebug(message.mode);
      break;

    default:
  }
}

// data = [{id:adr, command:on/off/set, value:1}]
function doAct(data) {
  if (!data || !util.isArray(data) || data.length <= 0) return;

  if (step < 3) {
    logger.log("Init operation. Skip command");
    return;
  }

  data.forEach(item => {
    if (item.id && item.command) {
      // agent.doCommand(item);
      // и на сервер передать что сделали? или придет самотеком?
      // plugin.sendDataToServer([{ id: item.id, value }]);
    }
  });
}

process.on("uncaughtException", err => {
  var text = "ERR (uncaughtException): " + util.inspect(err);
  logger.log(text);
});

process.on("disconnect",() => {
  agent.stop();
  process.exit();
});
