var ejs = require('ejs');
var fairTwitch = require('fair-twitch');
var TwitchClient = fairTwitch.TwitchClient;
var TwitchBot = fairTwitch.TwitchBot;

module.exports = BotManager;

function BotManager(options, defaultChannel, ioSocket) {
  var self = this;
  self.bots = []; // Stores the current active bots
  self.io = ioSocket; // Stores the socket.io object
  self.clientOptions = {
    clientID: options.clientID,
    secret: options.secret,
    redirect_uri: options.redirect_uri,
    chat: false
  };
  self.client = new TwitchClient(self.clientOptions);
  self.currentChannel = defaultChannel;
  self.currentRoomState = {};
  self.masterBot = new TwitchBot({}, defaultChannel); // Log in anonymously (just used for reading chat)

  // Start a master bot chat listener for mentions and room changes
  self.masterBot.onConnected(function () {
    // Catch errors
    self.masterBot.onError(function (err) {
      console.log('Master bot error:');
      console.log(err);
    });
    // Listen for mentions
    self.masterBot.listen(function (user) {
      if (user.msg) {
        var msg = user.msg;
        var found = false;
        for (var i = 0; i < self.bots.length; i++) {
          var index = user.msg.toLowerCase().indexOf(self.bots[i].login.toLowerCase());
          if (index != -1) { // Found mention of login
             // Simple case insensitive replace all function
            msg = msg.replace(new RegExp(login, 'ig'), '<b>' + user.msg.substr(index, login.length) + '</b>');
            found = true;
          }
        }
        if (found) {
          // Add username
          msg = user.display_name + ': ' + msg;
          self.io.emit('mention', msg);
        }
      }
    });
    // Listen for room changes
    self.masterBot.onRoomChange(function (state) {
      if (state.channel == self.currentChannel) {
        for (var i in state) { // Override room state indexes
            self.currentRoomState[i] = state[i];
        }
      }
      self.io.emit('roomstate', self.currentRoomState);
    });
  });

}

BotManager.prototype.addBot = function (login, token) {
  var self = this;
  var bot = {
    login: login,
    display_name: login,
    token: token,
    followed: []
  };
  var botOptions = {
    clientID: self.clientOptions.clientID,
    token: token
  };
  bot.client = new TwitchClient(botOptions, self.currentChannel);
  // Update the bots display name
  bot.client.getChannelByName(login, function (err, channel) {
    if (err) {
      console.log('Get channel name error:');
      console.log(err);
    } else {
      bot.display_name = channel.display_name;
    }
  });
  bot.client.onChatConnected(function (user) {
    // console.log(bot.login + ':');
    // console.log(bot.client.options.scopes);
    bot.chat = bot.client.chat;
    bot.chat.onError(function (err) {
      console.log('Bot ' + bot.login + ' chat error:');
      console.log(err);
    });
    // Update bots followings
    bot.client.getFollowed(function (err, followed) {
      if (err) {
        console.log('Get followed error:');
        console.log(err);
      } else {
        for (var i = 0; i < followed.length; i++) {
          bot.followed.push({
            name: followed[i].channel.name,
            since: new Date(followed[i].created_at)
          });
        }
      }
    });
  });

  self.bots.push(bot); // Add to bots
  self.io.emit('addbot', self.getClientBot(bot)); // Update current connected clients
};

BotManager.prototype.getBotByLogin = function (login) {
  var self = this;
  for (var i = 0; i < self.bots.length; i++) {
    if (self.bots[i].login == login) {
      return self.bots[i];
    }
  }
  return null;
};

// Returns a client friendly version of a bot object
BotManager.prototype.getClientBot = function (bot) {
  var self = this;
  var followed = -1;
  for (var i = 0; i < bot.followed.length; i++) {
    if (bot.followed[i].name.toLowerCase() == self.currentChannel.toLowerCase()) {
      followed = bot.followed[i].since.getTime();
      break;
    }
  }
  return {
    login: bot.login,
    display_name: bot.display_name,
    followed: followed
  };
};

// Will change current channel for all bots etc
BotManager.prototype.setChannel = function (channel) {
  var self = this;
  if (channel.length == 0) return;
  if (channel == self.currentChannel) return;
  var oldChannel = self.currentChannel;
  self.currentChannel = channel;
  var followed = [];
  for (var i = 0; i < self.bots.length; i++) {
    var cBot = self.bots[i];
    if (cBot.chat) {
      // Leave old channel
      if (cBot.chat.isInChannel(oldChannel)) cBot.chat.leaveChannel(oldChannel);
      // Join New
      cBot.chat.joinChannel(channel);
      var clientBot = self.getClientBot(cBot);
      followed.push({
        login: clientBot.login,
        followed: clientBot.followed
      });
    }
  }
  // Update master bot
  if (self.masterBot.isInChannel(oldChannel)) self.masterBot.leaveChannel(oldChannel)
  self.masterBot.joinChannel(channel);
  // Update clients with new channel and followed data
  self.io.emit('setchannel', { channel: self.currentChannel, followed: followed });
};

// Makes bots follow the current channels (botLogins being an array)
BotManager.prototype.followChannel = function (botLogins) {
  var self = this;
  var followed = []; // The array to send back
  for (var i = 0; i < botLogins.length; i++) {
    var login = botLogins[i];
    var since = -1;
    var bot = self.getBotByLogin(login);
    if (bot != null) {
      // Find out if the bot is already following
      for (var j = 0; j < bot.followed.length; j++) {
        if (bot.followed[j].name.toLowerCase() == self.currentChannel) {
          since = bot.followed[j].since;
          break;
        }
      }
      if (since < 0) { // If bot is not already followed
        (function (login) {
          bot.client.followChannel(self.currentChannel, function (err) {
            if (err) {
              console.log('Bot ' + login + ' follow error:');
              console.log(err);
            }
          });
        })(login);
        since = Date.now();
        bot.followed.push({
          name: self.currentChannel,
          since: new Date()
        });
      }
      var clientBot = self.getClientBot(bot);
      followed.push({
        login: clientBot.login,
        followed: clientBot.followed
      });
    }
  }
  // Update clients
  // For some reason, socket.io has trouble sending raw arrays
  self.io.emit('followchannel', { followed: followed });
};

// Makes bots send a chat message to the current channel with up to a random delay
// botLogins being an array and randomDelay being in seconds
// ioSocket is the client requesting the message
BotManager.prototype.sendMessage = function (botLogins, message, randomDelay, ioSocket) {
  var self = this;
  if (message) { // Check if message is present
    randomDelay = Number(randomDelay);
    try {
      for (var i = 0; i < botLogins.length; i++) {
        var login = botLogins[i];
        var bot = self.getBotByLogin(login);
        if (bot != null) {
          var offset = randomDelay <= 0 ? 0 : Math.floor(Math.random() * randomDelay * 1000);
          var ejsData = {
            login: login,
            display_name: bot.display_name
          };
          var ejsMsg = ejs.render(message, ejsData); // Render ejs message
          if (ejsMsg.length > 0) {
            (function (bot, msg, channel) {
              setTimeout(function () {
                if (bot.chat) {
                  console.log('Sent message ' + '#' + channel + ' ' + bot.login + ': ' + msg);
                  bot.chat.msg(channel, msg);
                }
              }, offset);
            })(bot, ejsMsg, self.currentChannel);
          }
        }
      }
    } catch (err) {
      // Notify requesting client only
      if (ioSocket) ioSocket.emit('messageerror', err.message);
    }
  }
};
