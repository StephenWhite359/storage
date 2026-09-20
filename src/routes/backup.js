import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, currentRevision, confirmBackup } from '../db.js';
import { safeNext } from '../util.js';

export const stamp = () =>
  new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

// Which deployment produced a backup. It goes in the filename and a header, so a
// download from local dev can never be mistaken for one from Railway (which runs
// with NODE_ENV=production) - or restored over it by accident.
export const backupEnv = () => (process.env.NODE_ENV === 'production' ? 'prod' : 'dev');

// Remembers, per browser, which revision was last downloaded. The banner uses it
// to ask "did it save?" and the confirm route reads it back.
export const PENDING_COOKIE = 'backup_pending';

export default async function backupRoutes(app) {
  // VACUUM INTO writes a consistent snapshot even while the app is being used,
  // and compacts it on the way out. Far safer than copying the live file, which
  // would miss the WAL.
  const sendBackup = async (request, reply) => {
    const scratch = join(tmpdir(), `storage-backup-${randomBytes(6).toString('hex')}.sqlite`);

    // Both calls are synchronous, so no write can land between reading the
    // revision and taking the snapshot: the file holds exactly this revision.
    const revision = currentRevision();
    db.prepare('VACUUM INTO ?').run(scratch);

    const stream = createReadStream(scratch);
    // Downloading is not backing up: the server cannot tell whether the browser's
    // save dialog was accepted or cancelled. So nothing is recorded here - the
    // revision is handed back to the client, and counts only once it is confirmed
    // (POST /api/backup/confirm).
    // The snapshot only needs to survive until it has been streamed out.
    stream.on('close', () => {
      unlink(scratch).catch((err) => request.log.warn({ err }, 'backup cleanup failed'));
    });

    const env = backupEnv();
    return reply
      .type('application/vnd.sqlite3')
      .header('x-storage-env', env)
      .header('x-storage-revision', String(revision))
      .setCookie(PENDING_COOKIE, String(revision), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24,
      })
      .header('content-disposition', `attachment; filename="storage-${env}-${stamp()}.sqlite"`)
      .send(stream);
  };

  // GET is for the backup script and curl (header PIN). The in-app buttons use
  // POST so that nothing that merely fetches a link (prefetching, link previews)
  // takes a snapshot or leaves a "did it save?" prompt behind.
  app.get('/api/backup', sendBackup);
  app.post('/api/backup', sendBackup);

  // Says a downloaded backup really is safe. The script sends the revision it was
  // given (x-storage-revision) once its file is written to disk; a browser has no
  // such moment, so the person clicks "Yes, it saved" and the revision comes from
  // the cookie set at download time. A revision that does not exist yet is refused.
  app.post('/api/backup/confirm', async (request, reply) => {
    const raw = request.headers['x-storage-revision'] ?? request.cookies?.[PENDING_COOKIE];
    const revision = /^\d+$/.test(raw ?? '') ? Number(raw) : NaN;
    const confirmed = confirmBackup(revision);
    if (confirmed) reply.clearCookie(PENDING_COOKIE, { path: '/' });

    // A form without JS posts `next` and expects to land back on the page it was
    // on; the banner then shows whatever the truth is.
    const next = request.body?.next;
    if (typeof next === 'string') return reply.redirect(safeNext(next), 303);

    if (!confirmed) return reply.code(400).send({ error: 'no backup to confirm' });
    return { confirmed: revision };
  });
}
