import { backupStatus } from '../db.js';
import { requestValues } from '../requestContext.js';
import { safeNext } from '../util.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Every interpolation of stored text goes through this. Item names, notes and
// tag names are all free text typed by a user.
export const esc = (value) =>
  value === null || value === undefined
    ? ''
    : String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const attr = (value) => `"${esc(value)}"`;

// SQLite's datetime('now') is UTC as "YYYY-MM-DD HH:MM:SS". Shown in New York
// time whoever is looking, with the zone abbreviation (EDT/EST) so it is
// unambiguous across the daylight-saving change.
const NY_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

function dateTag(sqliteUtc) {
  const iso = `${sqliteUtc.replace(' ', 'T')}Z`;
  return `<time datetime="${esc(iso)}">${esc(NY_TIME.format(new Date(iso)))}</time>`;
}

// Backups are still manual, so the app says when one is due. The download is a
// POST form rather than a link: a GET can be fetched by prefetching or link
// previews, which would mark a backup as taken that nobody downloaded.
const backupForm = (label, cls = '') =>
  `<form class="backup-form" method="post" action="/api/backup"><button type="submit"${
    cls ? ` class="${cls}"` : ''
  }>${label}</button></form>`;

// Two states. "Unbacked": offer the download. "Awaiting": this browser has
// downloaded but nobody has confirmed the file saved, so ask - the server cannot
// tell a saved download from a cancelled save dialog. The banner only clears on
// that confirmation. The awaiting parts also ride along in a <template> so app.js
// can swap to them the moment a download is clicked, without reloading the page.
const downloadParts = ({ backedUpAt }) => `
  <span class="backup-msg"><strong>Unbacked changes</strong> <span class="backup-sub">&middot; ${
    backedUpAt ? `last backup ${dateTag(backedUpAt)}` : 'no backup yet'
  }</span></span>
  <span class="backup-actions">${backupForm('Download backup', 'primary')}</span>`;

const awaitingParts = (next) => `
  <span class="backup-msg"><strong>Backup downloaded</strong> <span class="backup-sub">&middot; did it save?</span></span>
  <span class="backup-actions">
    <form class="backup-confirm" method="post" action="/api/backup/confirm">
      <input type="hidden" name="next" value="${esc(next)}">
      <button type="submit" class="primary">Yes, it saved</button>
    </form>
    ${backupForm('Download again')}
  </span>`;

function backupBanner(status) {
  const { url, backupPending: pending } = requestValues();
  const next = safeNext(url);
  const awaiting =
    pending != null && pending > status.backedUpRevision && pending <= status.revision;

  if (awaiting) {
    return `<div class="backup-banner" role="status">${awaitingParts(next)}</div>`;
  }
  if (!status.unbacked) return '';
  return `<div class="backup-banner" role="status">${downloadParts(status)}
  <template id="backup-awaiting">${awaitingParts(next)}</template>
</div>`;
}

const backupFooter = ({ backedUpAt }) =>
  `<footer class="foot">${backupForm('Download backup', 'linkbtn')}${
    backedUpAt ? `<span class="foot-note">Last backup ${dateTag(backedUpAt)}</span>` : ''
  }</footer>`;

export function layout({ title, nav = '', body, scripts = true, bodyEnd = '', chrome = true }) {
  const backup = chrome ? backupStatus() : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(title)} &middot; Storage</title>
<link rel="icon" href="/static/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="stylesheet" href="/static/app.css">
</head>
<body>
${
  chrome
    ? `<header class="topbar">
  <nav class="tabs">${nav}</nav>
  <form class="logout" method="post" action="/logout"><button type="submit">Lock</button></form>
</header>
${backupBanner(backup)}`
    : ''
}
<main>
${body}
</main>
${chrome ? backupFooter(backup) : ''}
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

// One <option> for a single-select of boxes: which one box an item is assigned
// to (add item, move, and where a deleted box's items go).
export const boxOption = (box, selectedCode) =>
  `<option value="${esc(box.code)}"${box.code === selectedCode ? ' selected' : ''}>${esc(
    box.glyph
  )} ${esc(box.name)}</option>`;

// A searchable, checkable dropdown for filtering by several values at once.
// Renders as plain checkboxes with `name`, so it posts exactly like a native
// multi-select (repeated `name=value` pairs) - no server-side changes needed
// to consume it. `options` is [{ value, label, html?, selected }]; `html`
// overrides the row's display markup (e.g. a glyph) while `label` stays the
// plain-text form used for the button caption and the search match.
export function multiSelectField({ name, emptyLabel, searchLabel, options }) {
  const selected = options.filter((o) => o.selected);
  const buttonLabel =
    selected.length === 0
      ? emptyLabel
      : selected.length === 1
      ? selected[0].label
      : `${selected.length} selected`;

  const rows = options
    .map(
      (o) => `<label class="msel-option" data-search="${esc(o.label.toLowerCase())}">
        <input type="checkbox" name="${esc(name)}" value="${esc(o.value)}"
               data-label="${esc(o.label)}"${o.selected ? ' checked' : ''}>
        ${o.html ?? esc(o.label)}
      </label>`
    )
    .join('');

  return `<div class="msel" data-empty-label="${esc(emptyLabel)}">
  <button type="button" class="msel-toggle" aria-expanded="false">
    <span class="msel-label">${esc(buttonLabel)}</span>
    <span class="msel-caret" aria-hidden="true">&#9662;</span>
  </button>
  <div class="msel-panel" hidden>
    <input type="search" class="msel-search" placeholder="Search ${esc(
      searchLabel || emptyLabel
    )}&hellip;" aria-label="Search ${esc(searchLabel || emptyLabel)}">
    <div class="msel-actions">
      <button type="button" class="msel-clear">Deselect all</button>
    </div>
    <div class="msel-options">
      ${rows || '<p class="hint" style="padding:6px 8px">Nothing to choose from.</p>'}
    </div>
  </div>
</div>`;
}
