var Server = require('../lib/server').Server,
    server = new Server(),
    logger = require('nlogger').logger(module);


setInterval( function() {
  logger.info(server.connectionCount, ' clients, ',
              server.djCount, ' djs, ',
              server.listenerCount, ' listeners.');
}, 5 * 60 * 1000);
