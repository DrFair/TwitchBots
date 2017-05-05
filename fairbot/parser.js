exports.createUser = function(args, tags) {
    let user = {};
    let argsSplit = args[0].split(":");
    if (argsSplit.length > 1) user.msg = argsSplit[1];
    let channelSplit = argsSplit[0].split(" ");
    if (channelSplit.length > 2) user.channel = channelSplit[2];
    user.display_name = tags["display-name"];
    user.user_id = Number(tags["user-id"]);
    user.mod = Number(tags["mod"]) === 1;
    user.subscriber = Number(tags["subscriber"]) === 1;
    user.turbo = Number(tags["turbo"]) === 1;
    user.user_type = tags["user-type"];
    if (tags["color"]) user.color = tags["color"];
    if (tags["badges"]) user.badges = tags["badges"];
    if (tags["emotes"]) user.emotes = tags["emotes"];
    if (tags["bits"]) user.bits = tags["bits"];
    if (tags["message"]) user.message = tags["message"];
    return user;
};