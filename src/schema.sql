PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS identifiers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  glyph TEXT NOT NULL,
  seq INTEGER NOT NULL UNIQUE,         -- pre-shuffled draw order
  reserved INTEGER NOT NULL DEFAULT 0  -- 1 = never handed out by the draw
);

CREATE TABLE IF NOT EXISTS boxes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- short slug embedded in the QR URL
  identifier_id INTEGER NOT NULL UNIQUE REFERENCES identifiers(id),
  is_default INTEGER NOT NULL DEFAULT 0,
  description TEXT,                    -- optional; printed on the label when set
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS boxes_one_default ON boxes(is_default) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  box_id INTEGER NOT NULL REFERENCES boxes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS items_box ON items(box_id);
CREATE INDEX IF NOT EXISTS item_tags_tag ON item_tags(tag_id);
