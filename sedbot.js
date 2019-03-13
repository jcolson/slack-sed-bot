'use strict';

const os = require('os');
var https = require('https');
var Ws = require('ws');
var im = require('imagemagick');
var tmp = require('tmp');
var request = require('request');
var fs = require('fs');
var path = require('path');
const _DATABASE = 'sedbot-database.json';

class Sedbot {
  constructor(config) {
    this.config = config;
    console.log('The token you provided: ' + this.config.token);
    console.log('The kick token you provided: ' + this.config.kicktoken);
    console.log('The duck percent you provided: ' + this.config.duckpercent);
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
    this.databaseJson = {};
    this.duckIsLoose = false;
    this.lastDuckUser = 'NONE YET';
    this.lastDuckChannel = 'NONE YET';
    this.readDB();
  }
  persistDB() {
    const self = this;
    fs.writeFileSync(path.resolve(__dirname, _DATABASE), JSON.stringify(self.databaseJson), 'utf8');
    console.log('wrote database json');
  }
  readDB() {
    const self = this;
    try {
      self.databaseJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, _DATABASE), 'utf8'));
    } catch (e) {
      console.error('Caught exception loading database, initializing.', e);
      self.initializDB();
    }
    console.log('read database json');
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
    commandText += '`.help`\t\t\t\t\t\t\t- this help\n';
    commandText += '`.about`\t\t\t\t\t\t- Helpful information about bot\n';
    commandText += '`.ping`\t\t\t\t\t\t\t- Ping the bot\n';
    commandText += '`.usa [any text]`\t\t- USA Patriotic Text\n';
    commandText += '`.fra [any text]`\t\t- France Patriotic Text\n';
    commandText += '`.ire [any text]`\t\t- Ireland Patriotic Text\n';
    commandText += '`.wal [any text]`\t\t- Wales Patriotic Text\n';
    commandText += '`.wtr [location]?[m/u]`- Retrieve the current weather for [location]. [m] == metric, [u] == USCS\n';
    commandText += '`.ducks [username]`\t- How many ducks have you/username befriended or harvested?\n';
    commandText += '`.bang`\t\t\t\t\t\t\t- Harvest a duck!\n';
    commandText += '`.bef`\t\t\t\t\t\t\t\t- Befriend a duck ...\n';
    commandText += '`.8 [important question]`- Ask the Magic 8 Ball an important question\n';
    self.respond(channel, commandText, wsc);
    return commandText;
  }
  onCommandPing(channel, parameters, wsc) {
    let self = this;
    let commandText = 'PONG, my current time is ... ' + new Date().toLocaleTimeString() + '\n';
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
  onCommandDucks(user, channel, parameters, wsc) {
    const self = this;
    let commandText = '';
    if (self.duckIsLoose) {
      commandText += '*There is a duck currently flying around loose!!!*\n';
    }
    if (parameters) {
      user = parameters.substring(2, parameters.length - 1);
      console.log('Getting duck status for specific user: ' + user);
    }
    if (!self.userMap[user]) {
      commandText += 'Looked for that user, but had no luck finding his/her duck count!';
    } else {
      if (!self.databaseJson.ducks[user]) {
        self.initializeDucksForUser(user);
      }
      // console.log(JSON.stringify(self.databaseJson));
      commandText += '*' + self.userMap[user].real_name + '* has harvested *' + self.databaseJson.ducks[user].killed + '* and befriended *' + self.databaseJson.ducks[user].friend + '* ducks\n';
      if (!parameters) {
        commandText += self.findTop5Ducks();
      }
    }
    self.respond(channel, commandText, wsc);
  }
  onCommandDuckBangFriend(user, channel, parameters, wsc, shot) {
    const self = this;
    let commandText = 'bang';
    if (self.duckIsLoose) {
      self.duckIsLoose = false;
      if (!self.databaseJson.ducks[user]) {
        self.initializeDucksForUser(user);
      }
      if (shot) self.databaseJson.ducks[user].killed++;
      else self.databaseJson.ducks[user].friend++;
      commandText = self.userMap[user].real_name + ' just ' + (shot ? 'shot' : 'befriended')
      + ' a duck!  Your total duck harvests: *'
      + (shot ? self.databaseJson.ducks[user].killed : self.databaseJson.ducks[user].friend)
      + '*\n';
      self.lastDuckUser = user;
      self.lastDuckChannel = channel;
    } else {
      commandText = self.userMap[user].real_name
      + ', there is no duck ... what are you '
      + (shot ? 'shooting at' : 'trying to friend')
      + ' there Elmer Fud??\n*'
      + (self.userMap[self.lastDuckUser] ? self.userMap[self.lastDuckUser].real_name : 'NONE YET')
      + '* was the last successful harvestor in channel *'
      + self.lastDuckChannel
      + '*\nYour penalty is channel ejection!\n';
      self.kick(user, channel);
    }
    self.respond(channel, commandText, wsc);
  }
  doDucks(wsc) {
    const self = this;
    if (!self.duckIsLoose) {
      let randomCheck = Math.floor((Math.random() * 100));
      console.log('randomCheck: ' + randomCheck);
      if (randomCheck < this.config.duckpercent) {
        let commandText = 'There is a duck is loose!  *.bef* (riend) it or *.bang* (harvest) it!\n';
        self.duckIsLoose = true;
        let channelIndex = Math.floor((Math.random() * self.config.duckchannels.length));
        console.log(self.config.duckchannels);
        let randomChannel = '';
        if (self.config.duckchannels) {
          randomChannel = self.config.duckchannels[channelIndex];
        } else {
          randomChannel = self.retrieveRandomConversationChannel(self.userMapByName['sed'].id);
        }
        self.respond(randomChannel, commandText, wsc);
        console.log('let a duck loose in: ' + randomChannel);
      } else {
        console.log('not letting a duck loose');
      }
    } else {
      console.log('duck is already loose, no need to try and let one go');
    }
  }
  findTop5Ducks() {
    const self = this;
    let commandText = '*Best duck marksmen:*\n';
    Object.keys(self.databaseJson.ducks).map(key => ({ key: key, value: self.databaseJson.ducks[key] }))
      .sort((first, second) => (first.value.killed < second.value.killed) ? 1 : (first.value.killed > second.value.killed) ? -1 : 0)
      .forEach((sortedData) => {
        commandText += self.userMap[sortedData.key].real_name;
        commandText += ' - Ducks Harvested: *' + sortedData.value.killed;
        commandText += '*\n';
      });
    commandText += '*Best duck friends:*\n';
    Object.keys(self.databaseJson.ducks).map(key => ({ key: key, value: self.databaseJson.ducks[key] }))
      .sort((first, second) => (first.value.friend < second.value.friend) ? 1 : (first.value.friend > second.value.friend) ? -1 : 0)
      .forEach((sortedData) => {
        commandText += self.userMap[sortedData.key].real_name;
        commandText += ' - Ducks Befriended: *' + sortedData.value.friend;
        commandText += '*\n';
      });
    return commandText;
  }
  initializDB() {
    const self = this;
    if (!self.databaseJson.ducks) {
      console.log('populating empty ducks for first time');
      self.databaseJson.ducks = {};
    }
  }
  initializeDucksForUser(user) {
    const self = this;
    console.log('initialize duck count');
    self.databaseJson.ducks[user] = {};
    self.databaseJson.ducks[user].killed = 0;
    self.databaseJson.ducks[user].friend = 0;
    console.log(JSON.stringify(self.databaseJson));
  }
  onCommand8Ball(user, channel, parameters, wsc) {
    let self = this;
    let ballAnswers = ['It is certain.', 'It is decidedly so.', 'Without a doubt.',
      'Yes - definitely.', 'You may rely on it.', 'As I see it, yes.', 'Most likely.',
      'Outlook good.', 'Yes.', 'Signs point to yes.', 'Reply hazy, try again.',
      'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
      'Don\'t count on it.', 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'];
    let commandText = 'Example Usage:\n`.8 Will I win the lottery tomorrow?`\n';
    // console.log(user);
    if (parameters !== '') {
      commandText = '*';
      commandText += this.userMap[user].real_name;
      commandText += '* wants to know: *';
      commandText += parameters;
      commandText += '???* ... \nThe Magic 8 Ball says ... \n_';
      commandText += ballAnswers[Math.floor((Math.random() * (ballAnswers.length - 1)))];
      commandText += '_';
    }
    self.respond(channel, commandText, wsc);
  }
  onCommandColoredText(channel, parameters, wsc, colors) {
    let self = this;
    var tmpobj = tmp.fileSync({ mode: '0644', prefix: 'sedbot-', postfix: '.png' });
    // console.log('File: ', tmpobj.name);
    // console.log('Filedescriptor: ', tmpobj.fd);
    let imCommandLine = ['-background', 'transparent'];
    let ii = 0;
    for (let i = 0; i < parameters.length; i++) {
      let currentChar = parameters.substring(i, i + 1);
      if (currentChar === ' ') {
        currentChar = '\\ ';
        ii++;
      }
      imCommandLine.push('\(');
      imCommandLine.push('-fill');
      imCommandLine.push(colors[(i - ii) % 3]);
      imCommandLine.push('-font');
      imCommandLine.push('AvantGarde');
      imCommandLine.push('-pointsize');
      imCommandLine.push('60');
      imCommandLine.push('label:' + currentChar);
      imCommandLine.push('\)');
    }
    imCommandLine.push('+append');
    imCommandLine.push(tmpobj.name);
    let imageMagickCommand = '';
    im.convert(imCommandLine,
      function(err, stdout){
        if (err) {
          console.error('imagemagick exception: ' + err.message);
          console.error(err);
          imageMagickCommand = err.message;
        }
        imageMagickCommand += 'convert ';
        // console.log('stdout: ', stdout);
        for (let commandParam of imCommandLine) {
          imageMagickCommand += ' ';
          imageMagickCommand += commandParam;
        }
        self.upload(colors[0] + ',' + colors[1] + ',' + colors[2], tmpobj, channel);
        console.log('imagemagick command issued: ' + imageMagickCommand);
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
      console.error('Caught exception: ' + err);
      console.error(JSON.parse(response.body));
    });
  }
  kick(user, channel) {
    let self = this;
    console.log('kicking ' + user + ' from ' + channel);
    request.post({
      url: 'https://slack.com/api/conversations.kick',
      formData: {
        token: self.config.kicktoken,
        user: user,
        channel: channel,
      },
    }, function(err, response) {
      if (err) console.error('Caught exception: ' + err);
      else {
        console.error(JSON.parse(response.body));
      }
    });
  }
  retrieveRandomConversationChannel(user) {
    let self = this;
    let channel = '';
    request.post({
      url: 'https://slack.com/api/users.conversations',
      formData: {
        token: self.config.token,
        user: user,
      },
    }, function(err, response) {
      if (err) console.error('Caught exception: ' + err);
      else {
        // console.error(JSON.parse(response.body).channels);
        let channels = JSON.parse(response.body).channels;
        // console.log('number channels: ' + channels.length);
        let randomCheck = Math.floor((Math.random() * channels.length));
        channel = channels[randomCheck].id;
      }
    });
    return channel;
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
    let commands = ['HELP', 'PING', 'ABOUT', 'WTR', 'USA', 'FRA', 'IRE', 'WAL', '8', 'DUCKS', 'BANG', 'BEF'];
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
      } else if (commandMatch === 'WAL') {
        self.onCommandColoredText(messageData.channel, parameters, wsc, ['red', 'green', 'white']);
      } else if (commandMatch === '8') {
        self.onCommand8Ball(messageData.user, messageData.channel, parameters, wsc);
      } else if (commandMatch === 'DUCKS') {
        self.onCommandDucks(messageData.user, messageData.channel, parameters, wsc);
      } else if (commandMatch === 'BANG') {
        self.onCommandDuckBangFriend(messageData.user, messageData.channel, parameters, wsc, true);
      } else if (commandMatch === 'BEF') {
        self.onCommandDuckBangFriend(messageData.user, messageData.channel, parameters, wsc, false);
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
            // Fallback user, in case someone new joined. Should not occur ...
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
      console.error('Caught exception doing sed replace' + e);
    }
  }
  onRTMUserChange(messageData, wsc) {
    let self = this;
    let users = [messageData.user];
    self.mapUsers(users);
  }
  onRTMMessage(message, wsc) {
    const self = this;
    // console.log('onRTMMessage: ' + message);
    var messageData = JSON.parse(message);
    if (messageData.type === 'user_change') {
      console.log('Got a user change event: ' + messageData.user.id);
      self.onRTMUserChange(messageData, wsc);
    } else if (messageData.type !== 'message') {
      console.log('Got an event we\'re not processing: ' + messageData.type);
    } else {
      console.log('Got a message event');
      if (typeof messageData.text !== 'string') {
      // This is probably a message edit - ignore those completely.
        return;
      }
      self.doDucks(wsc);
      self.handleCommands(messageData, wsc);
      self.handleSed(messageData, wsc);
    }
  }
  listen() {
    const self = this;
    process.on('SIGINT', async() => {
      console.log('Caught interrupt signal');
      await self.persistDB();
      process.exit();
    });
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
          self.onRTMMessage(message, wsc);
        });
      });
    });
    self.persistDB();
  }
}
exports.Sedbot = Sedbot;
