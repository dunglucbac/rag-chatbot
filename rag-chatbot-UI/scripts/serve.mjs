// Local UI QA: proxy the real API or an explicitly selected contract simulator.
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';

const origin = process.env.UI_API_ORIGIN ?? 'http://127.0.0.1:3000';
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/ui-model.mjs', ['ui-model.mjs', 'text/javascript']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const asset = files.get(pathname);
  if (asset && request.method === 'GET') {
    try {
      response.writeHead(200, {
        'Content-Type': asset[1],
        'Cache-Control': 'no-store',
      });
      response.end(
        await readFile(new URL(`../public/${asset[0]}`, import.meta.url)),
      );
    } catch {
      response.writeHead(404);
      response.end();
    }
    return;
  }
  const target = new URL(origin + request.url);
  const upstream = (target.protocol === 'https:' ? https : http).request(
    target,
    {
      method: request.method,
      headers: { ...request.headers, host: target.host },
    },
    (result) => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent)
      response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        status: 'error',
        message: 'The local API is unavailable.',
        data: null,
      }),
    );
  });
  request.pipe(upstream);
});
server.listen(4187, '127.0.0.1', () =>
  console.log(`Ledger UI preview: http://127.0.0.1:4187 (API: ${origin})`),
);
