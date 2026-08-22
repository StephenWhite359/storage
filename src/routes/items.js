import {
  allTags,
  assignItems,
  boxByCode,
  boxOptions,
  createItem,
  defaultBox,
  deleteItems,
  listItems,
  nextIdentifiers,
} from '../db.js';
import { itemsPage } from '../views/items.js';
import { asCodes, asIds, itemsUrl, parseQuery, safeNext } from '../util.js';

const CYCLE_DEPTH = 12;

const filtersFrom = (query = {}) => ({
  q: String(query.q || ''),
  boxes: asCodes(query.box),
  tags: asIds(query.tag),
});

// Filters survive a POST by riding along in the `next` field, so an error
// re-render shows the same filtered page the user was looking at.
const filtersFromNext = (next) => filtersFrom(parseQuery(next));

// The single place the Items view is assembled.
function render(reply, filters, error = null) {
  const html = itemsPage({
    items: listItems({ q: filters.q, boxCodes: filters.boxes, tagIds: filters.tags }),
    boxes: boxOptions(),
    tags: allTags(),
    candidates: nextIdentifiers(CYCLE_DEPTH),
    filters,
    here: itemsUrl(filters),
    error,
  });
  return reply.type('text/html').send(html);
}

export default async function itemRoutes(app) {
  app.get('/items', async (request, reply) => render(reply, filtersFrom(request.query)));

  app.post('/items', async (request, reply) => {
    const body = request.body || {};
    const next = safeNext(body.next);
    const name = String(body.name || '').trim();

    if (!name) return render(reply, filtersFromNext(next), 'An item needs a name.');

    const box = boxByCode(body.box_code) || defaultBox();
    const newTags = String(body.new_tag || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    createItem({
      name,
      note: String(body.note || ''),
      boxId: box.id,
      tagIds: asIds(body.tags),
      newTags,
    });

    return reply.redirect(next, 302);
  });

  app.post('/items/bulk', async (request, reply) => {
    const body = request.body || {};
    const next = safeNext(body.next);
    const ids = asIds(body.ids);
    const action = String(body.action || '');

    if (!ids.length) return reply.redirect(next, 302);

    if (action === 'delete') {
      // The in-page warning is not the only gate: an unconfirmed delete is
      // refused here too, so posting straight at this route cannot skip it.
      if (body.confirm !== '1') return reply.code(400).send('Delete needs confirmation.');
      deleteItems(ids);
      return reply.redirect(next, 302);
    }

    // "Not in storage" is an ordinary move - the default box is a box like any
    // other, it just has no printable label.
    const target = action === 'assign-default' ? defaultBox() : boxByCode(body.box_code);
    if (!target) return reply.code(400).send('Unknown box.');

    assignItems(ids, target.id);
    return reply.redirect(next, 302);
  });
}
