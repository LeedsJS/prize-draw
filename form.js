const fs = require('fs');
const bluebird = require('bluebird');
const dbFile = './.data/entries.db';
const dbFileExists = fs.existsSync(dbFile);
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  if (!dbFileExists) {
    db.run('CREATE TABLE entries (sessionId TEXT PRIMARY KEY, name TEXT, entry1 INTEGER, entry2 INTEGER, entry3 INTEGER, entry4 INTEGER, entry5 INTEGER)');
  }
});

module.exports = {
  insertEntry(sessionId, data, callback) {
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
  },
  
  getWinners(prize, number) {
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
  },
  
  getEntries() {
    return new bluebird((resolve, reject) => {
      db.all(`SELECT * from entries`, function(err, rows) {
        resolve(rows);
      });
    })
  },
  
  clear(callback) {
    db.serialize(() => {
      db.run(
        'DELETE FROM entries',
        callback
      );
    });
  }
}