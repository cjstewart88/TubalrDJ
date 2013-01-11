/*jshint node:true undef:true strict:false*/

var io     = require('socket.io').listen(8900),
    logger = require('nlogger').logger(module);

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

io.sockets.on('connection', function(socket) {
  logger.trace(socket.handshake.address, ' connected');

  socket.on('register', function(msg) {
    logger.trace(socket.handshake.address, ' registered as ', msg.from);
    socket.set('username', msg.from);
  });

  socket.on('start', function(msg) {
    socket.get('username', function(err, username) {
      if (username) {
        logger.trace(username, ' started broadcasting');
        socket.join('dj-' + username);
        broadcasters[username] = msg;
        msg.from = username;
        socket.broadcast.to('dj-' + username).emit('update', msg);
      }
    });
  });

  socket.on('stop', function(msg) {
    socket.get('username', function(err, username) {
      logger.trace(username, ' stopped broadcasting');
      if (username) {
        delete(broadcasters[username])
        socket.leave('dj-' + username);
      }
    });
  });

  socket.on('change', function(msg) {
    socket.get('username', function(err, username) {

      if (username) {
        logger.trace(username, ' changed track');
        broadcasters[username] = msg;
        msg.from = username;
        socket.broadcast.to('dj-' + username).emit('update', msg);
      }
    });
  });

  socket.on('chat', function(msg) {
    socket.get('username', function(err, username) {
      msg.from = username;
      logger.trace(username, 'said "', msg.text, '" to ', msg.target);
      socket.broadcast.to('dj-' + msg.target).emit('chat', msg);
    });
  });


  socket.on('subscribe', function(msg) {
    socket.get('username', function(err, username) {
      logger.trace(username, ' subscribed to ', msg.target);
      socket.join('dj-' + msg.target);

      if (broadcasters[msg.target] == null) {
        socket.emit('no-dj', {});
      }
      else {
        var info;
        if ((info = broadcasters[msg.target])) {
          socket.emit('update', info);
        }
      }
    });
  });

  socket.on('unsubscribe', function(msg) {
    socket.get('username', function(err, username) {
      logger.trace(username, ' unsubscribed from ', msg.target);
      socket.leave('dj-' + msg.target);
    });
  });


});
