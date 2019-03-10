'use strict';

const os = require('os');
var https = require('https');
var Ws = require('ws');

class Sedbot {
  constructor(config) {
    this.config = config;
    console.log('The token you provided: ' + this.config.token);
    if (!/^\w+-\w+-\w+-\w+$/.test(this.config.token)) {
      console.log('Token format is invalid.');
      process.exit(1);
    }
    this.history = {};
    this.keepHistory = 20;
    // 1 is delimiter; 2 is "search"; 3 is "replace", 4 are flags (or undefined).
    // var sedRegex = /(?:^|\s)s([^\w\s])(.+)\1(.+)\1([a-z])*/; // original
    this.sedRegex = /(?:^|\s)s([^\w\s])([\-\(\)\*\[\]\s\w]+)\1([\-\(\)\*\[\]\s\w]+)\1?([\-\(\)\*\[\]\w]+)*/;
    this.userMap = {};
    this.userMapByName = {};
  }
  mapUsers(users) {
    const self = this;
    users.map(function(user) {
      self.userMap[user.id] = user;
      self.userMapByName[user.name] = user;
    // console.log(JSON.stringify(user));
    });
  }
  handleCommands(messageData, wsc) {
    let commands = ['HELP', 'PING', 'ABOUT', 'WTR'];
    let sedId = '<@' + this.userMapByName['sed'].id + '> ';
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
  }
  handleSed(messageData, wsc) {
    var sedMatch = messageData.text.match(this.sedRegex);
    if (sedMatch === null) {
      // Don't save replacement commands (messages) to history.
      if (typeof this.history[messageData.channel] === 'undefined') {
        this.history[messageData.channel] = [];
      }
      this.history[messageData.channel].push(messageData);
      if (this.history[messageData.channel].length > this.keepHistory) {
        this.history[messageData.channel].shift();
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
      if (typeof this.history[messageData.channel] !== undefined) {
        for (var i = this.history[messageData.channel].length - 1; i >= 0; i--) {
          if (matcher.test(this.history[messageData.channel][i].text)) {
            // Matching message found, send the replacement and exit.

            // Fallback user, in case someone new joined. Not handled ATM.
            var sender = '_Unknown user_';
            try {
              sender = this.userMap[this.history[messageData.channel][i].user].real_name;
            } catch (e) {
            }
            var newText = 'Correction, *' + sender + '* ...\n' + this.history[messageData.channel][i].text.replace(matcher, ' *' + sedMatch[3] + '* ');
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
  }
  onMessage(message, wsc) {
    const self = this;
    console.log(message);
    var messageData = JSON.parse(message);
    if (messageData.type !== 'message') {
      return;
    }

    if (typeof messageData.text !== 'string') {
      // This is probably a message edit - ignore those completely.
      return;
    }
    self.handleCommands(messageData, wsc);
    self.handleSed(messageData, wsc);
  }
  listen() {
    const self = this;
    https.get('https://slack.com/api/rtm.start?token=' + this.config.token + '&simple_latest=true&no_unreads=true', function(res) {
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
        self.mapUsers(data.users);

        var wsUrl = data.url;
        var wsc = new Ws(wsUrl);
        wsc.on('message', function(message) {
          self.onMessage(message, wsc);
        });
      });
    });
  }
}
exports.Sedbot = Sedbot;
