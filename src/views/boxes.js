import { boxOption, esc, layout, navTabs, tagChips } from './layout.js';
import { DESCRIPTION_MAX } from '../util.js';

const DESCRIPTION_PLACEHOLDER = 'e.g. Winter coats, scarves, boots';

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
  <label style="margin:10px 0 12px">Description <span class="hint">(optional, printed on the label)</span>
    <input name="description" maxlength="${DESCRIPTION_MAX}" placeholder="${DESCRIPTION_PLACEHOLDER}">
  </label>
  <div class="row">
    <button type="button" class="shrink" id="id-cycle"
            data-options="${esc(JSON.stringify(candidates))}">New identifier</button>
    <button type="submit" class="primary shrink">Create box</button>
    <button type="button" class="shrink" data-close="add-box">Cancel</button>
  </div>
</form>`;
}

// Clicking a real box's card selects it for printing. The card is a <label>
// around a visually hidden checkbox, so that needs no script, works from the
// keyboard (Tab to the card, Space to toggle), and still submits `codes` with the
// print form. Links inside a label do not toggle it, which is what lets "View
// contents" and "Edit" sit on the card without also selecting it. "Not in
// Storage" has no label to print, so it is a plain, non-selectable card. Inner
// parts are spans (a label may only hold phrasing content); app.css makes them
// blocks.
const tile = (box) => {
  const label = `${box.glyph} ${box.name}`;

  const contents = `
  <span class="glyph">${esc(box.glyph)}</span>
  <span class="name">${esc(box.name)}</span>
  <span class="count">${box.item_count} ${box.item_count === 1 ? 'item' : 'items'}</span>
  ${box.description ? `<span class="desc">${esc(box.description)}</span>` : ''}
  <span class="tags">${tagChips(box.tags)}</span>
  <span class="tile-actions">
    <a class="tile-view" href="/items?box=${encodeURIComponent(box.code)}"
       aria-label="View contents of ${esc(label)}">View contents</a>
  </span>`;

  if (box.is_default) return `<div class="box-tile default">${contents}\n</div>`;

  return `<label class="box-tile">
  <input class="pick" type="checkbox" name="codes" value="${esc(box.code)}"
         aria-label="Select ${esc(label)} for printing">
  <a class="tile-edit" href="/boxes/${encodeURIComponent(box.code)}/edit"
     aria-label="Edit ${esc(label)}">Edit</a>${contents}
</label>`;
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

<form method="get" action="/boxes/print">
  <div class="grid" id="box-grid">
    ${boxes.map(tile).join('\n')}
  </div>
  <div class="selbar compact">
    <span class="count">Click boxes to select them for labels</span>
    <button type="button" class="shrink" id="select-all-boxes">Select all</button>
    <button type="submit" id="preview-btn" disabled>Preview</button>
    <button type="submit" name="print" value="1" class="primary" id="print-btn" disabled>Print QR</button>
  </div>
</form>`;

  return layout({ title: 'Boxes', nav: navTabs('boxes'), body });
}

// `box` is a boxSummaries() row (identifier, description, item_count); `boxes` is
// boxOptions(), used for the "move items to" choices.
export function boxEditPage({ box, boxes }) {
  const code = encodeURIComponent(box.code);
  const others = boxes.filter((b) => b.code !== box.code);
  const notInStorage = others.find((b) => b.is_default);
  const count = box.item_count;
  const itemsWord = count === 1 ? 'item' : 'items';

  // Deleting never deletes items. With items present, the user picks where they
  // go and Not in Storage is preselected; an empty box has nothing to place.
  const destination = count
    ? `<p>This box holds <strong>${count} ${itemsWord}</strong>. They are not deleted;
     choose where they go instead.</p>
  <label>Move its items to
    <select name="move_to">
      ${others.map((b) => boxOption(b, notInStorage?.code)).join('')}
    </select>
  </label>`
    : '<p class="hint">This box is empty, so there are no items to move.</p>';

  const body = `
<div class="pagehead">
  <h1>Edit box</h1>
  <div class="actions">
    <a class="btn" href="/boxes">Back to boxes</a>
  </div>
</div>

<div class="edit-ident">
  <div class="glyph">${esc(box.glyph)}</div>
  <div class="name">${esc(box.name)}</div>
  <div class="hint">${count} ${itemsWord}</div>
</div>

<form class="card" method="post" action="/boxes/${code}/edit">
  <h2>Description</h2>
  <label>What&rsquo;s in this box <span class="hint">(optional)</span>
    <input name="description" maxlength="${DESCRIPTION_MAX}"
           value="${esc(box.description)}" placeholder="${DESCRIPTION_PLACEHOLDER}">
  </label>
  <p class="hint">Printed on this box&rsquo;s label when set; leave it blank to print
     nothing. Changing it does not update labels you have already printed, so
     reprint after editing.</p>
  <div class="row">
    <button type="submit" class="primary shrink">Save</button>
    <a class="btn shrink" href="/boxes">Cancel</a>
    <a class="btn shrink" href="/boxes/print?codes=${code}">Preview label</a>
  </div>
</form>

<div class="card">
  <h2>Delete box</h2>
  <p class="hint">Removes this box and its picture and name from the grid. Its printed
     label will stop working when scanned.</p>
  <button type="button" class="danger" data-toggle="delete-box">Delete box&hellip;</button>
</div>

<form class="card confirm" id="delete-box" method="post" action="/boxes/${code}/delete" hidden>
  <strong>Delete ${esc(box.glyph)} ${esc(box.name)}?</strong>
  ${destination}
  <p class="hint">This cannot be undone.</p>
  <input type="hidden" name="confirm" value="1">
  <div class="row">
    <button type="submit" class="danger shrink">Delete box</button>
    <button type="button" class="shrink" data-close="delete-box">Cancel</button>
  </div>
</form>`;

  return layout({ title: 'Edit box', nav: navTabs('boxes'), body });
}
