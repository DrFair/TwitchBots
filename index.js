var jsonFile = require('jsonfile');
var path = require("path");
var express = require("express");
var app = express();
var http = require('http');
var server = http.Server(app);
var io = require('socket.io')(server);
var crypto = require("crypto");
var ejs = require('ejs');
var fs = require('fs');
var BotManager = require('./botmanager');

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

var port = settingsData.port;
var hostName = settingsData.hostName + ':' + port;
var authRoute = twitchApp.redirect_uri;
twitchApp.redirect_uri = hostName + twitchApp.redirect_uri;
var manager = new BotManager(twitchApp, defaultChannel, io);

if (fs.existsSync(userFile)) {
    var userData = jsonFile.readFileSync(userFile);

    (function () {
        for (var i = 0; i < userData.length; i++) {
            manager.addBot(userData[i].login, userData[i].token);
        }
    })();
}

var uniqueState; // Not actually unique currently
crypto.randomBytes(32, (err, buffer) => {
    if (err) {
        console.log("Crypto error:");
        console.log(err);
        return;
    }
    uniqueState = buffer.toString('hex');
});

function saveBots() {
    var data = [];
    for (var i = 0; i < manager.bots.length; i++) {
      data.push({
        login: manager.bots[i].login,
        token: manager.bots[i].token
      })
    }
    jsonFile.writeFile(userFile, data, {spaces: 2}, function (err) {
        if (err) {
            console.log("Save " + userFile + " error:");
            console.log(err);
        }
    })
}
saveBots();

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
    render(res, 'home', { authURL: authURL });
});

app.get('/help', function (req, res) {
    if (useLogin && !req.user) {
        render(res, 'login', { loginError : req.flash('error') });
        return;
    }
    render(res, 'help', { example1: 'My name is <%- display_name %>', example2: 'Random number: <%- Math.floor(Math.random() * 100) %>' });
});

app.get(authRoute, function(req, res) {
    if (req.query["code"] && req.query["state"]) { // Twitch authorization code
        if (req.query["state"] == uniqueState) {
            manager.client.getAuthToken(req.query["code"], uniqueState, (err, data) => {
                if (err) {
                    console.log('New Auth token error:');
                    console.log(err);
                } else {
                    manager.client.getOtherAuthSummary(data.access_token, (err, summary) => {
                        if (err) {
                            console.log('Auth token error:');
                            console.log(err);
                        } else {
                            if (summary.token.user_name) {
                                manager.addBot(summary.token.user_name, data.access_token);
                                saveBots();
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
        channel: manager.currentChannel,
        roomState: manager.currentRoomState,
        bots: []
    };
    for (var i = 0; i < manager.bots.length; i++) {
      data.bots.push(manager.getClientBot(manager.bots[i]));
    }
    res.json(data); // Send json data
});

function render(res, view, data) {
    data.hostName = hostName;
    data.useLogin = useLogin;
    res.render(view, data);
}

// Socket.io communication
io.on('connection', function(socket) {
    // console.log(socket.request.user);
    // console.log('Client connected');
    socket.on('sendmessage', function (data) {
      manager.sendMessage(data.users, data.msg, data.seconds, socket);
    });
    socket.on('setchannel', function (channel) {
      manager.setChannel(channel);
    });
    socket.on('followchannel', function (data) {
      manager.followChannel(data.users);
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
