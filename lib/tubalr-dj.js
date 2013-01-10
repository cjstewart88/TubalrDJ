/*jshint node:true undef:true strict:false*/

var io = require('socket.io').listen(8900);

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
  socket.on('register', function(msg) {
    socket.set('username', msg.from);
    console.log('register', msg);
  });

  socket.on('start', function(msg) {
    socket.get('username', function(err, username) {
      if (username) {
        console.log('start', username, msg);

        socket.join('dj-' + username);
        broadcasters[username] = msg;
        msg.from = username;
        socket.broadcast.to('dj-' + username).emit('update', msg);
      }
    });
  });

  socket.on('stop', function(msg) {
    socket.get('username', function(err, username) {
        console.log('stop', username, msg);

      if (username) {
        socket.leave('dj-' + username);
      }
    });
  });

  socket.on('change', function(msg) {
    socket.get('username', function(err, username) {
        console.log('change', username, msg);

      if (username) {
        broadcasters[username] = msg;
        msg.from = username;
        socket.broadcast.to('dj-' + username).emit('update', msg);
      }
    });
  });


  socket.on('subscribe', function(msg) {
    socket.get('username', function(err, username) {
      username = username || 'guest';

      console.log('subscribe', username, msg);

      socket.join('dj-' + msg.target);
      var info;
      if ((info = broadcasters[msg.target])) {
        socket.emit('update', info);
      }
    });
  });

  socket.on('unsubscribe', function(msg) {
    socket.get('username', function(err, username) {
      username = username || 'guest';

      console.log('unsubscribe', username, msg);

      socket.leave('dj-' + msg.target);
    });
  });


});
