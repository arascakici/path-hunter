import type { ScanResponse } from './types';

/** Fetches one scan from the API, throwing a readable error on failure. */
export async function fetchScan(signal?: AbortSignal): Promise<ScanResponse> {
  const res = await fetch('/api/scan', { signal, headers: { accept: 'application/json' } });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* ignore body parse errors */
    }
    throw new Error(detail);
  }

  return (await res.json()) as ScanResponse;
}
