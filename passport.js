var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var passportSocketIo = require('passport.socketio');

exports.init = function (expressApp, io, logins) {

    // Middleware
    expressApp.use(require('cookie-parser')());
    expressApp.use(require('body-parser').urlencoded({ extended: true }));
    var session = require('express-session');
    // var FileStore = require('session-file-store')(session); // For some reason, file store does not work
    var MemoryStore = require('express-session/session/memory');
    var store = new MemoryStore();
    expressApp.use(session({
        store: store,
        secret: 'fair-twitch-bots-sec', // Secret should be generated?
        resave: false,
        saveUninitialized: true
    }));
    
    expressApp.use(require('connect-flash')());
    expressApp.use(passport.initialize());
    expressApp.use(passport.session());

    // Socket io middleware
    io.use(passportSocketIo.authorize({
        key:          'connect.sid',
        secret:       'fair-twitch-bots-sec',
        store:        store,
        success:      onAuthorizeSuccess,
        fail:         onAuthorizeFail
    }));

    function onAuthorizeSuccess(req, accept) {
        accept();
    }
    
    function onAuthorizeFail(req, message, error, accept) {
        if (req.user.logged_in) {
            return accept();
        }
    }

    function findUser(login, callback) {
        for (var i = 0; i < logins.length; i++) {
            if (logins[i] === login) {
                callback({ login: logins[i] });
                return;
            }
        }
        callback(false);
    }

    passport.use(new LocalStrategy( {
            usernameField: 'password' // Username is same as password, else it will say missing credentials
        },
        function (username, password, callback) {
            findUser(password, function (user) {
                if (!user) {
                    return callback(null, false, { message: 'Incorrect password' });
                }
                return callback(null, user);
            });
        }
    ));

    passport.serializeUser(function(user, callback) {
        callback(null, user.login);
    });

    passport.deserializeUser(function(login, callback) {
        findUser(login, function (user) {
            callback(null, user);
        });
    });

    // Routes
    expressApp.post('/login', passport.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/',
        failureFlash: true
    }));

    expressApp.get('/logout', function (req, res) {
        req.logout();
        res.redirect('/');
    });


};