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

  this.io = require('socket.io').listen(port || 8900);

  var self = this;
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

Server.prototype.getInfo = function(socket) {
  var username, info;

  if ((username = this.clients[socket.id]) &&
      (info     = this.registered[username])) {
    return info;
  }

  return null;
};

Server.prototype.onStart = function(socket, msg) {
  var info;

  /* user is not registered or already broadcasting */
  if (!(info = this.getInfo(socket)) || info.broadcasting) {
    return;
  }

  this.startBroadcasting(socket, info, msg);
};

Server.prototype.onStop = function(socket, msg) {
  var info;

  /* user is not registered or not broadcasting */
  if (!(info = this.getInfo(socket)) || !info.broadcasting) {
    return;
  }

  this.stopBroadcasting(info);
};

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

Server.prototype.onSubscribe = function(socket, msg) {
  var info, target;

  /* user not registered or target not specified */
  if (!(info = this.getInfo(socket)) || !(target = msg.target)) {
    return;
  }

  this.startListening(socket, info, target);
};

Server.prototype.onUnsubscribe = function(socket, msg) {
  var info;

  /* user not registered or not listening */
  if (!(info = this.getInfo(socket)) || !info.listeningTo) {
    return;
  }

  this.stopListening(socket, info);
};

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
  logger.trace(info.username, ' said "', msg.text, '" to ', info.listeningTo);
};

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
  connectionCount: {
    get: function() { return this.stats.connected; }
  },

  listenerCount: {
    get: function() { return this.stats.listening; }
  },

  djCount: {
    get: function() { return Object.keys(this.stats.djs).length; }
  },

  djs: {
    get: function() { return Object.keys(this.stats.djs); }
  }
});


exports.Server = Server;
