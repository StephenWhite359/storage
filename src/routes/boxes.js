import {
  boxByCode,
  boxOptions,
  boxSummaries,
  createBox,
  db,
  defaultBox,
  deleteBox,
  nextIdentifiers,
  updateBoxDescription,
} from '../db.js';
import { boxEditPage, boxesPage } from '../views/boxes.js';
import { printPage } from '../views/print.js';
import { asArray, cleanDescription, safeNext } from '../util.js';

const CYCLE_DEPTH = 12;

const render = (reply, error = null) =>
  reply.type('text/html').send(
    boxesPage({
      boxes: boxSummaries(),
      candidates: nextIdentifiers(CYCLE_DEPTH),
      error,
    })
  );

// The default box has no label and no edit page: it cannot be described or
// deleted, so anything that resolves to it is treated as "nothing to edit".
const editableSummary = (code) =>
  boxSummaries().find((b) => b.code === code && !b.is_default);

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
      createBox(identifierId, cleanDescription(body.description));
    } catch (err) {
      // Another tab claimed it between the check above and the insert.
      if (err.code?.startsWith('SQLITE_CONSTRAINT')) {
        return render(reply, 'That identifier was just taken. Try another.');
      }
      throw err;
    }

    return reply.redirect(next, 302);
  });

  app.get('/boxes/:code/edit', async (request, reply) => {
    const box = editableSummary(request.params.code);
    if (!box) return reply.redirect('/boxes', 302);

    return reply.type('text/html').send(boxEditPage({ box, boxes: boxOptions() }));
  });

  app.post('/boxes/:code/edit', async (request, reply) => {
    const box = boxByCode(request.params.code);
    if (!box || box.is_default) return reply.redirect('/boxes', 302);

    updateBoxDescription(box.id, cleanDescription(request.body?.description));
    return reply.redirect('/boxes', 302);
  });

  app.post('/boxes/:code/delete', async (request, reply) => {
    const body = request.body || {};
    const box = boxByCode(request.params.code);

    // Already gone (a double submit, or a second tab): the outcome the user
    // wanted has happened, so land on the list rather than erroring.
    if (!box) return reply.redirect('/boxes', 302);
    if (box.is_default) {
      return reply.code(400).send('The Not in Storage box cannot be deleted.');
    }

    // The in-page panel is not the only gate: posting straight at this route
    // cannot skip the confirmation, same as the Items bulk delete.
    if (body.confirm !== '1') return reply.code(400).send('Delete needs confirmation.');

    // A blank destination means Not in Storage. Every check happens before
    // anything is written, so a bad request leaves the box and its items alone.
    const moveTo = String(body.move_to || '').trim();
    const target = moveTo ? boxByCode(moveTo) : defaultBox();
    if (!target || target.id === box.id) {
      return reply.code(400).send('Choose a different box to move the items to.');
    }

    deleteBox(box.id, target.id);
    return reply.redirect('/boxes', 302);
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
        `SELECT b.code, b.description, i.name, i.glyph
         FROM boxes b JOIN identifiers i ON i.id = b.identifier_id
         WHERE b.code IN (${placeholders}) AND b.is_default = 0
         ORDER BY i.name COLLATE NOCASE`
      )
      .all(...codes);

    if (!boxes.length) return reply.redirect('/boxes', 302);

    // Preview by default; `print=1` (the "Print QR" button) opens the print
    // dialog straight away.
    const autoPrint = request.query.print === '1';
    return reply.type('text/html').send(await printPage(boxes, { autoPrint }));
  });
}
