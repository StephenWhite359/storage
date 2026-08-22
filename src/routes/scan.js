import { boxByCode } from '../db.js';
import { layout } from '../views/layout.js';

// The QR target. Deliberately short - fewer characters make a denser code that
// a phone camera locks onto faster. It reuses the Items page by redirecting to
// it pre-filtered rather than rendering anything of its own.
export default async function scanRoutes(app) {
  app.get('/b/:code', async (request, reply) => {
    const box = boxByCode(request.params.code);

    if (!box) {
      return reply.code(404).type('text/html').send(
        layout({
          title: 'Unknown label',
          scripts: false,
          body: `<div class="card">
  <h2>That label is not recognised</h2>
  <p class="hint">The code <strong>${escapeCode(request.params.code)}</strong> does not
     match any box. It may have been printed against a different address.</p>
  <a class="btn" href="/boxes">See all boxes</a>
</div>`,
        })
      );
    }

    return reply.redirect(`/items?box=${encodeURIComponent(box.code)}`, 302);
  });
}

// The code comes straight off the URL, so show at most a short, sanitised slice.
const escapeCode = (raw) =>
  String(raw || '')
    .slice(0, 16)
    .replace(/[^A-Za-z0-9]/g, '');
