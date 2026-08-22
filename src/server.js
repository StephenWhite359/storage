import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';

import { migrate } from './db.js';
import authRoutes, { authHook } from './routes/auth.js';
import itemRoutes from './routes/items.js';
import boxRoutes from './routes/boxes.js';
import scanRoutes from './routes/scan.js';
import backupRoutes from './routes/backup.js';

const here = dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production';

function requireConfig() {
  if (!process.env.APP_PIN) {
    console.error('APP_PIN is not set. Copy .env.example to .env and set a passcode.');
    process.exit(1);
  }
  if (!process.env.COOKIE_SECRET) {
    if (production) {
      console.error('COOKIE_SECRET is not set. Refusing to start in production.');
      process.exit(1);
    }
    process.env.COOKIE_SECRET = randomBytes(32).toString('hex');
    console.warn('COOKIE_SECRET not set - using an ephemeral one; sessions drop on restart.');
  }
  if (!process.env.BASE_URL) {
    process.env.BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
    console.warn(`BASE_URL not set - QR codes will point at ${process.env.BASE_URL}`);
  }
}

// Two known files, read once at boot and served from a fixed map. There is no
// path joining here, so no traversal to defend against.
const STATIC = new Map([
  ['app.css', { type: 'text/css; charset=utf-8', body: readFileSync(resolve(here, '../public/app.css')) }],
  ['app.js', { type: 'text/javascript; charset=utf-8', body: readFileSync(resolve(here, '../public/app.js')) }],
]);

export async function build() {
  requireConfig();
  migrate();

  const app = Fastify({
    logger: production ? true : { transport: undefined, level: 'warn' },
    bodyLimit: 256 * 1024,
  });

  await app.register(cookie, { secret: process.env.COOKIE_SECRET });
  await app.register(formbody);

  app.addHook('onRequest', authHook);

  app.get('/static/:file', async (request, reply) => {
    const asset = STATIC.get(request.params.file);
    if (!asset) return reply.code(404).send('Not found');
    return reply.type(asset.type).header('cache-control', 'no-cache').send(asset.body);
  });

  app.get('/', async (_request, reply) => reply.redirect('/items', 302));

  await app.register(authRoutes);
  await app.register(itemRoutes);
  await app.register(boxRoutes);
  await app.register(scanRoutes);
  await app.register(backupRoutes);

  return app;
}

// Only listen when run directly, so tests and scripts can import build().
const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runDirectly) {
  const app = await build();
  const port = Number(process.env.PORT || 3000);
  // 0.0.0.0 so the container (and a phone on the LAN) can reach it.
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`storage listening on ${port} - QR base URL ${process.env.BASE_URL}`);
}
