const bluebird = require("bluebird");
const Twitter = require("twitter");
const moment = require("moment-timezone");

const twitterClient = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  bearer_token: process.env.TWITTER_BEARER_TOKEN,
});

module.exports = {
  getWinners(number) {
    const date = moment().tz("Europe/London").format("YYYY-MM-DD");
    return new bluebird((resolve, reject) => {
      twitterClient.get(
        "search/tweets",
        { q: `#leedsjs since:${date} -filter:retweets` },
        function (error, tweets, response) {
          const ignoredUsers = ["@codefoodpixels", "@leedsjs"];

          let entrants = tweets.statuses
            .map((tweet) => `@${tweet.user.screen_name}`)
            .filter((name) => {
              return ignoredUsers.indexOf(name.toLowerCase()) === -1;
            });

          const winners = [];
          for (let i = 0; i < number; i++) {
            const winner =
              entrants[Math.floor(Math.random() * entrants.length)];
            winners.push(winner);

            entrants = entrants.filter((entrant) => entrant !== winner);
          }

          resolve(winners);
        }
      );
    });
  },
};
