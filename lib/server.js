/*jshint node:true undef:true strict:false*/
var logger = require('nlogger').logger(module);

var Server = function(port) {

  /* socket.id -> username */
  this.clients    = {};
  /* username  -> broadcast info */
  this.registered = {};

  this.stats = {
    connected: 0,
    listening: 0,
    djs:       {}
  };

  var self = this;

  this.io = require('socket.io').listen(port || 8900);
  this.io.configure('production', function() {
    self.io.enable('browser client minification');
    self.io.enable('browser client etag');
    self.io.enable('browser client gzip');

    self.io.set('log level', 1);
    self.io.set('transports', [
      'websocket',
      'flashsocket',
      'htmlfile',
      'xhr-polling',
      'jsonp-polling'
    ]);
  });

  this.io.sockets.on('connection', function(socket) {
    self.stats.connected++;
    logger.trace(socket.handshake.address, ' connected');

    /* tell the client it must register */
    socket.emit('register', {});

    socket.on('disconnect', function() {
      self.stats.connected--;
      self.onDisconnect(socket);
    });

    socket.on('register',    function(msg) { self.onRegister(socket, msg);    });
    socket.on('start',       function(msg) { self.onStart(socket, msg);       });
    socket.on('stop',        function(msg) { self.onStop(socket, msg);        });
    socket.on('change',      function(msg) { self.onUpdate(socket, msg);      });
    socket.on('subscribe',   function(msg) { self.onSubscribe(socket, msg);   });
    socket.on('unsubscribe', function(msg) { self.onUnsubscribe(socket, msg); });
    socket.on('chat',        function(msg) { self.onChat(socket, msg);        });
  });
};

/* given the users requested username, return a unique username,
 * (e.g. guest -> guest#23)
 */
Server.prototype.generateUsername = function(name) {
  var suffix = 1;

  if (!this.registered[name]) {
    return name;
  }

  name += '#';
  while (this.registered[name + (++suffix).toString()]); /* no body */

  return name + suffix.toString();
};

/* client attempting to register. assign it a username. */
Server.prototype.onRegister = function(socket, msg) {
  var username;

  /* client already registered */
  if (this.clients[socket.id]) {
    return;
  }

  username = this.generateUsername(msg.from || 'guest');

  this.clients[socket.id]   = username;
  this.registered[username] = {
    broadcasting: false,
    listeningTo:  null,
    current:      null,
    username:     username
  };
  logger.trace(socket.handshake.address, ' registered as ', username);
};

/* return the state of the client associated with the given socket,
 * or null if they are not registered. */
Server.prototype.getInfo = function(socket) {
  var username, info;

  if ((username = this.clients[socket.id]) &&
      (info     = this.registered[username])) {
    return info;
  }

  return null;
};

/* client wants to start broadcasting. */
Server.prototype.onStart = function(socket, msg) {
  var info;

  /* user is not registered or already broadcasting */
  if (!(info = this.getInfo(socket)) || info.broadcasting) {
    return;
  }

  this.startBroadcasting(socket, info, msg);
};

/* client wants to stop broadcasting. */
Server.prototype.onStop = function(socket, msg) {
  var info;

  /* user is not registered or not broadcasting */
  if (!(info = this.getInfo(socket)) || !info.broadcasting) {
    return;
  }

  this.stopBroadcasting(socket, info);
};

/* client wants to send a track update */
Server.prototype.onUpdate = function(socket, msg) {
  var info;

  /* user is not registered or not broadcasting */
  if (!(info = this.getInfo(socket)) || !info.broadcasting) {
    return;
  }

  info.current = msg;
  msg.from     = info.username;

  socket.broadcast.to(info.username).emit('update', msg);
  logger.trace(info.username, ' changed track to ', msg);
};

/* client wants to listen to another user */
Server.prototype.onSubscribe = function(socket, msg) {
  var info, target;

  /* user not registered or target not specified */
  if (!(info = this.getInfo(socket)) || !(target = msg.target)) {
    return;
  }

  this.startListening(socket, info, target);
};

/* client wants to stop listening to another user */
Server.prototype.onUnsubscribe = function(socket, msg) {
  var info;

  /* user not registered or not listening */
  if (!(info = this.getInfo(socket)) || !info.listeningTo) {
    return;
  }

  this.stopListening(socket, info);
};

/* client wants to send a chat message. */
Server.prototype.onChat = function(socket, msg) {
  var info, room;

  /* user not registered or not broadcasting/listening. */
  if (!(info = this.getInfo(socket)) ||
      (!info.broadcasting && !info.listeningTo)) {
    return;
  }

  room = info.broadcasting ? info.username : info.listeningTo;

  msg.from = info.username;
  socket.broadcast.to(room).emit('chat', msg);
  logger.trace(info.username, ' said "', msg.text, '" to ', room);
};

/* client closed connection. */
Server.prototype.onDisconnect = function(socket) {
  var info;

  /* user not registered */
  if (!(info = this.getInfo(socket))) {
    return;
  }

  if (info.broadcasting) {
    this.stopBroadcasting(socket, info);
  }

  if (info.listeningTo) {
    this.stopListening(socket, info);
  }

  logger.trace(info.username, ' disconnected');

  delete this.clients[socket.id];
  delete this.registered[info.username];
};

/* return the list of users listening to the provided user. */
Server.prototype.usersListeningTo = function(who) {
  var self = this;
  return this.io.sockets.clients(who).map(function(socket) {
    return self.clients[socket.id];
  });
};

Server.prototype.startBroadcasting = function(socket, info, state) {
  info.broadcasting = true;
  info.current      = state;

  socket.join(info.username);
  socket.broadcast.to(info.username).emit('join', {from: info.username});
  socket.broadcast.to(info.username).emit('update', state);
  socket.emit('users', {users: this.usersListeningTo(info.username)});

  this.stats.djs[info.username] = true;
  logger.trace(info.username, ' started broadcasting ', state);
};

Server.prototype.startListening = function(socket, info, target) {
  var host = this.registered[target];
  info.listeningTo = target;

  socket.join(target);
  socket.broadcast.to(target).emit('join', {from: info.username});
  socket.emit('users', {users: this.usersListeningTo(target)});

  if (host && host.broadcasting) {
    socket.emit('update', host.current);
  } else {
    socket.emit('no-dj');
  }

  this.stats.listening++;
  logger.trace(info.username, ' started listening to ', target);
};

Server.prototype.stopBroadcasting = function(socket, info) {
  info.broadcasting = false;
  info.current      = null;

  socket.broadcast.to(info.username).emit('stop', {});
  socket.broadcast.to(info.username).emit('part', {from: info.username});

  socket.leave(info.username);

  delete this.stats.djs[info.username];
  logger.trace(info.username, ' stopped broadcasting');
};


Server.prototype.stopListening = function(socket, info) {
  socket.broadcast.to(info.listeningTo).emit('part', {from: info.username});
  socket.leave(info.listeningTo);

  logger.trace(info.username, ' stopped listening to ', info.listeningTo);

  info.listeningTo = null;
  this.stats.listening--;
};

Object.defineProperties(Server.prototype, {
  /* the total number of connected clients. */
  connectionCount: {
    get: function() { return this.stats.connected; }
  },

  /* the number of clients subscribed to other users */
  listenerCount: {
    get: function() { return this.stats.listening; }
  },

  /* the number of clients DJing */
  djCount: {
    get: function() { return Object.keys(this.stats.djs).length; }
  },

  /* a list of users who are DJing. */
  djs: {
    get: function() { return Object.keys(this.stats.djs); }
  }
});


exports.Server = Server;
