import { createReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../db.js';

export const stamp = () =>
  new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

export default async function backupRoutes(app) {
  // VACUUM INTO writes a consistent snapshot even while the app is being used,
  // and compacts it on the way out. Far safer than copying the live file, which
  // would miss the WAL.
  app.get('/api/backup', async (request, reply) => {
    const scratch = join(tmpdir(), `storage-backup-${randomBytes(6).toString('hex')}.sqlite`);

    db.prepare('VACUUM INTO ?').run(scratch);

    const stream = createReadStream(scratch);
    // The snapshot only needs to survive until it has been streamed out.
    stream.on('close', () => {
      unlink(scratch).catch((err) => request.log.warn({ err }, 'backup cleanup failed'));
    });

    return reply
      .type('application/vnd.sqlite3')
      .header('content-disposition', `attachment; filename="storage-${stamp()}.sqlite"`)
      .send(stream);
  });
}
