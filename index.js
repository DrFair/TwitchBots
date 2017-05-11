var jsonFile = require('jsonfile');
var path = require("path");
var express = require("express");
var app = express();
var http = require('http');
var server = http.Server(app);
var fairTwitch = require('fair-twitch');
var io = require('socket.io')(server);
var crypto = require("crypto");
var ejs = require('ejs');
var fs = require('fs');

var defaultChannel = 'twitch';
var userFile = 'users.json';
var settingsFile = 'settings.json';

var settingsData;
var useLogin = false;
var logins;
if (fs.existsSync(settingsFile)) {
    settingsData = jsonFile.readFileSync(settingsFile);
    if (settingsData.defaultChannel) defaultChannel = settingsData.defaultChannel;
    if (settingsData.logins && settingsData.logins.length > 0) {
        useLogin = true;
        logins = settingsData.logins;
    }
} else {
    console.log("Project missing " + settingsFile + " file.");
    process.exit(1);
}

var twitchApp = settingsData.app;
if (twitchApp.redirect_uri === '/login' || twitchApp.redirect_uri === '/logout') {
    console.log("App redirect_uri cannot be /login or /logout");
    process.exit(1);
}

var users = [];
var currentChannel = defaultChannel;
var currentRoomState = {};
var port = settingsData.port;
var hostName = settingsData.hostName + ':' + port;
var authRoute = twitchApp.redirect_uri;
twitchApp.redirect_uri = hostName + twitchApp.redirect_uri;
var masterBot = new fairTwitch.TwitchClient(twitchApp);
var listenersActive = false;

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

if (useLogin) require('./passport').init(app, io, logins);

// Routes
app.get('/', function(req, res) {
    if (useLogin && !req.user) {
        render(res, 'login', { loginError : req.flash('error') });
        return;
    }
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
    render(res, 'home', { authURL: authURL, msgTry: '<br> Examples:<br>My name is <%- bot %><br>Random number: <%- Math.floor(Math.random() * 100) %>' });
});

app.get(authRoute, function(req, res) {
    if (req.query["code"] && req.query["state"]) { // Twitch authorization code
        if (req.query["state"] == uniqueState) {
            masterBot.getAuthToken(req.query["code"], uniqueState, (err, data) => {
                if (err) {
                    console.log('New Auth token error:');
                    console.log(err);
                } else {
                    masterBot.getOtherAuthSummary(data.access_token, (err, summary) => {
                        if (err) {
                            console.log('Auth token error:');
                            console.log(err);
                        } else {
                            if (summary.token.user_name) {
                                addUser(summary.token.user_name, data.access_token);
                                saveUsers();
                                console.log("Added user: " + summary.token.user_name + " with token: " + data.access_token);
                            }
                        }
                    });
                }
            });
        } else {
            console.log("Got wrong unique state from Twitch auth process");
        }
    }
    res.redirect('/'); // Redirect to home page
});

app.get('/api/summary', function (req, res) {
    var data = {
        channel: currentChannel,
        roomState: currentRoomState,
        bots: []
    };
    for (var login in users) {
        data.bots.push(getClientUser(users[login]));
    }
    res.json(data); // Send json data
});

function getClientUser(user) {
    var followed = -1;
    for (var i = 0; i < user.followed.length; i++) {
        if (user.followed[i].name.toLowerCase() == currentChannel.toLowerCase()) {
            followed = user.followed[i].since.getTime();
            break;
        }
    }
    return {
        login: user.login,
        display_name: user.display_name,
        followed: followed
    };

}

function render(res, view, data) {
    data.hostName = hostName;
    data.useLogin = useLogin;
    res.render(view, data);
}

function addUser(login, token) {
    var user = {
        login: login,
        display_name: login,
        token: token,
        followed: []
    };
    var clientOptions = {
        clientID: twitchApp.clientID,
        secret: twitchApp.seconds,
        redirect_uri: twitchApp.redirect_uri,
        token: token
    };
    user.bot = new fairTwitch.TwitchClient(clientOptions, currentChannel);
    masterBot.getChannelByName(login, (err, channel) => {
        if (err) {
            console.log('Get channel by name error:');
            console.log(err);
        } else {
            users[login].display_name = channel.display_name;
        }
    });
    user.bot.onChatConnected(function () {
        // console.log("TEST " + user.login);
        user.bot.chat.onError(function (err) {
            console.log(err);
        });
        if (!listenersActive) {
            user.bot.chat.listen((user) => {
                if (user.msg) {
                    var msg = user.msg;
                    var found = false;
                    for (var login in users) {
                        var index = user.msg.toLowerCase().indexOf(login.toLowerCase());
                        if (index !== -1) { // Found mention of login
                            msg = msg.replace(new RegExp(login, 'ig'), '<b>' + user.msg.substr(index, login.length) + '</b>'); // Simple case insensitive replace all function
                            found = true;
                        }
                    }
                    if (found) {
                        // Add user name
                        msg = user.display_name + ': ' + msg;
                        io.emit('mention', msg);
                    }
                }
            });
            user.bot.chat.onRoomChange(function (state) {
                if (state.channel === currentChannel) {
                    for (var i in state){ // Override room state indexes
                        currentRoomState[i] = state[i];
                    }
                }
                io.emit('roomstate', currentRoomState);
            });
            listenersActive = true;
        }
        user.bot.getFollowed((err, followed) => {
            if (err) {
                console.log('Get followed error:');
                console.log(err);
            } else {
                for (var i = 0; i < followed.length; i++) {
                    users[user.login].followed.push({
                        name: followed[i].channel.name,
                        since: new Date(followed[i].created_at)
                    });
                }
            }
        })
    });
    users[user.login] = user;
    io.emit('addbot', getClientUser(user)); // Update current connected clients
}

// Socket.io communication
io.on('connection', function(socket) {
    // console.log(socket.request.user);
    // console.log('Client connected');
    socket.on('sendmessage', function (data) {
        if (data.msg) {
            data.seconds = Number(data.seconds);
            try {
                for (var i = 0; i < data.users.length; i++) {
                    var login = data.users[i];
                    var offset = data.seconds <= 0 ? 0 : Math.floor(Math.random() * data.seconds * 1000);
                    var ejsMsg = ejs.render(data.msg, { bot: login }); // Render ejs
                    if (ejsMsg.length > 0) {
                        (function (bot, msg) {
                            setTimeout(function () {
                                bot.chat.msg(currentChannel, msg);
                            }, offset);
                        })(users[login].bot, ejsMsg);
                    }
                }
            } catch (err) {
                // Notify sender only
                socket.emit('messageerror', err.message);
            }
        }
    });
    socket.on('setchannel', function (channel) {
        if (channel.length == 0) return;
        if (channel == currentChannel) return;
        var oldChannel = currentChannel;
        currentChannel = channel;
        var followed = [];
        for (var login in users) {
            if (users[login].bot.chat.isInChannel(oldChannel)) users[login].bot.chat.leaveChannel(oldChannel);
            users[login].bot.chat.joinChannel(channel);
            var clientUser = getClientUser(users[login]);
            followed.push({
                login: clientUser.login,
                followed: clientUser.followed
            });
        }
        io.emit('setchannel', { channel: currentChannel, followed: followed });
    });
    socket.on('followchannel', function (data) {
        var back = { followed : [] }; // For some reason, socket.io has trouble just sending arrays
        for (var i = 0; i < data.users.length; i++) {
            var login = data.users[i];
            var since = -1;
            for (var j = 0; j < users[login].followed.length; j++) {
                if (users[login].followed[j].name.toLowerCase() == currentChannel.toLowerCase()) {
                    since = users[login].followed[j].since;
                    break;
                }
            }
            if (since < 0) {
                (function (login) {
                    users[login].bot.followChannel(currentChannel, function (err) {
                        console.log(login + ' follow error:');
                        console.log(err);
                    });
                })(login);
                since = Date.now();
                users[login].followed.push({
                    name: currentChannel,
                    since: new Date()
                });
            }
            var clientUser = getClientUser(users[login]);
            back.followed.push({
                login: clientUser.login,
                followed: clientUser.followed
            })
        }
        io.emit('followchannel', back);
    });
});

// Error handler
app.use(function(req, res) { // 404 error
    render(res.status(404), '404', {});
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