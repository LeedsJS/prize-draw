const getBearerToken = require('get-twitter-bearer-token')

getBearerToken(process.env.TWITTER_CONSUMER_KEY, process.env.TWITTER_CONSUMER_SECRET, (err, res) => {
  if (err) {
    // handle error
    console.log(err)
  } else {
  
    // bearer token from Twitter response
    console.log(res.body.access_token)
  }
})