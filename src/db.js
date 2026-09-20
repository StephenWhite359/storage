import Database from 'better-sqlite3';
import { randomInt } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POOL, RESERVED } from './seed/identifiers.js';

const here = dirname(fileURLToPath(import.meta.url));

// Excludes 0/O/1/I so a code can be read off a label and typed without ambiguity.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8;

// group_concat separator: a unit separator can never occur inside a tag name,
// unlike a comma.
const SEP = '';

export const db = openDatabase(process.env.DB_PATH || './data/storage.sqlite');

function openDatabase(path) {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  const conn = new Database(full);
  conn.pragma('journal_mode = WAL');
  conn.pragma('synchronous = NORMAL');
  conn.pragma('cache_size = -2000'); // cap the page cache at 2MB
  conn.pragma('foreign_keys = ON');
  return conn;
}

export function migrate() {
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
  addMissingColumns();
  trackBackups();
  seed();
}

// schema.sql is all CREATE ... IF NOT EXISTS, which is a no-op on a database
// that already has the table - so a column added to a CREATE TABLE body never
// reaches an existing database (local or the live one). Each column added after
// the first release is listed here and applied once, additively and nullable, so
// existing rows and already-printed labels are untouched.
function addMissingColumns() {
  const columnsAdded = [{ table: 'boxes', column: 'description', type: 'TEXT' }];

  for (const { table, column, type } of columnsAdded) {
    const present = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!present.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

// Tables whose rows are user data. Any write to one advances the backup
// revision. `identifiers` is seed data that never changes after boot.
const TRACKED_TABLES = ['boxes', 'items', 'tags', 'item_tags'];

// A one-row counter of changes versus the change a backup last captured. Done
// with triggers rather than in the routes so no write path - present or future -
// can forget to count. The counter is an integer, not a timestamp: datetime('now')
// only has one-second resolution, so an edit in the same second as a backup would
// compare as "not newer" and go unreported. The timestamps are for display only.
//
// It starts at revision 1 / backed up 0, so a database that has never been
// downloaded reports unbacked changes straight away. Triggers are dropped and
// recreated each boot so their definition always matches this file.
function trackBackups() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL,
      changed_at TEXT NOT NULL,
      backed_up_revision INTEGER NOT NULL,
      backed_up_at TEXT
    );
    INSERT OR IGNORE INTO backup_state (id, revision, changed_at, backed_up_revision)
    VALUES (1, 1, datetime('now'), 0);
  `);

  const triggers = TRACKED_TABLES.flatMap((table) =>
    ['INSERT', 'UPDATE', 'DELETE'].map((event) => {
      const name = `backup_track_${table}_${event.toLowerCase()}`;
      return `
        DROP TRIGGER IF EXISTS ${name};
        CREATE TRIGGER ${name} AFTER ${event} ON ${table}
        BEGIN
          UPDATE backup_state
          SET revision = revision + 1, changed_at = datetime('now')
          WHERE id = 1;
        END;`;
    })
  );
  db.exec(`BEGIN;${triggers.join('')}COMMIT;`);
}

export const currentRevision = () =>
  db.prepare('SELECT revision FROM backup_state WHERE id = 1').get().revision;

// Marks everything up to `revision` as backed up. Called only when a backup is
// confirmed to have landed (see routes/backup.js) - downloading alone does not
// count, because the server cannot see what the browser does with the file.
// Refuses a revision from the future, and never moves backwards, so a slow, older
// confirmation cannot un-clear a newer one.
export function confirmBackup(revision) {
  if (!Number.isInteger(revision) || revision < 0 || revision > currentRevision()) return false;
  db.prepare(
    `UPDATE backup_state
     SET backed_up_revision = ?, backed_up_at = datetime('now')
     WHERE id = 1 AND ? >= backed_up_revision`
  ).run(revision, revision);
  return true;
}

export function backupStatus() {
  const row = db.prepare('SELECT * FROM backup_state WHERE id = 1').get();
  return {
    unbacked: row.revision > row.backed_up_revision,
    revision: row.revision,
    backedUpRevision: row.backed_up_revision,
    changedAt: row.changed_at,
    backedUpAt: row.backed_up_at,
  };
}

// Runs once, on an empty database. The shuffle happens here and only here: the
// resulting order is persisted as `seq`, so the draw order never changes again.
function seed() {
  const seeded = db.prepare('SELECT count(*) AS n FROM identifiers').get().n > 0;
  if (seeded) return;

  const insertIdentifier = db.prepare(
    'INSERT INTO identifiers (name, glyph, seq, reserved) VALUES (?, ?, ?, ?)'
  );
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');

  db.transaction(() => {
    insertIdentifier.run(RESERVED.name, RESERVED.glyph, 0, 1);

    const shuffled = shuffle([...POOL]);
    shuffled.forEach((identifier, i) => {
      insertIdentifier.run(identifier.name, identifier.glyph, i + 1, 0);
    });

    const reservedId = db
      .prepare('SELECT id FROM identifiers WHERE reserved = 1')
      .get().id;
    db.prepare(
      'INSERT INTO boxes (code, identifier_id, is_default) VALUES (?, ?, 1)'
    ).run(generateCode(), reservedId);

    for (const name of ['winter clothes', 'summer clothes', 'hardware']) {
      insertTag.run(name);
    }
  })();
}

// Fisher-Yates using crypto randomInt rather than Math.random.
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

const splitTags = (packed) => (packed ? packed.split(SEP) : []);

/* ---------------------------------------------------------------- boxes --- */

export const defaultBox = () =>
  db.prepare('SELECT * FROM boxes WHERE is_default = 1').get();

export const boxByCode = (code) =>
  db.prepare('SELECT * FROM boxes WHERE code = ?').get(String(code || ''));

// One query for the whole boxes page: identifier, item count, and the distinct
// tags across each box's contents. The items list and the boxes grid are two
// renderings over this same layer.
const BOX_SUMMARIES = `
  SELECT b.id, b.code, b.is_default, b.description, i.name, i.glyph,
         (SELECT count(*) FROM items it WHERE it.box_id = b.id) AS item_count,
         (SELECT group_concat(name, '${SEP}') FROM (
            SELECT DISTINCT t.name
            FROM items it
            JOIN item_tags m ON m.item_id = it.id
            JOIN tags t ON t.id = m.tag_id
            WHERE it.box_id = b.id
            ORDER BY t.name COLLATE NOCASE
         )) AS tags
  FROM boxes b
  JOIN identifiers i ON i.id = b.identifier_id
  ORDER BY b.is_default DESC, i.name COLLATE NOCASE`;

export function boxSummaries() {
  return db
    .prepare(BOX_SUMMARIES)
    .all()
    .map((row) => ({ ...row, tags: splitTags(row.tags) }));
}

// Lightweight list for the filter dropdowns and the "move to box" select.
export const boxOptions = () =>
  db
    .prepare(
      `SELECT b.code, b.is_default, i.name, i.glyph
       FROM boxes b JOIN identifiers i ON i.id = b.identifier_id
       ORDER BY b.is_default DESC, i.name COLLATE NOCASE`
    )
    .all();

/* ---------------------------------------------------------- identifiers --- */

// The next n identifiers in draw order that no box holds. The reserved
// identifier is never a candidate.
export const nextIdentifiers = (n) =>
  db
    .prepare(
      `SELECT id, name, glyph FROM identifiers
       WHERE reserved = 0 AND id NOT IN (SELECT identifier_id FROM boxes)
       ORDER BY seq LIMIT ?`
    )
    .all(n);

// The UNIQUE constraint on boxes.identifier_id is what makes this safe against
// two tabs claiming the same identifier: the second insert throws.
export function createBox(identifierId, description = null) {
  const insert = db.prepare(
    'INSERT INTO boxes (code, identifier_id, is_default, description) VALUES (?, ?, 0, ?)'
  );
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      insert.run(code, identifierId, description);
      return code;
    } catch (err) {
      // Retry only a code collision; an identifier collision is a real conflict.
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && err.message.includes('boxes.code')) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('could not generate a unique box code');
}

export const updateBoxDescription = (boxId, description) =>
  db.prepare('UPDATE boxes SET description = ? WHERE id = ?').run(description, boxId);

// items.box_id is NOT NULL with no ON DELETE, so a box that still holds items
// cannot simply be deleted - the database refuses. Move the items first and
// delete second, in one transaction, so a failure part-way leaves every item
// exactly where it was. The is_default = 0 guard is a second line of defence
// behind the route's own check: the "Not in Storage" box must never go.
export const deleteBox = db.transaction((boxId, targetBoxId) => {
  const moved = db
    .prepare('UPDATE items SET box_id = ? WHERE box_id = ?')
    .run(targetBoxId, boxId).changes;

  const removed = db
    .prepare('DELETE FROM boxes WHERE id = ? AND is_default = 0')
    .run(boxId).changes;

  // Throwing inside db.transaction rolls the item move back too.
  if (removed !== 1) throw new Error('box was not deleted');
  return moved;
});

/* ----------------------------------------------------------------- tags --- */

export const allTags = () =>
  db.prepare('SELECT id, name FROM tags ORDER BY name COLLATE NOCASE').all();

export const tagById = (id) =>
  db.prepare('SELECT id, name FROM tags WHERE id = ?').get(id);

function upsertTag(name) {
  const clean = name.trim();
  if (!clean) return null;
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(clean);
  return db.prepare('SELECT id FROM tags WHERE name = ?').get(clean).id;
}

/* ---------------------------------------------------------------- items --- */

// Escapes the LIKE wildcards so a search for "50%" means the literal string.
const likeTerm = (q) => '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

// boxCodes/tagIds are OR'd within themselves (an item in any selected box,
// with any selected tag) and AND'd against each other - the usual faceted
// filter semantics.
export function listItems({ q = '', boxCodes = [], tagIds = [] } = {}) {
  const where = [];
  const params = [];

  if (q.trim()) {
    where.push("(i.name LIKE ? ESCAPE '\\' OR ifnull(i.note, '') LIKE ? ESCAPE '\\')");
    params.push(likeTerm(q.trim()), likeTerm(q.trim()));
  }
  if (boxCodes.length) {
    where.push(`b.code IN (${boxCodes.map(() => '?').join(',')})`);
    params.push(...boxCodes);
  }
  if (tagIds.length) {
    where.push(
      `EXISTS (SELECT 1 FROM item_tags m WHERE m.item_id = i.id AND m.tag_id IN (${tagIds
        .map(() => '?')
        .join(',')}))`
    );
    params.push(...tagIds);
  }

  const sql = `
    SELECT i.id, i.name, i.note,
           b.code AS box_code, b.is_default AS box_is_default,
           d.name AS box_name, d.glyph AS box_glyph,
           (SELECT group_concat(name, '${SEP}') FROM (
              SELECT t.name FROM item_tags m JOIN tags t ON t.id = m.tag_id
              WHERE m.item_id = i.id ORDER BY t.name COLLATE NOCASE
           )) AS tags
    FROM items i
    JOIN boxes b ON b.id = i.box_id
    JOIN identifiers d ON d.id = b.identifier_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY b.is_default DESC, d.name COLLATE NOCASE, i.name COLLATE NOCASE`;

  return db
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row, tags: splitTags(row.tags) }));
}

export const itemsByIds = (ids) =>
  ids.length
    ? db
        .prepare(
          `SELECT id, name FROM items WHERE id IN (${ids.map(() => '?').join(',')})
           ORDER BY name COLLATE NOCASE`
        )
        .all(...ids)
    : [];

export const createItem = db.transaction(({ name, note, boxId, tagIds, newTags }) => {
  const info = db
    .prepare('INSERT INTO items (name, note, box_id) VALUES (?, ?, ?)')
    .run(name.trim(), note?.trim() || null, boxId);

  const link = db.prepare(
    'INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)'
  );
  const ids = new Set(tagIds);
  for (const raw of newTags) {
    const id = upsertTag(raw);
    if (id) ids.add(id);
  }
  for (const tagId of ids) link.run(info.lastInsertRowid, tagId);

  return info.lastInsertRowid;
});

export const assignItems = db.transaction((ids, boxId) => {
  const update = db.prepare('UPDATE items SET box_id = ? WHERE id = ?');
  for (const id of ids) update.run(boxId, id);
  return ids.length;
});

export const deleteItems = db.transaction((ids) => {
  const remove = db.prepare('DELETE FROM items WHERE id = ?');
  for (const id of ids) remove.run(id);
  return ids.length;
});
