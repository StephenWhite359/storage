// A form posts back the view it came from so the redirect lands on the same
// filters. Only same-site absolute paths are honoured, which rules out an open
// redirect via a crafted form.
export const safeNext = (value, fallback = '/items') =>
  typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : fallback;

// Fastify gives a string for one checkbox and an array for several.
export const asArray = (value) =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

export const asIds = (value) =>
  [...new Set(asArray(value).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

// Rebuilds the current items URL so redirects preserve q / box / tag.
export function itemsUrl({ q = '', box = '', tag = '' } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (box) params.set('box', box);
  if (tag) params.set('tag', String(tag));
  const query = params.toString();
  return query ? `/items?${query}` : '/items';
}
