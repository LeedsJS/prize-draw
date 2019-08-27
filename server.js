const express = require('express');
const bluebird = require('bluebird');
const moment = require('moment-timezone');
const Twitter = require('twitter');
const bodyParser = require('body-parser');
const axios = require('axios');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const fs = require('fs');
const path = require('path');
const dbFile = './.data/entries.db';
const dbFileExists = fs.existsSync(dbFile);
const prizesFile = './.data/prizes.json';
const prizesFileExists = fs.existsSync(prizesFile);
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbFile);
const app = express();
 
const twitterClient = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  bearer_token: process.env.TWITTER_BEARER_TOKEN
});

let prizes = [];

if (prizesFileExists) {
  prizes = JSON.parse(fs.readFileSync('./.data/prizes.json', 'utf8'));
}

app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: false,
  store: new SQLiteStore({
    dir: './.data'
  }),
  cookie: {
    maxAge: 86400000
  }
}))

db.serialize(() => {
  if (!dbFileExists) {
    db.run('CREATE TABLE entries (sessionId TEXT PRIMARY KEY, name TEXT, entry1 INTEGER, entry2 INTEGER, entry3 INTEGER, entry4 INTEGER, entry5 INTEGER)');
  }
});

app.get('/', (req, res) => {
  req.session.active = true;
  
  insertEntry(req.sessionID, req.query, (resultData) => {
    res.end(`${req.query.c}(${resultData})`);
  });
});

app.post('/', (req, res) => {
  req.session.active = true;
  
  insertEntry(req.sessionID, req.body, (resultData) => {
    res.redirect('https://leedsjs.com/prize-draw/success/');
    res.end();
  });
});

app.get('/admin', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  let response = "<h1>Prize draw admin</h1><p><a href=\"/admin/setup\">Setup prize draw</a></p><p><a href=\"/admin/winners\">Winners</a></p>";
  
  res.end(response);
});

app.get('/admin/winners', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  let response = "<h1>Winners</h1>";
  
  bluebird.each(prizes, (prize, index) => {
    const prizeNum = index + 1;
    
    const queries = [];
    
    if (prize.formQuantity > 0) {
      queries.push(getFormWinners(prizeNum, prize.formQuantity));
    }
    
    if (prize.tweetQuantity > 0) {
      queries.push(getTwitterWinners(prize.tweetQuantity));
    }
    
    return bluebird.all(queries).then((winners) => {
      winners = winners.reduce((accumulator, currentValue) => {
        return [...accumulator, ...currentValue];
      }, [])
      response += `<h2>${prize.tweetQuantity + prize.formQuantity}x ${prize.name}</h2><ul><li>${winners.join('</li><li>')}</li></ul>`;
    });
  }).then(() => res.end(response));
});

app.get('/admin/login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  res.sendFile(path.join(__dirname, 'views/admin-login.html'));
});

app.post('/admin/login', (req, res) => {
  if (req.session.admin) {
    return res.redirect('/admin');
  }
  
  if (req.body.password = process.env.ADMIN_PASSWORD) {
    req.session.admin = true;
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login');
  }
  
  res.end();
});

app.get('/admin/setup', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  db.serialize(() => {
    db.run(
      'DELETE FROM entries',
      () => {
        axios.get('https://leedsjs.com/automation/next-event.json').then((response) => {
          prizes = response.data.prizes;
          fs.writeFileSync(prizesFile, JSON.stringify(prizes));
          res.end('<p>System has been set up. <a href="/admin">Return to admin</a></p>');
        })
      }
    );
  });
});

// listen for requests :)
var listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});

function insertEntry(sessionId, data, callback) {
  const entryData = {
    $sessionId: sessionId,
    $name: data.name,
    $entry1: data.entry1 === "on" ? 1 : 0,
    $entry2: data.entry2 === "on" ? 1 : 0,
    $entry3: data.entry3 === "on" ? 1 : 0,
    $entry4: data.entry4 === "on" ? 1 : 0,
    $entry5: data.entry5 === "on" ? 1 : 0
  };
  
  db.serialize(() => {
    db.run(
      `INSERT INTO entries(sessionId, name, entry1, entry2, entry3, entry4, entry5) 
VALUES($sessionId, $name, $entry1, $entry2, $entry3, $entry4, $entry5) 
ON CONFLICT(sessionId) DO UPDATE SET name=$name, entry1=$entry1, entry2=$entry2, entry3=$entry3, entry4=$entry4, entry5=$entry5`,
      entryData,
      () => {
        callback(JSON.stringify({
          message: "Entry registered"
        }));
      }
    );
  });
}

function getFormWinners(prize, number) {
  return new bluebird((resolve, reject) => {
    db.all(`SELECT name from entries where entry${prize}=1`, function(err, rows) {
      let entrants = rows.map(row => row.name);
      const winners = [];
      for (let i = 0; i < number; i++) {
        const winner = entrants[Math.floor(Math.random()*entrants.length)];
        winners.push(winner);
        
        entrants = entrants.filter(entrant => entrant !== winner);
      }
      
      resolve(winners);
    });
  })
}

function getTwitterWinners(number) {
  // const date = moment().tz("Europe/London").subtract(1, "day").format('YYYY-MM-DD');
  const date = moment().tz("Europe/London").format('YYYY-MM-DD');
  return new bluebird((resolve, reject) => {
    twitterClient.get('search/tweets', {q: `#leedsjs since:${date}`}, function(error, tweets, response) {
      const ignoredUsers = [
        '@codefoodpixels',
        '@leedsjs'
      ];
      
      let entrants = tweets.statuses.map(tweet => `@${tweet.user.screen_name}`).filter((name) => {
        return ignoredUsers.indexOf(name.toLowerCase()) === -1;
      });
      
      const winners = [];
      for (let i = 0; i < number; i++) {
        const winner = entrants[Math.floor(Math.random()*entrants.length)];
        winners.push(winner);
        
        entrants = entrants.filter(entrant => entrant !== winner);
      }
      
      resolve(winners);
    });
  })
}