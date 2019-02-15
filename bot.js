'use strict';

var https = require('https');
var Ws = require('ws');

if (process.argv.length < 3) {
  console.log('You must pass Slack API bot token as an argument.');
  process.exit(1);
}

var token = process.argv[2];

if (!/^\w+-\w+-\w+-\w+$/.test(token)) {
  console.log('Token format is invalid.');
  process.exit(1);
}

var history = {};
var keepHistory = 20;
// 1 is delimiter; 2 is "search"; 3 is "replace", 4 are flags (or undefined).
// var sedRegex = /(?:^|\s)s([^\w\s])(.+)\1(.+)\1([a-z])*/;
var sedRegex = /(?:^|\s)s([^\w\s])([\-\(\)\*\[\]\s\w]+)\1([\-\(\)\*\[\]\s\w]+)\1?([\-\(\)\*\[\]\w]+)*/;
var userMap = {};
var userMapByName = {};

https.get('https://slack.com/api/rtm.start?token=' + token + '&simple_latest=true&no_unreads=true', function(res) {
  var body = '';
  res.on('data', function(data) {
    body += data.toString();
  });
  res.on('end', function() {
    var data = JSON.parse(body);
    if (!data.ok) {
      console.log('Slack API returned the following error: ' + data.error);
      process.exit(1);
    }
    data.users.map(function(user) {
      userMap[user.id] = user;
      userMapByName[user.name] = user;
      // console.log(JSON.stringify(user));
    });
    var wsUrl = data.url;
    var wsc = new Ws(wsUrl);
    wsc.on('message', function(message) {
      console.log(message);
      var messageData = JSON.parse(message);
      if (messageData.type !== 'message') {
        return;
      }

      if (typeof messageData.text !== 'string') {
        // This is probably a message edit - ignore those completely.
        return;
      }

      var commands = ['HELP', 'ECHO'];
      var sedId = '<@' + userMapByName['sed'].id + '> ';
      var commandMatch = null;
      if (messageData.text.startsWith(sedId)) {
        var possibleCommand = messageData.text.substring(sedId.length).toUpperCase();
        if (commands.includes(possibleCommand)) {
          commandMatch = possibleCommand;
        }
      }
      // console.log('commandMatch = "' + commandMatch + '"');
      if (commandMatch !== null) {
        var commandText = '?';
        // console.log('matched a command: ' + commandMatch);
        if (commandMatch === 'HELP') {
          commandText = 'You askin\' for help with sed??\n';
          commandText += 'Just use something simple like:\n';
          commandText += '`s/text to replace/text replaced with`\n';
          commandText += 'or\n';
          commandText += '`s/[tT]ext to replace/text replaced with/g`\n';
        } else if (commandMatch === 'ECHO') {
          commandText = 'ECHO WUT\n';
        }
        var sendCommandData = {
          type: 'message',
          channel: messageData.channel,
          text: commandText,
        };
        wsc.send(JSON.stringify(sendCommandData));
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
        console.log('not a valid regex: ' + sedMatch[2] + ' ' + sedMatch[4]);
        // Not a valid regular expression.
        return;
      }
      try {
      // This is a sed replace command, look for target message from the history in reverse.
        if (typeof history[messageData.channel] !== undefined) {
          for (var i = history[messageData.channel].length - 1; i >= 0; i--) {
            if (matcher.test(history[messageData.channel][i].text)) {
              // Matching message found, send the replacement and exit.

              // Fallback user, in case someone new joined. Not handled ATM.
              var sender = 'Unknown user (Welcome!)';
              try {
                sender = userMap[history[messageData.channel][i].user].real_name;
              } catch (e) {
              }
              var newText = '*' + sender + ':*\n' + history[messageData.channel][i].text.replace(matcher, sedMatch[3]);
              var sendData = {
                type: 'message',
                channel: messageData.channel,
                text: newText,
              };
              wsc.send(JSON.stringify(sendData));
              return;
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  });
});
