var request = require("request");
var irc = require("irc");
var parser = require("./parser");

var apiURL = "https://api.twitch.tv/kraken";
var ircURL = "irc.chat.twitch.tv";
var ircPort = 6667;

var logErrors = false;

exports.createBot = function(twitchApp, user, startChannel) {
    var headers = {
        "Accept": "application/vnd.twitchtv.v5+json",
        "Client-ID": twitchApp.clientID
    };
    if (user) {
        headers["Authorization"] = "OAuth " + user.token;
    }

    var bot = {};
    bot.userID = null;

    // HTTP Request parts

    bot.rawRequest = function(options, callback) {
        request(options, callback);
    };

    bot.rawPut = function (options, callback) {
        request.put(options, callback);
    };

    bot.rawPost = function (options, callback) {
        request.post(options, callback);
    };

    bot.request = function(apicall, callback, replacementAuth) {
        var options = {
            url: apiURL + apicall,
            headers: headers
        };
        if (replacementAuth) {
            options.headers["Authorization"] = "OAuth " + replacementAuth;
        }
        this.rawRequest(options, (err, response, body) => {
            if (err) {
                callback(err);
                return;
            }
            try { // Sometimes JSON.parse gives token error?
                var json = JSON.parse(body);
                if (json["error"]) { // Handles twitch error body
                    callback(json["status"] + " - " + json["error"] + ": " + json["message"]);
                } else {
                    callback(null, json);
                }
            } catch(e) {
                callback(e);
            }
        });
    };

    bot.put = function(apicall, callback) {
        var options = {
            url: apiURL + apicall,
            headers: headers
        };
        this.rawPut(options, (err, response, body) => {
            if (err) {
                callback(err);
                return;
            }
            try { // Sometimes JSON.parse gives token error?
                var json = JSON.parse(body);
                if (json["error"]) { // Handles twitch error body
                    callback(json["status"] + " - " + json["error"] + ": " + json["message"]);
                } else {
                    callback(null, json);
                }
            } catch(e) {
                callback(e);
            }
        });
    };

    bot.post = function(apicall, postData, callback) {
        var options = {
            url: apiURL + apicall,
            headers: headers,
            formData: postData
        };
        this.rawPost(options, (err, response, body) => {
            if (err) {
                callback(err);
                return;
            }
            try { // Sometimes JSON.parse gives token error?
                var json = JSON.parse(body);
                if (json["error"]) { // Handles twitch error body
                    callback(json["status"] + " - " + json["error"] + ": " + json["message"]);
                } else {
                    callback(null, json);
                }
            } catch(e) {
                callback(e);
            }
        });
    };

    // This requires secret and redirect uri in twitch app
    bot.getAuthToken = function (code, state, callback) {
        var postData = {
            client_id: twitchApp.clientID,
            client_secret: twitchApp.secret,
            grant_type: "authorization_code",
            redirect_uri: twitchApp.redirect_uri,
            code: code,
            state: state
        };
        this.post("/oauth2/token", postData, (err, json) => {
            if (err) {
                console.log("Get auth token error:");
                console.log(err);
                return;
            }
            callback(json);
        });
    };

    bot.getOtherAuthSummary = function (auth, callback) {
        this.request("/", (err, json) => {
            if (err) {
                console.log("Other auth summary error:");
                console.log(err);
                return;
            }
            callback(json);
        }, auth);
    };
    
    bot.getAuthSummary = function (callback) {
        this.request("/", (err, json) => {
            if (err) {
                console.log("Auth summary error:");
                console.log(err);
                return;
            }
            callback(json);
        });
    };

    bot.getChannelByID = function(channelID, callback) {
        this.request("/channels/" + channelID, (err, json) => {
            if (err) {
                console.log("Error looking up channel ID " + channelID);
                callback(null);
                return;
            }
            callback(json);
        });
    };

    bot.getChannelIDByName = function(channelName, callback) {
        this.request("/users?login=" + channelName, (err, json) => {
            if (err) {
                console.log("Error searching for channel ID: " + err);
                callback(null);
                return;
            }
            if (json.users && json.users[0] != undefined) {
                callback(json.users[0]._id);
                return;
            }
            callback(null);
        });
    };
    
    bot.getChannelByName = function (channelName, callback) {
        this.request("/users?login=" + channelName, (err, json) => {
            if (err) {
                console.log("Error searching for channel by name: " + err);
                callback(null);
                return;
            }
            if (json.users && json.users[0] != undefined) {
                callback(json.users[0]);
                return;
            }
            callback(null);
        });
    };

    bot.findVideoByStream = function(stream, callback) {
        this.findVideoByStreamID(stream.channel._id, stream._id, callback);
    };

    bot.findVideoByStreamID = function(channelID, streamID, callback) {
        if (channelID == 0) {
            console.log("Cannot find video for channelID " + channelID + ", streamID " + streamID);
            callback(null);
            return;
        }
        var offset = 0;
        loop(null, null);

        // Synchronous request new videos with offset to find the right one
        function loop(err, video) {
            if (err != null) {
                console.log("Error searching for stream video: " + err);
                return;
            }
            if (video == null) {
                if (offset >= 200) { // Stop after searching through ~200 videos
                    callback(null);
                    return;
                }
                doRequest(channelID, streamID, offset, loop);
                offset += 10;
                // console.log(offset);
                return;
            }
            callback(video);
        }

        function doRequest(channelID, streamID, offset, requestCallback) {
            bot.request("/channels/" + channelID + "/videos?broadcasts=true&offset=" + offset, (err, json) => {
                if (err) {
                    requestCallback(err);
                    return;
                }
                if (json.videos) {
                    for (var i = 0; i < json.videos.length; i++) {
                        var video = json.videos[i];
                        if (video.broadcast_type === "archive") { // Only search for past broadcasts
                            if (String(video.broadcast_id) === String(streamID)) {
                                requestCallback(null, video);
                                return;
                            }
                        }
                    }
                }
                // console.log("Could not find channel with name " + channelName);
                requestCallback(null, null);
            });
        }
    };

    bot.getVideo = function(videoID, callback) {
        this.request("/videos/" + videoID, (err, json) => {
            if (err) {
                console.log("Error getting video:");
                console.log(err);
                callback(null);
                return;
            }
            callback(json);
        });
    };

    bot.getChannelStream = function(channelID, callback) {
        this.request("/streams/" + channelID, (err, json) => {
            if (err) {
                console.log("Error getting channel stream:");
                console.log(err);
                callback(null);
                return;
            }
            if (json.stream) {
                callback(json.stream);
            } else {
                callback(null);
            }
        });
    };

    bot.followChannel = function (channel) {
        if (this.userID == null) {
            console.log("Follow channel error:");
            console.log("User id not defined");
            return
        }
        this.getChannelIDByName(channel, (channelID) => {
            if (channelID != null) {
                this.put("/users/" + this.userID + "/follows/channels/" + channelID, (err) => {
                    if (err) {
                        console.log("Error following channel " + channel + ":");
                        console.log(err);
                    }
                });
            }
        });
    };

    // Chat parts
    if (user) {
        bot.getChannelIDByName(user.login, (id) => {
            bot.userID = id;
        });
        
        if (!startChannel.charAt(0) !== "#") startChannel = "#" + startChannel;

        bot.channels = [ startChannel ];

        bot.irc = new irc.Client(ircURL, user.login, {
            port: ircPort,
            password: "oauth:" + user.token,
            channels: bot.channels
        });
        
        // Request all additional information/messages
        bot.irc.send("CAP REQ", "twitch.tv/membership");
        bot.irc.send("CAP REQ", "twitch.tv/tags");
        bot.irc.send("CAP REQ", "twitch.tv/commands");

        bot.irc.addListener('error', (err) => {
            if (logErrors) {
                console.log("IRC error:");
                console.log(err);
            }
        });

        bot.isInChannel = function (channel) {
            if (!channel.charAt(0) !== "#") channel = "#" + channel;
            for (var i = 0; i < this.channels.length; i++) {
                if (this.channels[i] === channel) return true;
            }
            return false;
        };

        bot.joinChannel = function (channel) {
            if (!channel.charAt(0) !== "#") channel = "#" + channel;
            if (!this.isInChannel(channel)) {
                bot.irc.join(channel);
            }
        };

        bot.leaveChannel = function (channel) {
            if (!channel.charAt(0) !== "#") channel = "#" + channel;
            for (var i = 0; i < this.channels.length; i++) {
                if (this.channels[i] === channel) {
                    bot.irc.part(channel);
                    this.channels.splice(i, 1);
                    return;
                }
            }
        };

        // Callback is: error, args, tags
        bot.listenRaw = function(callback) {
            bot.irc.addListener('raw', (msg) => {
                if (msg.commandType === 'normal') {
                    if (msg.command.charAt(0) === "@") {
                        msg.command = msg.command.substring(1, msg.command.length);
                    }
                    var s = msg.command.split(';');
                    var tags = {};
                    for (var i = 0; i < s.length; i++) {
                        var split = s[i].split("=");
                        tags[split[0]] = split[1];
                    }
                    callback(null, msg.args, tags);
                }
            });
        };

        // Callback is: args, tags
        bot.listenTwitchTag = function(twitchTag, callback) {
            this.listenRaw((err, args, tags) => {
                if (err) return;
                if (args) {
                    var argsSplit = args[0].split(" ");
                    if (argsSplit.length > 1 && argsSplit[1] === twitchTag) {
                        callback(args, tags);
                    }
                }
            });
        };

        // Callback is: channel, username, isPrime
        bot.listenNewSub = function(callback) {
            this.listenRaw((err, args, tags) => {
                if (err) return;
                if (args.length > 1) {
                    const primeReg = /[^\s]+ just subscribed with Twitch Prime!/;
                    const reg = /[^\s]+ just subscribed!/;
                    if (args[1].match(primeReg)) {
                        var username = args[1].split(" ")[0];
                        callback(args[0], username, true);
                    } else if (args[1].match(reg)) {
                        var username = args[1].split(" ")[0];
                        callback(args[0], username, false);
                    }
                }
            });
        };

        // Callback is: user, months, isPrime
        bot.listenResub = function(callback) {
            this.listenRaw((err, args, tags) => {
                if (err) return;
                if (tags["msg-id"] && tags["msg-id"] === "resub") {
                    var user = parser.createUser(args, tags);
                    var systemMsg = tags["system-msg"].replace(/\\s/g, " ");
                    if (typeof(user.display_name) !== "string" || user.display_name.length === 0) { // Sometimes display_name is empty
                        user.display_name = systemMsg.split(" ")[0]; // Get display name from system message.
                    }
                    const primeReg = /Twitch Prime/;
                    var isPrime = systemMsg.match(primeReg) !== null;
                    callback(user, Number(tags["msg-param-months"]), isPrime);
                }
            });
        };

        // Callback is: user
        bot.listenChat = function(callback) {
            this.listenTwitchTag("PRIVMSG", (args, tags) => {
                var user = parser.createUser(args, tags);
                callback(user);
            });
        };

        // Callback is: user
        bot.listenChatCommand = function(command, callback) {
            this.listenChat((user) => {
                if (user.msg.lastIndexOf(command, 0) === 0) { // Starts with command
                    callback(user);
                }
            });
        };

        // Callback is: user
        bot.listenChatMsg = function(msg, callback) {
            this.listenChat((user) => {
                if (user.msg.toLowerCase().indexOf(msg.toLowerCase()) !== -1) {
                    callback(user);
                }
            });
        };

        // Callback is: user
        bot.listenWhisper = function(callback) {
            this.listenTwitchTag("WHISPER", (args, tags) => {
                var user = parser.createUser(args, tags);
                callback(user);
            });
        };

        bot.msg = function(channel, message) {
            if (!channel.charAt(0) !== "#") channel = "#" + channel;
            this.irc.send("PRIVMSG " + channel, message)
        };

        // User has to be exact display name
        bot.whisper = function(user, message) {
            if (typeof(user) !== "string") {
                user = user.display_name;
                if (typeof(user) !== "string") {
                    console.log("Invalid user to whipser to.");
                    return;
                }
            }
            this.irc.send("PRIVMSG " + this.channels[0], "/w " + user + " " + message)
        };
    }

    return bot;
};