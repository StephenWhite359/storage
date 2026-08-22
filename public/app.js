// Progressive sprinkles: selection state, panel toggles, and the delete
// confirmation. Every form still works without this file - the server does its
// own validation, including refusing an unconfirmed delete.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------- toggle panels --- */

$$('[data-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.dataset.toggle);
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) $('input, select, textarea', panel)?.focus();
  });
});

// A Cancel/Close button inside a toggled panel - always just hides it.
$$('[data-close]').forEach((button) => {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.dataset.close);
    if (panel) panel.hidden = true;
  });
});

/* -------------------------------------------------- filter auto-submit --- */

// Box and tag are selects, so a change is a deliberate choice - submit right
// away. Search stays on the explicit Filter button, since submitting per
// keystroke would fight the user.
$$('[data-autosubmit]').forEach((field) => {
  field.addEventListener('change', () => field.form.submit());
});

/* ------------------------------------------------- items page selection --- */

const itemList = $('#item-list');
if (itemList) {
  const boxes = $$('input[name="ids"]', itemList);
  const bar = $('#selbar');
  const confirmPanel = $('#delete-confirm');
  const count = $('#sel-count');
  const names = $('#sel-names');

  const selected = () => boxes.filter((b) => b.checked);

  const sync = () => {
    const picked = selected();
    boxes.forEach((b) => b.closest('li').classList.toggle('sel', b.checked));
    if (bar) bar.hidden = picked.length === 0;
    if (picked.length === 0 && confirmPanel) confirmPanel.hidden = true;
    if (count) {
      count.textContent = `${picked.length} selected`;
    }
  };

  boxes.forEach((b) => b.addEventListener('change', sync));

  $('#select-all')?.addEventListener('click', () => {
    const turnOn = selected().length < boxes.length;
    boxes.forEach((b) => (b.checked = turnOn));
    sync();
  });

  // Show exactly which items are about to be deleted, by name, before the
  // destructive submit is available.
  $('#ask-delete')?.addEventListener('click', () => {
    const picked = selected();
    if (!picked.length) return;
    if (names) {
      names.textContent = picked.map((b) => b.dataset.name).join(', ');
    }
    if (confirmPanel) confirmPanel.hidden = false;
    $('#confirm-delete')?.focus();
  });

  $('#cancel-delete')?.addEventListener('click', () => {
    if (confirmPanel) confirmPanel.hidden = true;
  });

  sync();
}

/* --------------------------------------------------- boxes page: print --- */

const boxGrid = $('#box-grid');
if (boxGrid) {
  const picks = $$('input[name="codes"]', boxGrid);
  const printBtn = $('#print-btn');

  const sync = () => {
    const picked = picks.filter((p) => p.checked);
    picks.forEach((p) => p.closest('.box-tile').classList.toggle('sel', p.checked));
    if (printBtn) {
      printBtn.disabled = picked.length === 0;
      printBtn.textContent = picked.length
        ? `Print QR (${picked.length})`
        : 'Print QR';
    }
  };

  picks.forEach((p) => p.addEventListener('change', sync));
  sync();
}

/* ------------------------------------------------ add box: cycle choices --- */

const cycler = $('#id-cycle');
if (cycler) {
  const options = JSON.parse(cycler.dataset.options || '[]');
  const glyph = $('#id-glyph');
  const name = $('#id-name');
  const field = $('#identifier-id');
  let at = 0;

  const show = () => {
    const choice = options[at];
    if (!choice) return;
    glyph.textContent = choice.glyph;
    name.textContent = choice.name;
    field.value = choice.id;
  };

  cycler.addEventListener('click', () => {
    at = (at + 1) % options.length;
    show();
  });

  if (options.length < 2) cycler.disabled = true;
}
