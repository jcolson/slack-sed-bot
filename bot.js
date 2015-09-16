var https = require('https');
var ws = require('ws');

if (process.argv.length < 3) {
    console.log('You must pass Slack API bot token as an argument.');
    process.exit(1);
}

var token = process.argv[2];

if (!/^\w+-\w+-\w+$/.test(token)) {
    console.log('Token format is invalid.');
    process.exit(1);
}

var history = {};
var keepHistory = 20;
// 1 is delimiter; 2 is "search"; 3 is "replace", 4 are flags (or undefined).
var sedRegex = /(?:^|\s)s([^\w\s])(.+)\1(.+)\1([a-z])*/;
var userMap = {};

https.get('https://slack.com/api/rtm.start?token=' + token + '&simple_latest=true&no_unreads=true', function (res) {
    var body = '';
    res.on('data', function (data) {
        body += data.toString();
    });
    res.on('end', function () {
        var data = JSON.parse(body);
        if (!data.ok) {
            console.log('Slack API returned the following error: ' + data.error);
            process.exit(1);
        }
        data.users.map(function (user) {
            userMap[user.id] = user;
        });
        var wsUrl = data.url;
        var wsc = new ws(wsUrl);
        wsc.on('message', function (message) {
            console.log(message);
            var messageData = JSON.parse(message);
            if (messageData.type !== 'message') {
                return;
            }

            if (typeof messageData.text !== 'string') {
                // This is probably a message edit - ignore those completely.
                return;
            }

            var sedMatch = messageData.text.match(sedRegex);

            if (sedMatch === null) {
                // Don't save replacement commands (messages) to history.
                if (typeof history[messageData.channel] === 'undefined') {
                    history[messageData.channel] = [];
                }
                history[messageData.channel].push(messageData);
                if (history[messageData.channel].length > keepHistory) {
                    history[messageData.channel].shift();
                }
                return;
            }

            // Check if the command can be compiled.
            try {
                var matcher = new RegExp(sedMatch[2], sedMatch[4]);
            } catch (e) {
                // Not a valid regular expression.
                return;
            }

            // This is a sed replace command, look for target message from the history in reverse.
            for (var i = history[messageData.channel].length - 1; i >= 0; i--) {
                if (matcher.test(history[messageData.channel][i].text)) {
                    // Matching message found, send the replacement and exit.

                    // Fallback user, in case someone new joined. Not handled ATM.
                    var sender = 'Unknown user (Welcome!)';
                    try {
                        sender = userMap[history[messageData.channel][i].user].real_name;
                    } catch (e) {
                    }
                    var newText = "*" + sender + ":*\n" + history[messageData.channel][i].text.replace(matcher, sedMatch[3]);
                    var sendData = {
                        type: 'message',
                        channel: messageData.channel,
                        text: newText
                    };
                    wsc.send(JSON.stringify(sendData));
                    return;
                }
            }
        })
    });
});
