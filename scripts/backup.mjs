#!/usr/bin/env node
// Pulls a snapshot of the live database to this computer and keeps only the
// most recent few. Works against localhost or the deployed app:
//
//   npm run backup
//   APP_URL=https://storage.example.com APP_PIN=... npm run backup

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
const APP_PIN = process.env.APP_PIN;
const DIR = resolve(process.env.BACKUP_DIR || './backups');
const KEEP = Number(process.env.BACKUP_KEEP || 3);
const PREFIX = 'storage-';
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
console.log(`Saved ${file} (${(bytes.length / 1024).toFixed(1)} KB)`);

// Rotate: newest KEEP survive. Names sort chronologically, so a plain sort works.
const existing = (await readdir(DIR))
  .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
  .sort()
  .reverse();

for (const stale of existing.slice(KEEP)) {
  await rm(resolve(DIR, stale));
  console.log(`Removed old backup ${stale}`);
}
console.log(`Keeping ${Math.min(existing.length, KEEP)} of ${existing.length} backups.`);
