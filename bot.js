'use strict';

const os = require('os');
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

      let commands = ['HELP', 'PING', 'ABOUT', 'WTR'];
      let sedId = '<@' + userMapByName['sed'].id + '> ';
      let commandMatch = null;
      let parameters = null;
      let substringFrom = -1;
      if (messageData.text.startsWith(sedId)) {
        substringFrom = sedId.length;
      } else if (messageData.text.startsWith('sed ')) {
        substringFrom = 'sed '.length;
      } else if (messageData.text.startsWith('.')) {
        substringFrom = '.'.length;
      }
      // console.log('substringFrom: '+substringFrom);
      let substringTo = messageData.text.substring(substringFrom).indexOf(' ');
      if (substringTo === -1) {
        substringTo = messageData.text.length;
      } else {
        substringTo = substringTo + substringFrom;
      }
      // console.log('substringTo: ' + substringTo);
      let possibleCommand = messageData.text.substring(substringFrom, substringTo).toUpperCase();
      // console.log('possibleCommand: ' + possibleCommand);
      if (commands.includes(possibleCommand)) {
        commandMatch = possibleCommand;
        parameters = messageData.text.substring(substringTo + 1);
      }
      // console.log('commandmatch: '+commandMatch);
      // console.log('parameters: '+parameters);

      // console.log('commandMatch = "' + commandMatch + '"');
      if (commandMatch !== null) {
        let commandText = '';
        // console.log('matched a command: ' + commandMatch);
        if (commandMatch === 'HELP') {
          commandText = 'Just use something simple like:\n';
          commandText += '`s/text to replace/text replaced with`\n';
          commandText += 'or\n';
          commandText += '`s/[tT]ext to replace/text replaced with/g`\n';
          commandText += 'or try a command:\n';
          commandText += '`.help`                - this help\n';
          commandText += '`.wtr [location]?[m/u]`- get the current weather for [location]. [m] == metric, [u] == USCS\n';
          commandText += '`.about`               - get information about bot\n';
          commandText += '`.ping`                - ping the bot\n';
        } else if (commandMatch === 'PING') {
          commandText = 'PONG\n';
        } else if (commandMatch === 'ABOUT') {
          commandText = 'OS: ' + os.platform() + ' / ' + os.release() + '\n';
          commandText += 'Host: ' + os.hostname() + '\n';
          commandText += 'Uptime: ' + (os.uptime() / 60 / 60 / 24).toFixed(2) + ' days\n';
          commandText += 'Load: ' + os.loadavg()[0].toFixed(2) + ' / ' +  os.loadavg()[1].toFixed(2) + ' / ' + os.loadavg()[2].toFixed(2) + '\n';
        } else if (commandMatch === 'WTR') {
          let format = 'format=4';
          if (parameters.indexOf('?') === -1) {
            format = '?' + format;
          } else {
            format = '&' + format;
          }
          let options = {
            protocol: 'https:',
            host: 'wttr.in',
            port: '443',
            path: encodeURI('/' + parameters + format),
            headers: {
              Accept: 'text/plain',
              'User-Agent': 'like curl',
            },
          };
          https.get(options, (response) => {
            // console.log('statusCode:', response.statusCode);
            // console.log('headers:', response.headers);
            let body = '';
            response.on('data', (data) => {
              body += data;
            });
            response.on('end', function() {
              // console.log(body);
              if (body.indexOf('Error') !== -1) {
                body = 'Error encountered, try a different location';
              }
              let sendCommandData = {
                type: 'message',
                channel: messageData.channel,
                text: body,
              };
              wsc.send(JSON.stringify(sendCommandData));
            });
          }).on('error', (e) => {
            console.error('received error: ' + e.message);
          });
        }
        if (commandText !== '') {
          let sendCommandData = {
            type: 'message',
            channel: messageData.channel,
            text: commandText,
          };
          wsc.send(JSON.stringify(sendCommandData));
        }
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
              var sender = '_Unknown user_';
              try {
                sender = userMap[history[messageData.channel][i].user].real_name;
              } catch (e) {
              }
              var newText = 'Correction, *' + sender + '* ...\n' + history[messageData.channel][i].text.replace(matcher, ' *' + sedMatch[3] + '* ');
              var sendData = {
                type: 'message',
                channel: messageData.channel,
                text: newText,
                mrkdwn: true,
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
