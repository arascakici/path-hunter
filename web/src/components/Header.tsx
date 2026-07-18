interface HeaderProps {
  network: string | undefined;
  paused: boolean;
  onTogglePause: () => void;
  onRefresh: () => void;
}

export function Header({ network, paused, onTogglePause, onRefresh }: HeaderProps) {
  return (
    <header className="masthead">
      <div className="masthead__brand">
        <span className="masthead__mark">
          PATH<b>HUNTER</b>
        </span>
        <span className="masthead__tag">Triangular Arbitrage · Stellar DEX</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="badge badge--net">
          <span className="badge__dot" />
          {network ?? 'connecting'}
        </span>
        <button type="button" className="badge" onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" className="badge" onClick={onTogglePause}>
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </header>
  );
}
