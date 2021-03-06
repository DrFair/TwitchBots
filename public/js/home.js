var users = [];
var currentChannel;
var currentRoomState;

$(function() { // On ready
    var socket = io();

    $.getJSON(apiURL + '/summary', function (data) {
        currentChannel = data.channel;
        currentRoomState = data.roomState;
        users = [];
        $('#botslist').empty();
        data.bots.sort((a,b ) => {
            return a.display_name.localeCompare(b.display_name);
        });
        for (var i = 0; i < data.bots.length; i++) {
            createUser(data.bots[i]);
        }
        updateFollowButton();
        updateRoomState();
        updateChat();
        onSelectedChange();
    });

    function createUser(user) {
        user.selected = false;
        $('#botslist').append('<a class="list-group-item text-center botselect" id="bot-'+ user.login + '"><b>' + user.display_name + '</b>' +
            '<span class="glyphicon glyphicon-ok" id="selected-' + user.login + '" aria-hidden="true" style="position: absolute; right: 6px; top: 12px"></span>' + // Selected span
            '<span id="followed-' + user.login + '" data-login="' + user.login + '" data-toggle="tooltip" data-placement="top" class="glyphicon glyphicon-heart" aria-hidden="true" style="position: absolute; right: 20px; top: 12px"></span>' + // Following span
            '</a>');
        $('#followed-' + user.login).tooltip({
            title: function () {
                var login = $(this).data('login');
                return 'Following ' + currentChannel + ' for ' + formatTime(new Date(Date.now() - users[login].followed));
            }
        });
        user.update = function () {
            if (this.selected) {
                $('#selected-' + this.login).show();
            } else {
                $('#selected-' + this.login).hide();
            }
            if (this.followed >= 0) {
                $('#followed-' + this.login).show();
            } else {
                $('#followed-' + this.login).hide();
            }
        };
        users[user.login] = user;
        user.update();
        $('#bot-' + user.login).click(function () {
            users[user.login].selected = !users[user.login].selected;
            users[user.login].update();
            onSelectedChange();
            return false; // Makes page not go to top
        });
    }

    $('#checkbots').click(function () {
        for (var login in users) {
            users[login].selected = true;
            users[login].update();
        }
        onSelectedChange();
    });

    $('#uncheckbots').click(function () {
        for (var login in users) {
            users[login].selected = false;
            users[login].update();
        }
        onSelectedChange();
    });

    function onSelectedChange() {
        // This is gonna update check all, uncheck all, follow and send message button.
        var totalUsers = 0;
        var selectedUsers = 0;
        var unfollowed = 0;
        for (var i in users) {
            totalUsers++;
            if (users[i].selected) {
                selectedUsers++;
                if (users[i].followed < 0) unfollowed++;
            }
        }

        $('#uncheckbots').prop('disabled', selectedUsers == 0);
        $('#checkbots').prop('disabled', selectedUsers == totalUsers);

        $('#followchannel').prop('disabled', unfollowed == 0);
        $('#messagesend').prop('disabled', selectedUsers == 0);
        
        $('#totalbots').html(totalUsers);

    }

    $('#messageform').submit(function(){
        $('#messageerror').html(''); // Clear message error
        var messageInput = $('#messageinput');
        var seconds = Number($('#messagerange').val());
        socket.emit('sendmessage', { seconds: seconds, msg: messageInput.val(), users: getSelectedUsers() } );
        messageInput.val(''); // Empty value
        return false;
    });

    socket.on('messageerror', function (err) {
        $('#messageerror').html(err);
    });

    $('#channelform').submit(function(){
        var channelInput = $('#channelinput');
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
        onSelectedChange();
    });

    $('#messagerange').on('change mousemove', function() {
        var value = $(this).val();
        $('#messagerangeoutput').text(value);
    });

    function updateChat() {
        $('#currentchannel').html(currentChannel);
        $('#currentchat').html('<iframe frameborder="0" scrolling="yes" id="' + currentChannel + '" src="http://www.twitch.tv/' + currentChannel + '/chat" height="680" width="100%"></iframe>')
    }

    $('#followchannel').click(function () {
        socket.emit('followchannel', { users: getSelectedUsers() } );
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
        $('#mentions').append('<li>' + mention + '</li>');
    }
    $('#clearmentions').click(function () {
        $('#mentions').empty();
    });
    socket.on('mention', function (message) {
        addMention(message);
    });

    function updateRoomState() {
        var html = '';
        
        if (Number(currentRoomState.emote_only) != 0) html += 'Emote only<br>';
        
        var followers = Number(currentRoomState.followers_only);
        if (followers == 0) html += 'Followers only<br>';
        else if (followers > 0) html += followers + 'm followers only<br>';
        
        if (Number(currentRoomState.r9k) != 0) html += 'r9k mode<br>';
        
        var slow = Number(currentRoomState.slow);
        if (slow > 0) html += slow + 's slow mode<br>';

        if (Number(currentRoomState.subs_only) != 0) html += 'Sub only mode<br>';
        
        $('#roomstate').html(html);
    }
    socket.on('roomstate', function (state) {
        currentRoomState = state;
        updateRoomState();
    });

    function getSelectedUsers() {
        var out = [];
        for (var i in users) {
            if (users[i].selected) {
                out.push(users[i].login);
            }
        }
        return out;
    }
});

function formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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