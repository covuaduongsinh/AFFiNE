import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * Serves a built web bundle, proxying the API to a running backend.
 *
 * The dev server is the normal way to run this app. This exists for machines
 * where it does not work — an antivirus HTTP proxy that scans every localhost
 * response will choke on the dev build's ~44 MB unminified `index.js` and the
 * page never finishes loading. A production build is minified and code-split,
 * so each response is small enough to get through.
 *
 * Build first, and note the public path: without it the bundle points at
 * AFFiNE's asset CDN and every request fails CORS.
 *
 *   PUBLIC_PATH=/ yarn affine build -p web
 *   node scripts/serve-dist.mjs
 *
 * Then open http://localhost:5173/
 */
const ROOT = resolve(process.env.DIST_DIR ?? 'packages/frontend/apps/web/dist');
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 5173);
const API_ORIGIN = process.env.API_ORIGIN ?? '127.0.0.1:3010';

/**
 * The build emits two entry documents over the same bundle. `selfhost.html`
 * carries `<meta name="env:isSelfHosted">`, and that one tag is what makes the
 * app treat the origin it was served from as a self-hosted server rather than
 * AFFiNE Cloud: it becomes the default server, it stops advertising features
 * this backend does not implement, and socket.io is allowed to fall back to
 * long polling. Every backend in this repo is self-hosted, so that is the right
 * default. Set APP_HTML=index.html to serve the cloud entry instead.
 */
const APP_HTML = process.env.APP_HTML ?? 'selfhost.html';

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip',
};

/** Paths the app expects a backend to answer. */
const isApi = url =>
  url.startsWith('/api') ||
  url.startsWith('/graphql') ||
  url.startsWith('/socket.io');

if (!existsSync(join(ROOT, APP_HTML))) {
  console.error(`No build found at ${join(ROOT, APP_HTML)}`);
  console.error('Run:  PUBLIC_PATH=/ yarn affine build -p web');
  process.exit(1);
}

const [apiHost, apiPort] = API_ORIGIN.split(':');

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (isApi(url)) {
    const proxy = httpRequest(
      {
        host: apiHost,
        port: Number(apiPort),
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      upstream => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      }
    );
    // A missing backend must not take the whole page down: the app is
    // local-first and works without one.
    proxy.on('error', () => {
      res
        .writeHead(502, { 'content-type': 'application/json' })
        .end('{"errors":[{"message":"backend unavailable"}]}');
    });
    req.pipe(proxy);
    return;
  }

  // Everything else is a static asset, falling back to the entry document so
  // the client-side router owns the URL space.
  const candidate = normalize(join(ROOT, url));
  const file =
    candidate.startsWith(ROOT) &&
    existsSync(candidate) &&
    statSync(candidate).isFile()
      ? candidate
      : join(ROOT, APP_HTML);

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
});

// Sync opens a WebSocket. Without this the handshake never reaches the backend
// and socket.io falls back to long polling, which works but keeps a request in
// flight at all times — exactly what the antivirus proxy handles worst.
server.on('upgrade', (req, socket, head) => {
  if (!isApi(decodeURIComponent((req.url ?? '/').split('?')[0]))) {
    socket.destroy();
    return;
  }

  const upstream = netConnect(Number(apiPort), apiHost, () => {
    let handshake = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      handshake += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    upstream.write(`${handshake}\r\n`);
    if (head?.length) {
      upstream.write(head);
    }
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT}`);
  console.log(`  ->  http://localhost:${PORT}/`);
});
