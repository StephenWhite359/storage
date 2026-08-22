import { esc, layout, navTabs, tagChips } from './layout.js';
import { addBoxPanel } from './boxes.js';

const boxOption = (box, selectedCode) =>
  `<option value="${esc(box.code)}"${box.code === selectedCode ? ' selected' : ''}>${esc(
    box.glyph
  )} ${esc(box.name)}</option>`;

const itemRow = (item) => `
<li>
  <input type="checkbox" name="ids" value="${esc(item.id)}" data-name="${esc(item.name)}"
         aria-label="Select ${esc(item.name)}">
  <div class="item-main">
    <div class="item-name">${esc(item.name)}</div>
    ${item.note ? `<div class="item-note">${esc(item.note)}</div>` : ''}
    <div class="item-meta">
      <span class="chip box"><span class="glyph">${esc(item.box_glyph)}</span>${esc(
        item.box_name
      )}</span>
      ${tagChips(item.tags)}
    </div>
  </div>
</li>`;

export function itemsPage({ items, boxes, tags, candidates, filters, here, error }) {
  // Filtering to a box is the strongest signal about where a new item belongs;
  // otherwise fall back to the default box.
  const addBoxCode = filters.box || boxes.find((b) => b.is_default)?.code;

  // The Move select should not default to the box you are already looking at,
  // nor to Not in Storage, which has its own button beside it.
  const moveBoxCode =
    boxes.find((b) => !b.is_default && b.code !== filters.box)?.code || addBoxCode;

  const filterBar = `
<form class="card" method="get" action="/items" id="filter-form">
  <div class="row">
    <label>Search
      <input type="search" name="q" value="${esc(filters.q)}" placeholder="Item name or note">
    </label>
    <label>Box
      <select name="box" data-autosubmit>
        <option value="">All boxes</option>
        ${boxes.map((b) => boxOption(b, filters.box)).join('')}
      </select>
    </label>
    <label>Tag
      <select name="tag" data-autosubmit>
        <option value="">All tags</option>
        ${tags
          .map(
            (t) =>
              `<option value="${esc(t.id)}"${
                String(t.id) === String(filters.tag) ? ' selected' : ''
              }>${esc(t.name)}</option>`
          )
          .join('')}
      </select>
    </label>
    <div class="shrink">
      <button type="submit" class="primary">Filter</button>
      ${filters.q || filters.box || filters.tag ? '<a class="btn" href="/items">Clear</a>' : ''}
    </div>
  </div>
</form>`;

  const addItemForm = `
<form class="card" id="add-item" method="post" action="/items" hidden>
  <h2>Add item</h2>
  <div class="row">
    <label>Name
      <input name="name" required maxlength="200" placeholder="What is it?">
    </label>
    <label>Box
      <select name="box_code">
        ${boxes.map((b) => boxOption(b, addBoxCode)).join('')}
      </select>
    </label>
  </div>
  <label style="margin-top:10px">Note <span class="hint">(optional)</span>
    <input name="note" maxlength="500" placeholder="Anything worth remembering">
  </label>
  <fieldset style="border:0;padding:10px 0 0;margin:0">
    <legend class="hint" style="padding:0">Tags</legend>
    <div class="item-meta">
      ${tags
        .map(
          (t) => `<label class="chip tag" style="cursor:pointer">
        <input type="checkbox" name="tags" value="${esc(t.id)}"> ${esc(t.name)}
      </label>`
        )
        .join('')}
    </div>
  </fieldset>
  <label style="margin-top:10px">New tags <span class="hint">(comma separated)</span>
    <input name="new_tag" maxlength="200" placeholder="e.g. camping gear">
  </label>
  <input type="hidden" name="next" value="${esc(here)}">
  <div class="row" style="margin-top:12px">
    <button type="submit" class="primary shrink">Add item</button>
  </div>
</form>`;

  const list = items.length
    ? `<ul class="items" id="item-list">${items.map(itemRow).join('')}</ul>`
    : `<p class="empty">No items match. ${
        filters.q || filters.box || filters.tag ? '<a href="/items">Clear filters</a>' : ''
      }</p>`;

  const bulk = items.length
    ? `
<form id="bulk" method="post" action="/items/bulk">
  <input type="hidden" name="next" value="${esc(here)}">
  ${list}
  <div class="selbar" id="selbar" hidden>
    <span class="count" id="sel-count"></span>
    <select name="box_code" aria-label="Move selected items to box">
      ${boxes.map((b) => boxOption(b, moveBoxCode)).join('')}
    </select>
    <button type="submit" name="action" value="assign" class="primary">Move</button>
    <button type="submit" name="action" value="assign-default">Not in storage</button>
    <button type="button" id="ask-delete" class="danger">Delete</button>
  </div>
  <div class="card confirm" id="delete-confirm" hidden>
    <strong>Delete permanently?</strong>
    <div class="names" id="sel-names"></div>
    <p class="hint">This cannot be undone. To keep an item but take it out of a box,
       use &ldquo;Not in storage&rdquo; instead.</p>
    <input type="hidden" name="confirm" value="1">
    <div class="row">
      <button type="submit" name="action" value="delete" class="danger shrink"
              id="confirm-delete">Delete permanently</button>
      <button type="button" class="shrink" id="cancel-delete">Cancel</button>
    </div>
  </div>
</form>`
    : list;

  const body = `
<div class="pagehead">
  <h1>Items</h1>
  <div class="actions">
    <button type="button" data-toggle="add-item" class="primary">Add item</button>
    <button type="button" data-toggle="add-box">Add box</button>
  </div>
</div>
${error ? `<p class="error">${esc(error)}</p>` : ''}
${addItemForm}
${addBoxPanel(candidates, here)}
${filterBar}
<div class="row" style="margin:0 4px 10px">
  <span class="hint">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
  ${items.length ? '<button type="button" class="shrink" id="select-all">Select all</button>' : ''}
</div>
${bulk}`;

  return layout({ title: 'Items', nav: navTabs('items'), body });
}
