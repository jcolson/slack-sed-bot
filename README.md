1. [Create a new Slack Bot integration](https://devana.slack.com/services/new/bot)
2. Run `npm install`
3. Edit a local .env file to look like
`TOKEN=xoxb-xxx-xxx-xxxxxxx
DUCKPERCENT=50
KICKTOKEN=xoxp-xxx-xxx-xxx-xxxxxxx
DUCKCHANNELS=CGYAH2963`
4. Run `./sedbot`
5. Invite the bot to channels by mentioning it
6. Use `s/search/replacement/` to order the bot to correct one of the previous 20 messages in the channel
7. Use .HELP to see other commands available

## Known issues

* Does not work with edited messages
* Isn't too context-aware, use delimiters other than `/` so you don't have to use escape sequences
