var Server = require('../lib/server').Server,
    server = new Server(),
    logger = require('nlogger').logger(module);
    http   = require('http');

http.createServer(function(req, res) {
  if (req.method == 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': 'http://www.tubalr.com',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Controll-Allow-Headers': 'X-Requested-With, Content-Type'
    });
    res.end();

    return;
  }

  if (req.url == '/stats.json') {
    var body = JSON.stringify({
      clients: server.connectionCount,
      listeners: server.listenerCount,
      djs: server.djs
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
      'Access-Control-Allow-Origin': 'http://www.tubalr.com'
    });
    res.end(body);

  } else {
    res.statusCode = 404;
    res.end();
  }
}).listen(8080);
