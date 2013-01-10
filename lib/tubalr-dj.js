/*jshint node:true undef:true strict:false*/

var io = require('socket.io').listen(8900);

var broadcasters = {};

function nowPlayingFromMessage(msg) {
  return msg;
}

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
    console.log(Date.now(), 'client connected');

  /* received when a user starts broadcasting. */
  socket.on('start', function(msg) {
    console.log(Date.now(), msg.from, 'is broadcasting');
    broadcasters[msg.from] = nowPlayingFromMessage(msg);
  });

  /* received when a user stops broadcasting. */
  socket.on('stop', function(msg) {
    console.log(Date.now(), msg.from, 'stopped broadcasting');
    delete(broadcasters[msg.from]);
  });

  /* received when a broadcaster has an update */
  socket.on('change', function(msg) {
    broadcasters[msg.from] = nowPlayingFromMessage(msg);
    io.sockets.emit('dj-' + msg.from, broadcasters[msg.from]);
  });

  /* received when someone wants to listen to a broadcast */
  socket.on('subscribe', function(msg) {
    var info;
    if ((info = broadcasters[msg.target])) {
      console.log(Date.now(), msg.target, 'gained a listener');
      socket.emit('dj-' + msg.target, info);
    }

  });

  socket.on('disconnect', function() {
    console.log(Date.now(), 'client disconnected');
  });

});
