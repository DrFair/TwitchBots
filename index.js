var jsonFile = require('jsonfile');
var path = require("path");
var express = require("express");
var app = express();
var http = require('http');
var server = http.Server(app);
var fairBot = require('./fairbot');
var io = require('socket.io')(server);
var crypto = require("crypto");
var ejs = require('ejs');
var fs = require('fs');

var defaultChannel = 'twitch';
var userFile = 'users.json';
var settingsFile = 'settings.json';

var settingsData;
if (fs.existsSync(settingsFile)) {
    settingsData = jsonFile.readFileSync(settingsFile);
} else {
    console.log("Project missing " + settingsFile + " file.");
    process.exit(1);
}

var twitchApp = settingsData.app;

var users = [];
var currentChannel = defaultChannel;
var port = settingsData.port;
var hostName = settingsData.hostName + ':' + port;
var authRoute = twitchApp.redirect_uri;
twitchApp.redirect_uri = hostName + twitchApp.redirect_uri;
var masterBot = fairBot.createBot(twitchApp, null, currentChannel);

if (fs.existsSync(userFile)) {
    var userData = jsonFile.readFileSync(userFile);

    (function () {
        for (var i = 0; i < userData.length; i++) {
            addUser(userData[i].login, userData[i].token);
        }
    })();
}

var uniqueState; // Not used correctly
crypto.randomBytes(32, (err, buffer) => {
    if (err) {
        console.log("Crypto error:");
        console.log(err);
        return;
    }
    uniqueState = buffer.toString('hex');
});

function saveUsers() {
    var data = [];
    for (var login in users) {
        var loginData = {
            login: users[login].login,
            token: users[login].token
        };
        data.push(loginData);
    }
    data.sort((a,b ) => {
        return a.login.localeCompare(b.login);
    });
    jsonFile.writeFile(userFile, data, {spaces: 2}, function (err) {
        if (err) {
            console.log("Save " + userFile + " error:");
            console.log(err);
        }
    })
}
saveUsers();

// Views engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', '.ejs');

// Public/resource folder
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', function(req, res) {
    var data = [];
    for (var login in users) {
        data.push(users[login]);
    }
    data.sort((a,b ) => {
        return a.display_name.localeCompare(b.display_name);
    });
    // Basically all scopes available
    var scopes = "channel_check_subscription+channel_commercial+channel_editor+channel_feed_edit+channel_feed_read+channel_read+channel_stream+channel_subscriptions+" +
        "chat_login+collections_edit+" +
        "communities_edit+communities_moderate+" +
        "user_blocks_edit+user_blocks_read+user_follows_edit+user_read+user_subscriptions+viewing_activity_read";
    var authURL = "https://api.twitch.tv/kraken/oauth2/authorize" +
        "?response_type=code" +
        "&client_id=" + twitchApp.clientID +
        "&redirect_uri=" + twitchApp.redirect_uri +
        "&scope=" + scopes +
        "&state=" + uniqueState;
    render(res, 'home', { users: data, currentChannel: currentChannel, authURL: authURL, msgTry: '<br> Examples:<br>My name is <%- bot %><br>Random number: <%- Math.floor(Math.random() * 100) %>' });
});

app.get(authRoute, function(req, res) {
    if (req.query["code"] && req.query["state"]) { // Twitch authorization code
        if (req.query["state"] == uniqueState) {
            masterBot.getAuthToken(req.query["code"], uniqueState, (json) => {
                masterBot.getOtherAuthSummary(json.access_token, (summary) => {
                    if (summary.token.user_name) {
                        addUser(summary.token.user_name, json.access_token);
                        saveUsers();
                        console.log("Added user: " + summary.token.user_name + " with token: " + json.access_token);
                    }
                });
            });
        } else {
            console.log("Got wrong unique state from Twitch auth process");
        }
    }
    res.redirect('/'); // Redirect to home page
});

function render(res, view, data) {
    data.hostName = hostName;
    res.render(view, data);
}

function addUser(login, token) {
    var user = {
        login: login,
        display_name: login,
        token: token,
        selected: false
    };
    user.bot = fairBot.createBot(twitchApp, user, currentChannel);
    (function (login) {
        masterBot.getChannelByName(login, (channel) => {
            users[login].display_name = channel.display_name;
        });
    })(login);
    users[user.login] = user;
    io.emit('addbot', { // Update current connected clients
        login: user.login,
        display_name: user.display_name,
        selected: user.selected
    });
}

// Socket.io communication
io.on('connection', function(socket) {
    // console.log('Client connected');
    socket.on('botselected', function(login) {
        if (users[login]) {
            users[login].selected = !users[login].selected;
            io.emit('botselected', { // Cannot send entire object since it has password in it
                login: users[login].login,
                selected: users[login].selected
            });
        } else {
            console.log("Client selected unknown users: " + login);
        }
    });
    socket.on('checkbots', function () {
        for (var login in users) {
            users[login].selected = true;
        }
        io.emit('checkbots', {});
    });
    socket.on('uncheckbots', function () {
        for (var login in users) {
            users[login].selected = false;
        }
        io.emit('uncheckbots', {});
    });
    socket.on('sendmessage', function (data) {
        if (data.msg) {
            data.seconds = Number(data.seconds);
            for (var login in users) {
                if (users[login].selected) {
                    var offset = data.seconds <= 0 ? 0 : Math.floor(Math.random() * data.seconds * 1000);
                    var ejsMsg = ejs.render(data.msg, { bot: login }); // Render ejs
                    if (ejsMsg.length > 0) {
                        (function (bot, msg) {
                            setTimeout(function () {
                                bot.msg(currentChannel, msg);
                            }, offset);
                        })(users[login].bot, ejsMsg);
                    }
                }
            }
        }
    });
    socket.on('setchannel', function (channel) {
        if (channel.length == 0) return;
        if (channel == currentChannel) return;
        for (var login in users) {
            users[login].bot.leaveChannel(currentChannel);
            users[login].bot.joinChannel(channel);
        }
        currentChannel = channel;
        io.emit('setchannel', currentChannel);
    });
    socket.on('followchannel', function () {
        for (var login in users) {
            users[login].bot.followChannel(currentChannel);
        }
    });
});

// Error handler
app.use(function(req, res) { // 404 error
    render(res, '404', {});
});

app.use(function(err, req, res, next) {
    console.log(err);
    res.status(500).send('Something broke!');
});

// Start server
server.listen(port, function() {
    let addr = server.address();
    console.log('[' + new Date() + '] Started server at ' + addr.address + ':' + addr.port);
});