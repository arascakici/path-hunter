import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchScan } from '../api';
import type { ScanResponse } from '../types';

export interface PollState {
  data: ScanResponse | null;
  error: string | null;
  loading: boolean;
  lastUpdated: number | null;
  paused: boolean;
  refetch: () => void;
  setPaused: (paused: boolean) => void;
}

/**
 * Polls `/api/scan` every `intervalMs`, cancelling any in-flight request before
 * starting a new one. Exposes the latest data, error and loading state, plus
 * manual refetch and pause controls.
 */
export function usePolling(intervalMs: number): PollState {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    try {
      const result = await fetchScan(controller.signal);
      if (controller.signal.aborted) return;
      setData(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (paused) return;

    const timer = window.setInterval(() => void load(), intervalMs);
    return () => window.clearInterval(timer);
  }, [load, intervalMs, paused]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { data, error, loading, lastUpdated, paused, refetch: () => void load(), setPaused };
}
