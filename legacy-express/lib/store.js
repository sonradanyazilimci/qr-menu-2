const fs = require('fs');
const path = require('path');

const FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');
let db = null;

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  const json = JSON.stringify(db, null, 2);
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, FILE);
  } catch {
    // Windows'ta antivirüs/kilit nedeniyle rename başarısız olabilir
    fs.writeFileSync(FILE, json);
  }
}

function get() {
  if (db) return db;
  if (fs.existsSync(FILE)) {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } else {
    db = require('./seed').build();
    save();
  }
  return db;
}

function replace(next) {
  db = next;
  save();
}

module.exports = { get, save, replace, FILE };
