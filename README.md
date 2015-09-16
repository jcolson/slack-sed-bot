1. [Create a new Slack Bot integration](https://devana.slack.com/services/new/bot)
1. Run `npm install`
1. Run `node bot.js YOUR-BOT-TOKEN-GOES-HERE`
1. Invite the bot to channels by mentioning it
1. Use `s/search/replacement/` to order the bot to correct one of the previous 20 messages in the channel

## Known issues

* Does not work with edited messages
* Does not recognize new users until restart
* Isn't too context-aware, use delimiters other than `/` so you don't have to use escape sequences
