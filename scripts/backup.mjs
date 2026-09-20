#!/usr/bin/env node
// Pulls a snapshot of the live database to this computer, tells the app it is
// safe once the file is on disk, and keeps only the most recent few. Works
// against localhost or the deployed app:
//
//   npm run backup
//   APP_URL=https://storage.example.com APP_PIN=... npm run backup

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const APP_PIN = process.env.APP_PIN;
const DIR = resolve(process.env.BACKUP_DIR || './backups');
const KEEP = Number(process.env.BACKUP_KEEP || 3);
const SUFFIX = '.sqlite';

if (!APP_PIN) {
  console.error('APP_PIN is not set. It authenticates the backup request.');
  process.exit(1);
}

// Millisecond precision, so two backups in the same second cannot collide.
// Fixed width keeps a plain lexicographic sort chronological.
const stamp = () =>
  new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 19);

const response = await fetch(`${APP_URL}/api/backup`, {
  headers: { 'x-storage-pin': APP_PIN },
});

if (!response.ok) {
  console.error(`Backup failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

// The server says which deployment this is (prod / dev), so backups from local
// dev and from the live app are told apart by name and rotated separately.
const env = /^[a-z0-9-]{1,16}$/.test(response.headers.get('x-storage-env') ?? '')
  ? response.headers.get('x-storage-env')
  : 'unknown';
const PREFIX = `storage-${env}-`;

const bytes = Buffer.from(await response.arrayBuffer());

// A SQLite file always starts with this. Catches the case where a proxy or a
// login page returned HTML with a 200.
if (bytes.subarray(0, 15).toString() !== 'SQLite format 3') {
  console.error('Response was not a SQLite database. Is APP_URL correct?');
  process.exit(1);
}

await mkdir(DIR, { recursive: true });
const file = resolve(DIR, `${PREFIX}${stamp()}${SUFFIX}`);
await writeFile(file, bytes);
console.log(`Saved ${env} backup ${file} (${(bytes.length / 1024).toFixed(1)} KB)`);

// Only now - file written and checked - is it true that this revision is safe, so
// this is where the server is told. A failure here leaves the app's "unbacked
// changes" notice up: a stale warning, never a false all-clear. The backup itself
// is fine, so it is reported but does not fail the run.
const revision = response.headers.get('x-storage-revision');
if (revision) {
  const confirm = await fetch(`${APP_URL}/api/backup/confirm`, {
    method: 'POST',
    headers: { 'x-storage-pin': APP_PIN, 'x-storage-revision': revision },
  }).catch((err) => ({ ok: false, status: err.message }));
  console.log(
    confirm.ok
      ? `Confirmed revision ${revision} with the app.`
      : `Warning: could not confirm revision ${revision} (${confirm.status}); the app will still show unbacked changes.`
  );
}

// Rotate within this environment only: newest KEEP survive. Names sort
// chronologically, so a plain sort works. Other environments' files never match
// PREFIX, so a run against dev cannot rotate away a prod backup or vice versa.
const existing = (await readdir(DIR))
  .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
  .sort()
  .reverse();

for (const stale of existing.slice(KEEP)) {
  await rm(resolve(DIR, stale));
  console.log(`Removed old backup ${stale}`);
}
console.log(`Keeping ${Math.min(existing.length, KEEP)} of ${existing.length} ${env} backups.`);
