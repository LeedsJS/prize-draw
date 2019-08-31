const express = require('express');
const bluebird = require('bluebird');
const bodyParser = require('body-parser');
const axios = require('axios');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const fs = require('fs');
const path = require('path');
const prizesFile = './.data/prizes.json';
const prizesFileExists = fs.existsSync(prizesFile);
const twitter = require('./twitter.js');
const form = require('./form.js');
const app = express();

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

app.get('/', (req, res) => {
  req.session.active = true;
  
  form.insertEntry(req.sessionID, req.query, (resultData) => {
    res.end(`${req.query.c}(${resultData})`);
  });
});

app.post('/', (req, res) => {
  req.session.active = true;
  
  form.insertEntry(req.sessionID, req.body, () => {
    res.redirect('https://leedsjs.com/prize-draw/success/');
    res.end();
  });
});

app.get('/admin', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  res.sendFile(path.join(__dirname, 'views/admin-home.html'));  
});

app.get('/admin/entries', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  form.getEntries().then((entries) => {
    res.json(entries);
  })  
});

app.get('/admin/winners', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  let response = "<h1>Winners</h1>";
  
  bluebird.map(prizes, (prize, index) => {
    const prizeNum = index + 1;
    
    const queries = [];
    
    if (prize.formQuantity > 0) {
      queries.push(form.getWinners(prizeNum, prize.formQuantity));
    }
    
    if (prize.tweetQuantity > 0) {
      queries.push(twitter.getWinners(prize.tweetQuantity));
    }
    
    return bluebird.all(queries).then((winners) => {
      winners = winners.reduce((accumulator, currentValue) => {
        return [...accumulator, ...currentValue];
      }, [])
      return `<h2>${prize.tweetQuantity + prize.formQuantity}x ${prize.name}</h2><ul><li>${winners.join('</li><li>')}</li></ul>`;
    });
  }).then((prizes) => {
    const template = fs.readFileSync(path.join(__dirname, 'views/admin-winners.html'), 'utf8')
      .replace("{{ content }}", prizes.join());
    res.end(template);
  });
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

app.get('/admin/clear', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  form.clear(() => {
    res.end('<p>System has been cleared. <a href="/admin">Return to admin</a></p>');
  })
});

app.get('/admin/setup', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  
  setupPrizes().then(() => {
    res.end('<p>System has been set up. <a href="/admin">Return to admin</a></p>');
  })
});

app.post(`/admin/clear/${process.env.CLEAR_ENDPOINT}`, (req, res) => {
  form.clear(() => {
    res.end('Successfully cleared');
  })
});

app.post(`/admin/setup/${process.env.SETUP_ENDPOINT}`, (req, res) => {
  setupPrizes().then(() => {
    res.end('Setup successful');
  })
});

// listen for requests :)
var listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});

function setupPrizes() {
  return axios.get('https://leedsjs.com/automation/next-event.json').then((response) => {
    prizes = response.data.prizes || [];
    fs.writeFileSync(prizesFile, JSON.stringify(prizes));
    return
  })
}