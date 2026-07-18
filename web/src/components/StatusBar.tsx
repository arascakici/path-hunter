import type { ScanResponse } from '../types';
import { formatClock } from '../format';

interface StatusBarProps {
  data: ScanResponse | null;
  lastUpdated: number | null;
  loading: boolean;
}

export function StatusBar({ data, lastUpdated, loading }: StatusBarProps) {
  const oppCount = data?.opportunities.length ?? 0;
  return (
    <div className="status">
      <Cell label="Start asset" value={data?.config.startAsset ?? '—'} />
      <Cell label="Probe size" value={data ? String(data.config.startAmount) : '—'} />
      <Cell label="Threshold" value={data ? `${data.config.thresholdPct}%` : '—'} tone="amber" />
      <Cell label="Cycles" value={data ? String(data.cyclesScanned) : '—'} />
      <Cell label="Opportunities" value={String(oppCount)} tone="turq" />
      <Cell label={loading ? 'Scanning…' : 'Last scan'} value={formatClock(lastUpdated)} />
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'turq' }) {
  const cls = tone === 'amber' ? 'status__value--amber' : tone === 'turq' ? 'status__value--turq' : '';
  return (
    <div className="status__cell">
      <div className="status__label">{label}</div>
      <div className={`status__value ${cls}`}>{value}</div>
    </div>
  );
}
