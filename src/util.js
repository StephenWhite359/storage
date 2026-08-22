// A form posts back the view it came from so the redirect lands on the same
// filters. Only same-site absolute paths are honoured, which rules out an open
// redirect via a crafted form.
export const safeNext = (value, fallback = '/items') =>
  typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : fallback;

// Fastify gives a string for one checkbox/multi-select choice and an array for
// several.
export const asArray = (value) =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

export const asIds = (value) =>
  [...new Set(asArray(value).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

export const asCodes = (value) =>
  [...new Set(asArray(value).map((v) => String(v).trim()).filter(Boolean))];

// Object.fromEntries(searchParams) silently drops repeated keys, keeping only
// the last - wrong for a multi-select's `box=A&box=B`. This mirrors Fastify's
// own query parsing (string for one value, array for several) so a URL round
// tripped through here parses the same way a live request would.
export function parseQuery(pathWithQuery) {
  const params = new URL(pathWithQuery, 'http://local').searchParams;
  const query = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    query[key] = values.length > 1 ? values : values[0];
  }
  return query;
}

// Rebuilds the current items URL so redirects preserve q / box(es) / tag(s).
export function itemsUrl({ q = '', boxes = [], tags = [] } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  for (const code of boxes) params.append('box', code);
  for (const id of tags) params.append('tag', String(id));
  const query = params.toString();
  return query ? `/items?${query}` : '/items';
}
