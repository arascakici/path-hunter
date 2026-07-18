import { createServer } from 'node:http';
import { runScanApi } from '../src/api/scan-handler.js';
import { createLogger } from '../src/logger/logger.js';

/**
 * Local stand-in for the Vercel serverless function. Serves GET /api/scan on a
 * port so the web panel's Vite dev server can proxy to it during development.
 * In production the same `runScanApi` runs inside `api/scan.ts`.
 */

const port = Number(process.env.API_PORT ?? 3000);
const log = createLogger();

const server = createServer(async (req, res) => {
  const url = req.url ?? '';

  if (req.method === 'GET' && url.startsWith('/api/scan')) {
    try {
      const data = await runScanApi();
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('scan request failed', { err: message });
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, () => {
  log.info('PathHunter dev API listening', { url: `http://localhost:${port}/api/scan` });
});
