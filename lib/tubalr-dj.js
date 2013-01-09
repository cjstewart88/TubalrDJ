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

  /* received when a user starts broadcasting. */
  socket.on('start', function(msg) {
    console.log('start', msg);
    broadcasters[msg.from] = nowPlayingFromMessage(msg);
  });

  /* received when a user stops broadcasting. */
  socket.on('stop', function(msg) {
    console.log('stop', msg);
    delete(broadcasters[msg.from]);
  });

  /* received when a broadcaster has an update */
  socket.on('change', function(msg) {
    console.log('change', msg);
    broadcasters[msg.from] = nowPlayingFromMessage(msg);
    io.sockets.emit('dj-' + msg.from, broadcasters[msg.from]);
  });

  /* received when someone wants to listen to a broadcast */
  socket.on('subscribe', function(msg) {
    console.log('subscribe', msg);
    var info;
    if ((info = broadcasters[msg.target])) {
      socket.emit('dj-' + msg.target, info);
    }

  });

});
