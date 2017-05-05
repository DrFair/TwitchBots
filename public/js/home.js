var users = [];

$(function() { // On ready
    var socket = io();

    $(".botselect").each(function() {
        var button = $(this);
        createUser(button.data("login"), button.data("displayname"), button.data("selected") == "y");
    });

    function createUser(login, displayName, selected) {
        var user = {
            login: login,
            selected: selected,
            display_name: displayName,
            update: function () {
                var button = $("#bot-" + this.login);
                if (!button.length) {
                    $("#botslist").append('<a class="list-group-item text-center botselect" id="bot-'+ this.login + '">' + this.display_name + '</a>');
                }
                button.empty();
                button.append(this.display_name);
                if (this.selected) {
                    button.append('<span class="glyphicon glyphicon-ok" aria-hidden="true" style="position: absolute; right: 12px; top: 12px"></span>');
                }
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
        users[login].selected = user.selected;
        users[login].update();
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
    socket.on('setchannel', function (channel) {
        $("#currentchannel").html(channel);
        updateChat(channel);
    });

    socket.on('addbot', function (bot) {
        createUser(bot.login, bot.display_name, bot.selected);
    });

    $("#messagerange").on('change mousemove', function() {
        var value = $(this).val();
        $("#messagerangeoutput").text(value);
    });

    function updateChat(channel) {
        $("#currentchat").html('<iframe frameborder="0" scrolling="yes" id="' + channel + '" src="http://www.twitch.tv/' + channel + '/chat" height="600" width="100%"></iframe>')
    }
    updateChat($("#currentchannel").text());

    $("#followchannel").click(function () {
        socket.emit("followchannel", "");
    });

    function addMention(mention) {
        $("#mentions").append('<li>' + mention + '</li>');
    }

    $("#clearmentions").click(function () {
        $("#mentions").empty();
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