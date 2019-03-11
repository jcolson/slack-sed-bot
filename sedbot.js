'use strict';

const os = require('os');
var https = require('https');
var Ws = require('ws');
var im = require('imagemagick');
var tmp = require('tmp');
var request = require('request');
var fs = require('fs');
var path = require('path');

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
  onCommandHelp(channel, parameters, wsc) {
    let self = this;
    let commandText = 'Just use something simple like:\n';
    commandText += '`s/text to replace/text replaced with`\n';
    commandText += 'or\n';
    commandText += '`s/[tT]ext to replace/text replaced with/g`\n';
    commandText += 'or try a command:\n';
    commandText += '`.help`                - this help\n';
    commandText += '`.usa [any text]`      - USA Patriatic Text\n';
    commandText += '`.fra [any text]`      - France Patriatic Text\n';
    commandText += '`.ire [any text]`      - Ireland Patriatic Text\n';
    commandText += '`.wtr [location]?[m/u]`- get the current weather for [location]. [m] == metric, [u] == USCS\n';
    commandText += '`.about`               - get information about bot\n';
    commandText += '`.ping`                - ping the bot\n';
    self.respond(channel, commandText, wsc);
    return commandText;
  }
  onCommandPing(channel, parameters, wsc) {
    let self = this;
    let commandText = 'PONG\n';
    self.respond(channel, commandText, wsc);
    return commandText;
  }
  onCommandAbout(channel, parameters, wsc) {
    let self = this;
    let commandText = 'OS: ' + os.platform() + ' / ' + os.release() + '\n';
    commandText += 'Host: ' + os.hostname() + '\n';
    commandText += 'Uptime: ' + (os.uptime() / 60 / 60 / 24).toFixed(2) + ' days\n';
    commandText += 'Load: ' + os.loadavg()[0].toFixed(2) + ' / ' +  os.loadavg()[1].toFixed(2) + ' / ' + os.loadavg()[2].toFixed(2) + '\n';
    self.respond(channel, commandText, wsc);
  }
  onCommandColoredText(channel, parameters, wsc, colors) {
    let self = this;
    var tmpobj = tmp.fileSync({ mode: '0644', prefix: 'sedbot-', postfix: '.png' });
    console.log('File: ', tmpobj.name);
    console.log('Filedescriptor: ', tmpobj.fd);
    let imCommandLine = ['-background', 'transparent'];
    for (let i = 0; i < parameters.length; i++) {
      let currentChar = parameters.substring(i, i + 1);
      imCommandLine.push('\(');
      imCommandLine.push('-fill');
      imCommandLine.push(colors[i % 3]);
      imCommandLine.push('-font');
      imCommandLine.push('Helvetica');
      imCommandLine.push('-pointsize');
      imCommandLine.push('60');
      imCommandLine.push('label:' + currentChar);
      imCommandLine.push('\)');
    }
    imCommandLine.push('+append');
    imCommandLine.push(tmpobj.name);
    let commandText = 'convert';
    im.convert(imCommandLine,
      function(err, stdout){
        if (err) {
          console.error(err);
          commandText = err.message;
        } else {
          console.log('stdout: ', stdout);
          for (let commandParam of imCommandLine) {
            commandText += ' ';
            commandText += commandParam;
          }
        }
        self.upload(colors[0] + ',' + colors[1] + ',' + colors[2], tmpobj, channel);
        console.log('imagemagick command issued: '+commandText);
        // self.respond(channel, commandText, wsc);
      });
  }
  respond(channel, commandText, wsc) {
    let sendCommandData = {
      type: 'message',
      channel: channel,
      text: commandText,
    };
    wsc.send(JSON.stringify(sendCommandData));
  }
  upload(title, file, channel) {
    let self = this;
    request.post({
      url: 'https://slack.com/api/files.upload',
      formData: {
        token: self.config.token,
        title: title,
        filename: path.basename(file.name),
        filetype: 'auto',
        channels: channel,
        file: fs.createReadStream(file.name),
      },
    }, function(err, response) {
      console.log(JSON.parse(response.body));
      console.error(err);
    });
  }
  onCommandWeather(channel, parameters, wsc) {
    let self = this;
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
        self.respond(channel, body, wsc);
      });
    }).on('error', (e) => {
      console.error('received error: ' + e.message);
    });
  }
  handleCommands(messageData, wsc) {
    const self = this;
    let commands = ['HELP', 'PING', 'ABOUT', 'WTR', 'USA', 'FRA', 'IRE'];
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
    let substringTo = messageData.text.substring(substringFrom).indexOf(' ');
    if (substringTo === -1) {
      substringTo = messageData.text.length;
    } else {
      substringTo = substringTo + substringFrom;
    }
    let possibleCommand = messageData.text.substring(substringFrom, substringTo).toUpperCase();
    if (commands.includes(possibleCommand)) {
      commandMatch = possibleCommand;
      parameters = messageData.text.substring(substringTo + 1);
    }
    if (commandMatch !== null) {
      if (commandMatch === 'HELP') {
        self.onCommandHelp(messageData.channel, parameters, wsc);
      } else if (commandMatch === 'PING') {
        self.onCommandPing(messageData.channel, parameters, wsc);
      } else if (commandMatch === 'ABOUT') {
        self.onCommandAbout(messageData.channel, parameters, wsc);
      } else if (commandMatch === 'WTR') {
        self.onCommandWeather(messageData.channel, parameters, wsc);
      } else if (commandMatch === 'USA') {
        self.onCommandColoredText(messageData.channel, parameters, wsc, ['red', 'white', 'blue']);
      } else if (commandMatch === 'FRA') {
        self.onCommandColoredText(messageData.channel, parameters, wsc, ['blue', 'white', 'red']);
      } else if (commandMatch === 'IRE') {
        self.onCommandColoredText(messageData.channel, parameters, wsc, ['green', 'white', 'orange']);
      }
    }
  }
  handleSed(messageData, wsc) {
    var self = this;
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
              console.error('Didn\'t find user in map');
            }
            var newText = 'Correction, *' + sender + '* ...\n' + this.history[messageData.channel][i].text.replace(matcher, ' *' + sedMatch[3] + '* ');
            self.respond(messageData.channel, newText, wsc);
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
