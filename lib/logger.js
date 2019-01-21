/**
 * logger.js
 */

// Параметры логирования
const logsection = { connect: 1, in: 0, out: 0, command: 0, config: 1 };
const debugsection = { connect: 1, in: 1, out: 1, command: 1, config: 1 };

module.exports = {
    debug:0,

    setDebug (mode) {
        this.debug = (mode == 'on') ? 1 : 0;
    },

    log (txt, section) {
       if (!section || logsection[section]) {
          process.send({ type: "log", txt });
        } else  if (this.debug && debugsection[section]){
            process.send({ type: "debug", txt });
        }
        
    }
}
