-- SEQO community data — D1 schema. Each upload is one row; the adding-up happens in tools/compile.js.
CREATE TABLE IF NOT EXISTS batches (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  install  TEXT    NOT NULL,   -- random UUID made by SEQO on first run (not linked to a character)
  app      TEXT,               -- SEQO version that sent it
  received INTEGER NOT NULL,   -- ms
  n        INTEGER NOT NULL,   -- records in it
  body     TEXT    NOT NULL    -- the checked records, as JSON
);
CREATE INDEX IF NOT EXISTS batches_install ON batches (install);

-- uploads per install per UTC day (the daily cap)
CREATE TABLE IF NOT EXISTS daily (
  install TEXT NOT NULL,
  day     TEXT NOT NULL,
  n       INTEGER NOT NULL,
  PRIMARY KEY (install, day)
);

-- installs whose data is left out (bad data, a bug); everything they send is quietly dropped
CREATE TABLE IF NOT EXISTS ignored (
  install TEXT PRIMARY KEY,
  at      INTEGER NOT NULL
);
