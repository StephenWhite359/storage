import { createHash, timingSafeEqual } from 'node:crypto';
import { esc, layout } from '../views/layout.js';
import { safeNext } from '../util.js';

const COOKIE = 'sid';
const YEAR = 60 * 60 * 24 * 365;

const sha256 = (value) => createHash('sha256').update(String(value)).digest();

function pinMatches(supplied) {
  // Hash both sides first so timingSafeEqual always compares equal lengths.
  return timingSafeEqual(sha256(supplied ?? ''), sha256(process.env.APP_PIN));
}

export function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    maxAge: YEAR,
  };
}

export function isAuthed(request) {
  const raw = request.cookies[COOKIE];
  if (!raw) return false;
  const result = request.unsignCookie(raw);
  return result.valid && result.value === 'ok';
}

// The backup script has no browser session, so it authenticates with a header.
// Never a query parameter - those end up in logs and history.
export const headerPinValid = (request) => {
  const supplied = request.headers['x-storage-pin'];
  return typeof supplied === 'string' && pinMatches(supplied);
};

const loginPage = (next, error) =>
  layout({
    title: 'Unlock',
    scripts: false,
    chrome: false,
    body: `
<form class="card login" method="post" action="/login">
  <h1>Storage</h1>
  ${error ? `<p class="error">${esc(error)}</p>` : ''}
  <input type="hidden" name="next" value="${esc(next)}">
  <label>Passcode
    <input name="pin" type="password" inputmode="numeric" autocomplete="current-password"
           autofocus required>
  </label>
  <button type="submit">Unlock</button>
</form>`,
  });

// Only paths that must work before a session exists.
const isOpen = (url) =>
  url.startsWith('/login') || url.startsWith('/static/') || url === '/favicon.ico';

// Registered at the top level in server.js - hooks added inside a plugin are
// encapsulated to that plugin and would not guard the other routes.
export async function authHook(request, reply) {
  if (isOpen(request.url) || isAuthed(request)) return;

  // API callers are scripts, not browsers: answer them with a status they can
  // act on rather than bouncing them into an HTML login page.
  if (request.url.startsWith('/api/')) {
    if (headerPinValid(request)) return;
    return reply.code(401).send('Locked');
  }

  if (request.method !== 'GET') return reply.code(401).send('Locked');
  return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`, 302);
}

export default async function authRoutes(app) {
  app.get('/login', async (request, reply) => {
    if (isAuthed(request)) return reply.redirect(safeNext(request.query.next), 302);
    reply.type('text/html').send(loginPage(safeNext(request.query.next), null));
  });

  app.post('/login', async (request, reply) => {
    const next = safeNext(request.body?.next);
    if (!pinMatches(request.body?.pin)) {
      return reply.code(401).type('text/html').send(loginPage(next, 'Incorrect passcode.'));
    }
    reply.setCookie(COOKIE, 'ok', cookieOptions());
    return reply.redirect(next, 302);
  });

  app.post('/logout', async (request, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.redirect('/login', 302);
  });
}
