var users = [];
var currentChannel;

$(function() { // On ready
    var socket = io();

    $.getJSON(apiURL + '/summary', function (data) {
        currentChannel = data.channel;
        users = [];
        $("#botslist").empty();
        data.bots.sort((a,b ) => {
            return a.display_name.localeCompare(b.display_name);
        });
        for (var i = 0; i < data.bots.length; i++) {
            createUser(data.bots[i]);
        }
        updateFollowButton();
        updateChat();
    });

    function createUser(user) {
        user.update = function () {
            var button = $("#bot-" + this.login);
            if (!button.length) {
                $("#botslist").append('<a class="list-group-item text-center botselect" id="bot-'+ this.login + '">' + this.display_name + '</a>');
                button = $("#bot-" + this.login);
            }
            button.empty();
            button.append(this.display_name);
            if (this.selected) {
                button.append('<span class="glyphicon glyphicon-ok" aria-hidden="true" style="position: absolute; right: 6px; top: 12px"></span>');
            }
            if (this.followed >= 0) {
                button.append('<span id="followed-' + this.login + '" data-login="' + this.login + '" data-toggle="tooltip" data-placement="top" class="glyphicon glyphicon-heart" aria-hidden="true" style="position: absolute; right: 20px; top: 12px"></span>');
                $('#followed-' + this.login).tooltip({
                    title: function () {
                        var login = $(this).data('login');
                        return 'Following ' + currentChannel + ' for ' + formatTime(new Date(Date.now() - users[login].followed));
                    }
                });
            }
        };
        users[user.login] = user;
        user.update();
        $("#bot-" + user.login).click(function () {
            users[user.login].selected = !users[user.login].selected;
            socket.emit('botselected', user.login);
            users[user.login].update();
            return false; // Makes page not go to top
        });
    }

    socket.on('botselected', function (user) {
        var login = user.login;
        if (users[login]) {
            users[login].selected = user.selected;
            users[login].update();
        }
    });

    $("#checkbots").click(function () {
        socket.emit("checkbots", "");
        for (var login in users) {
            users[login].selected = true;
            users[login].update();
        }
    });
    socket.on('checkbots', function () {
        for (var login in users) {
            users[login].selected = true;
            users[login].update();
        }
    });
    $("#uncheckbots").click(function () {
        socket.emit("uncheckbots", "");
        for (var login in users) {
            users[login].selected = false;
            users[login].update();
        }
    });
    socket.on('uncheckbots', function () {
        for (var login in users) {
            users[login].selected = false;
            users[login].update();
        }
    });

    $('#messageform').submit(function(){
        var messageInput = $("#messageinput");
        var seconds = Number($("#messagerange").val());
        socket.emit('sendmessage', { seconds: seconds, msg: messageInput.val() } );
        messageInput.val(''); // Empty value
        return false;
    });

    $('#channelform').submit(function(){
        var channelInput = $("#channelinput");
        socket.emit('setchannel',channelInput.val());
        channelInput.val(''); // Empty value
        return false;
    });
    socket.on('setchannel', function (data) {
        currentChannel = data.channel;
        for (var i = 0; i < data.followed.length; i++) {
            var login = data.followed[i].login;
            if (users[login]) {
                users[login].followed = data.followed[i].followed;
                users[login].update();
            }
        }
        updateFollowButton();
        updateChat();
    });

    socket.on('addbot', function (bot) {
        createUser(bot);
    });

    $("#messagerange").on('change mousemove', function() {
        var value = $(this).val();
        $("#messagerangeoutput").text(value);
    });

    function updateChat() {
        $("#currentchannel").html(currentChannel);
        $("#currentchat").html('<iframe frameborder="0" scrolling="yes" id="' + currentChannel + '" src="http://www.twitch.tv/' + currentChannel + '/chat" height="600" width="100%"></iframe>')
    }

    $("#followchannel").click(function () {
        socket.emit("followchannel", "");
    });
    socket.on('followchannel', function (data) {
        for (var i = 0; i < data.followed.length; i++) {
            var login = data.followed[i].login;
            if (users[login]) {
                users[login].followed = data.followed[i].followed;
                users[login].update();
            }
        }
        updateFollowButton();
    });
    
    function updateFollowButton() {
        var followButton = $('#followchannel');
        followButton.prop('disabled', true);
        for (var login in users) {
            if (users[login].followed <= 0) {
                followButton.prop('disabled', false);
                break;
            }
        }
    }

    function addMention(mention) {
        $("#mentions").append('<li>' + mention + '</li>');
    }
    $("#clearmentions").click(function () {
        $("#mentions").empty();
    });
    socket.on('mention', function (message) {
        addMention(message);
    });
});

function formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatTime(date) {
    var days = date.getUTCDate() - 1;
    var hours = date.getUTCHours();
    var minutes = date.getUTCMinutes();
    return (days > 0 ? days + "d " : "") + // Date starts at 1 instead of 0
        (hours > 0 ? hours + "h " : "") +
        (minutes > 0 ? minutes + "m " : "") +
        date.getUTCSeconds() + "s";
}