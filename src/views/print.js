import QRCode from 'qrcode';
import { esc, layout, navTabs } from './layout.js';

// Avery 15264 (same template as 5164 / 5264 / 8164 / 55164):
// 4in x 3-1/3in labels, 2 columns x 3 rows, 6 per US Letter sheet.
// The grid geometry is fixed by arithmetic and lives in app.css:
//   width  0.15625 + 4 + 0.1875 + 4 + 0.15625 = 8.5in
//   height 0.5 + (3 x 3.3333) + 0.5           = 11in
const PER_SHEET = 6;

export const scanUrl = (code) =>
  `${(process.env.BASE_URL || '').replace(/\/+$/, '')}/b/${code}`;

// Rendered on demand and never stored: a box's QR is fully determined by its
// code plus BASE_URL.
const qrSvg = (code) =>
  QRCode.toString(scanUrl(code), {
    type: 'svg',
    // 4 modules of quiet zone, per spec, baked into the SVG itself - the
    // identifier glyph sits close on the left, so the zone cannot be left to
    // the surrounding layout.
    margin: 4,
    errorCorrectionLevel: 'M',
  });

const chunk = (list, size) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size)
  );

// Identifier on the left because that is what you read across the room; QR on
// the right for the camera.
const label = async (box) => `
    <div class="label">
      <div class="ident">
        <div class="glyph">${esc(box.glyph)}</div>
        <div class="name">${esc(box.name)}</div>
        ${box.description ? `<div class="desc">${esc(box.description)}</div>` : ''}
      </div>
      <div class="qr">
        ${await qrSvg(box.code)}
        <div class="code">${esc(box.code)}</div>
      </div>
    </div>`;

// `autoPrint` opens the browser's print dialog as soon as the page loads (the
// one-click "Print QR" path). Left off, this is a plain preview and the Print
// button on the page is what prints.
export async function printPage(boxes, { autoPrint = false } = {}) {
  const labels = await Promise.all(boxes.map(label));
  const sheets = chunk(labels, PER_SHEET)
    .map((cells) => `<div class="sheet">${cells.join('')}</div>`)
    .join('\n');

  const sheetCount = Math.ceil(labels.length / PER_SHEET);

  const body = `
<div class="printbar noprint">
  <div>
    <strong>${labels.length} ${labels.length === 1 ? 'label' : 'labels'}</strong>
    on ${sheetCount} ${sheetCount === 1 ? 'sheet' : 'sheets'} &middot; Avery 15264
    <div class="hint">Print at <strong>100% scale</strong> with margins set to
      <strong>None</strong>, or the labels will not line up. Also turn off
      <strong>Headers and footers</strong> (under "More settings") - if it's on,
      the browser reserves space for a URL/date/page-number strip that doesn't
      fit on a full-bleed sheet, which pushes out a near-blank extra page after
      every real one.</div>
  </div>
  <a class="btn" href="/boxes">Back to boxes</a>
  <label class="guidetoggle">
    <input type="checkbox" id="guides"> Print cut guides
  </label>
  <button type="button" class="primary" onclick="window.print()">Print</button>
</div>
<div class="sheets" id="sheets">
${sheets}
</div>`;

  // The normal navigation bar is shown so the preview is a page you can leave;
  // app.css hides it (and the footer) when actually printing.
  return layout({
    title: 'Print labels',
    nav: navTabs('boxes'),
    body,
    scripts: false,
    bodyEnd: `<script>
      const guides = document.getElementById('guides');
      guides.addEventListener('change', () => {
        document.getElementById('sheets').classList.toggle('guides', guides.checked);
      });${autoPrint ? "\n      window.addEventListener('load', () => window.print());" : ''}
    </script>`,
  });
}
