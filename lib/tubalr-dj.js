/*jshint node:true undef:true strict:false*/

var io     = require('socket.io').listen(8900),
    logger = require('nlogger').logger(module);

var clients      = {};
var broadcasters = {};

io.configure('production', function() {
  io.enable('browser client minification');
  io.enable('browser client etag');
  io.enable('browser client gzip');

  io.set('log level', 1);
  io.set('transports', [
    'websocket',
    'flashsocket',
    'htmlfile',
    'xhr-polling',
    'jsonp-polling'
  ]);

});

function generateName(name) {
  var n = 2;

  if (!broadcasters[name]) {
    return name;
  }
  name += '#';
  while(broadcasters[name + n.toString()]) {
    n++;
  }

  return name + n.toString();
}

io.sockets.on('connection', function(socket) {
  logger.trace(socket.handshake.address, ' connected');

  socket.on('register', function(msg) {
    msg.from = generateName(msg.from);
    logger.trace(socket.handshake.address, ' registered as ', msg.from);

    clients[socket.id] = {
      username:     msg.from,
      listeningTo:  null
    };

  });

  socket.on('start', function(msg) {
    var client = clients[socket.id];

    if (!client) {
      return;
    }

    logger.trace(client.username, ' started broadcasting: ', msg);

    broadcasters[client.username] = msg;

    socket.join(client.username);

    msg.from = client.username;
    socket.broadcast.to(client.username).emit('update', msg);
  });

  socket.on('stop', function(msg) {
    var client = clients[socket.id];

    if (!client) {
      return;
    }

    logger.trace(client.username, ' stopped broadcasting');

    delete(broadcasters[client.username]);

    socket.broadcast.to(client.username).emit('stop', {from: client.username});
    socket.leave(client.username);
  });

  socket.on('change', function(msg) {
    var client = clients[socket.id];

    if (!client) {
      return;
    }

    broadcasters[client.username] = msg;
    logger.trace(client.username, ' changed track: ', msg);

    msg.from = client.username;
    socket.broadcast.to(client.username).emit('update', msg);
  });

  socket.on('chat', function(msg) {
    var client = clients[socket.id];

    if (!client) {
      return;
    }

    logger.trace(client.username, 'said "', msg.text, '" to ', msg.target);

    msg.from = client.username;
    socket.broadcast.to(msg.target).emit('chat', msg);
  });


  socket.on('subscribe', function(msg) {
    var client = clients[socket.id];
    var host   = broadcasters[msg.target];

    if (!client) {
      return;
    }

    logger.trace(client.username, ' subscribed to ', msg.target);
    client.listeningTo = msg.target;

    socket.join(msg.target);
    socket.broadcast.to(msg.target).emit('join', {from: client.username});

    if (host) {
      socket.emit('update', host);
    } else {
      socket.emit('no-dj', {});
    }
  });

  socket.on('unsubscribe', function(msg) {
    var client = clients[socket.id];

    if (!client) {
      return;
    }

    logger.trace(client.username, ' unsubscribed from ', msg.target);
    client.listeningTo = false;

    socket.broadcast.to(msg.target).emit('part', {from: client.username});
    socket.leave(msg.target);
  });


  socket.on('disconnect', function(msg) {
    var client = clients[socket.id];

    if (!client) {
      return;
    }

    logger.trace(client.username, ' disconnected.');

    if (client.listeningTo) {
      socket.broadcast.to(client.listeningTo).emit('part', {from: client.username});
    }

    if (broadcasters[client.username]) {
      logger.trace(client.username, ' stopped broadcasting.');
      delete(broadcasters[client.username]);
    }

    delete(clients[socket.id]);
  });


});
