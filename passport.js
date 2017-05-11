var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

exports.init = function (expressApp, logins) {

    // Middleware
    expressApp.use(require('cookie-parser')());
    expressApp.use(require('body-parser').urlencoded({ extended: true }));
    expressApp.use(require('express-session')({ secret: 'fair-twitch-bots-sec', resave: false, saveUninitialized: false })); // Secret should be generated?
    
    expressApp.use(require('connect-flash')());
    expressApp.use(passport.initialize());
    expressApp.use(passport.session());

    function findUser(username, callback) {
        for (var i = 0; i < logins.length; i++) {
            if (logins[i].username === username) {
                callback(logins[i]);
                return;
            }
        }
        callback(false);
    }

    passport.use(new LocalStrategy( {},
        function (username, password, callback) {
            findUser(username, function (user) {
                if (!user) {
                    return callback(null, false, { message: 'Cannot find username' });
                }
                if (user.password !== password) {
                    return callback(null, false, { message: 'Incorrect password' });
                }
                return callback(null, user);
            });
        }
    ));

    passport.serializeUser(function(user, callback) {
        callback(null, user.username);
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