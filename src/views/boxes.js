import { esc, layout, navTabs, tagChips } from './layout.js';

// Shared by the Boxes page and the Items page. `candidates` is the next slice of
// the draw order; the first is the recommendation and the button cycles through
// the rest client-side, so cycling costs no round trip.
export function addBoxPanel(candidates, next) {
  if (!candidates.length) {
    return `<div class="card" id="add-box" hidden>
  <h2>Add box</h2>
  <p class="hint">Every identifier is assigned to a box. No new boxes can be added.</p>
  <button type="button" class="shrink" data-close="add-box">Close</button>
</div>`;
  }

  const [first] = candidates;
  return `<form class="card" id="add-box" method="post" action="/boxes" hidden>
  <h2>Add box</h2>
  <p class="hint">This picture and name go on the printed label, so the box can be
     recognised without scanning.</p>
  <div class="id-preview">
    <div class="glyph" id="id-glyph">${esc(first.glyph)}</div>
    <div class="name" id="id-name">${esc(first.name)}</div>
  </div>
  <input type="hidden" name="identifier_id" id="identifier-id" value="${esc(first.id)}">
  <input type="hidden" name="next" value="${esc(next)}">
  <div class="row">
    <button type="button" class="shrink" id="id-cycle"
            data-options="${esc(JSON.stringify(candidates))}">New identifier</button>
    <button type="submit" class="primary shrink">Create box</button>
    <button type="button" class="shrink" data-close="add-box">Cancel</button>
  </div>
</form>`;
}

const tile = (box) => {
  const label = `${box.glyph} ${box.name}`;
  return `<div class="box-tile${box.is_default ? ' default' : ''}">
  ${
    box.is_default
      ? ''
      : `<input class="pick" type="checkbox" name="codes" value="${esc(box.code)}"
                aria-label="Select ${esc(label)} for printing">`
  }
  <a href="/items?box=${encodeURIComponent(box.code)}">
    <div class="glyph">${esc(box.glyph)}</div>
    <div class="name">${esc(box.name)}</div>
    <div class="count">${box.item_count} ${box.item_count === 1 ? 'item' : 'items'}</div>
  </a>
  <div class="tags">${tagChips(box.tags)}</div>
</div>`;
};

export function boxesPage({ boxes, candidates, error }) {
  const body = `
<div class="pagehead">
  <h1>Boxes</h1>
  <div class="actions">
    <button type="button" data-toggle="add-box">Add box</button>
  </div>
</div>
${error ? `<p class="error">${esc(error)}</p>` : ''}
${addBoxPanel(candidates, '/boxes')}

<form method="get" action="/boxes/print" target="_blank">
  <div class="grid" id="box-grid">
    ${boxes.map(tile).join('\n')}
  </div>
  <div class="selbar">
    <span class="count">Select boxes to label</span>
    <button type="button" class="shrink" id="select-all-boxes">Select all</button>
    <button type="submit" class="primary" id="print-btn" disabled>Print QR</button>
  </div>
</form>`;

  return layout({ title: 'Boxes', nav: navTabs('boxes'), body });
}
