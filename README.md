1. [Create a new Slack Bot integration](https://slack.com/services/new/bot)
2. Run `npm install`
3. Edit a local .env file to look like, review the `.env_example` for examples.
`TOKEN=xoxb-xxx-xxx-xxxxxxx
DUCKPERCENT=50
KICKTOKEN=xoxp-xxx-xxx-xxx-xxxxxxx
DUCKCHANNELS=CGYAH2963`
4. Run `./sedbot`
5. Invite the bot to channels by mentioning it
6. Use `s/search/replacement/` to order the bot to correct one of the previous 20 messages in the channel
7. Use .HELP to see other commands available

## Functionality

There is a simple duck-hunter style game built into the bot as well.

```
Just use something simple like:
`s/text to replace/text replaced with`
or
`s/[tT]ext to replace/text replaced with/g`
or try a command:
`.help`                            - this help
`.about`                        - Helpful information about bot
`.ping`                            - Ping the bot
`.usa [any text]`        - USA Patriotic Text
`.fra [any text]`        - France Patriotic Text
`.ire [any text]`        - Ireland Patriotic Text
`.wal [any text]`        - Wales Patriotic Text
`.wtr [location]?[m/u]`- Retrieve the current weather for [location]. [m] == metric, [u] == USCS
`.ducks [username]`    - How many ducks have you/username befriended or harvested?
`.bang`                            - Harvest a duck!
`.bef`                                - Befriend a duck ...
`.8 [important question]`- Ask the Magic 8 Ball an important question
```

## Known issues

* Does not work with edited messages
* Isn't too context-aware, use delimiters other than `/` for regex so you don't have to use escape sequences
