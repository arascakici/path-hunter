/** Formatting helpers for the panel. */

export function formatPct(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatAmount(value: number, digits = 4): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatRate(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(4);
}

/** A short local clock string like "19:36:43". */
export function formatClock(epochMs: number | null): string {
  if (epochMs === null) return '—';
  return new Date(epochMs).toLocaleTimeString('en-US', { hour12: false });
}
