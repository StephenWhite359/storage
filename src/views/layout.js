const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Every interpolation of stored text goes through this. Item names, notes and
// tag names are all free text typed by a user.
export const esc = (value) =>
  value === null || value === undefined
    ? ''
    : String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const attr = (value) => `"${esc(value)}"`;

export function layout({ title, nav = '', body, scripts = true, bodyEnd = '', chrome = true }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)} &middot; Storage</title>
<link rel="stylesheet" href="/static/app.css">
</head>
<body>
${
  chrome
    ? `<header class="topbar">
  <nav class="tabs">${nav}</nav>
  <form class="logout" method="post" action="/logout"><button type="submit">Lock</button></form>
</header>`
    : ''
}
<main>
${body}
</main>
${chrome ? '<footer class="foot"><a href="/api/backup">Download backup</a></footer>' : ''}
${scripts ? '<script src="/static/app.js"></script>' : ''}${bodyEnd}
</body>
</html>`;
}

export const navTabs = (active) => `
  <a href="/items" class="tab${active === 'items' ? ' on' : ''}">Items</a>
  <a href="/boxes" class="tab${active === 'boxes' ? ' on' : ''}">Boxes</a>`;

// A box is rendered identically everywhere, default box included.
export const boxChip = (box) =>
  `<span class="chip box"><span class="glyph">${esc(box.glyph ?? box.box_glyph)}</span>${esc(
    box.name ?? box.box_name
  )}</span>`;

export const tagChips = (tags) =>
  tags.map((t) => `<span class="chip tag">${esc(t)}</span>`).join('');
