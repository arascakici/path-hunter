import { runScanApi } from '../src/api/scan-handler.js';

/**
 * Vercel serverless function: GET /api/scan
 *
 * Runs one stateless scan against Horizon testnet and returns the
 * opportunities as JSON. Uses the Node runtime because the Stellar SDK is not
 * Edge-compatible.
 */
export const config = { runtime: 'nodejs' };

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

export async function GET(): Promise<Response> {
  try {
    const data = await runScanApi();
    return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: JSON_HEADERS });
  }
}
