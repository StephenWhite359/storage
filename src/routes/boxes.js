import { boxSummaries, createBox, db, nextIdentifiers } from '../db.js';
import { boxesPage } from '../views/boxes.js';
import { printPage } from '../views/print.js';
import { asArray, safeNext } from '../util.js';

const CYCLE_DEPTH = 12;

const render = (reply, error = null) =>
  reply.type('text/html').send(
    boxesPage({
      boxes: boxSummaries(),
      candidates: nextIdentifiers(CYCLE_DEPTH),
      error,
    })
  );

export default async function boxRoutes(app) {
  app.get('/boxes', async (_request, reply) => render(reply));

  app.post('/boxes', async (request, reply) => {
    const body = request.body || {};
    const next = safeNext(body.next, '/boxes');
    const identifierId = Number(body.identifier_id);

    const available = nextIdentifiers(CYCLE_DEPTH).some((i) => i.id === identifierId);
    if (!available) {
      return render(reply, 'That identifier is no longer available. Try another.');
    }

    try {
      createBox(identifierId);
    } catch (err) {
      // Another tab claimed it between the check above and the insert.
      if (err.code?.startsWith('SQLITE_CONSTRAINT')) {
        return render(reply, 'That identifier was just taken. Try another.');
      }
      throw err;
    }

    return reply.redirect(next, 302);
  });

  // The default box has no physical counterpart, so it is filtered out here as
  // well as hidden in the UI - a hand-written code cannot slip it in.
  app.get('/boxes/print', async (request, reply) => {
    const codes = asArray(request.query.codes).flatMap((value) =>
      String(value)
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean)
    );

    if (!codes.length) return reply.redirect('/boxes', 302);

    const placeholders = codes.map(() => '?').join(',');
    const boxes = db
      .prepare(
        `SELECT b.code, i.name, i.glyph
         FROM boxes b JOIN identifiers i ON i.id = b.identifier_id
         WHERE b.code IN (${placeholders}) AND b.is_default = 0
         ORDER BY i.name COLLATE NOCASE`
      )
      .all(...codes);

    if (!boxes.length) return reply.redirect('/boxes', 302);

    return reply.type('text/html').send(await printPage(boxes));
  });
}
