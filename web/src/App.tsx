import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { OpportunityCard } from './components/OpportunityCard';
import { ResultsTable } from './components/ResultsTable';
import { usePolling } from './hooks/usePolling';

const POLL_INTERVAL_MS = 8000;

export function App() {
  const { data, error, loading, lastUpdated, paused, refetch, setPaused } = usePolling(POLL_INTERVAL_MS);

  const opportunities = data?.opportunities ?? [];
  const results = data?.results ?? [];

  return (
    <div className="app">
      <Header
        network={data?.network}
        paused={paused}
        onTogglePause={() => setPaused(!paused)}
        onRefresh={refetch}
      />

      <StatusBar data={data} lastUpdated={lastUpdated} loading={loading} />

      {error && (
        <div className="section">
          <div className="notice notice--error">
            Scan failed: {error}
            <div style={{ marginTop: 8, fontSize: 11 }}>
              Is the API running? Start it with <b>npm run dev</b>.
            </div>
          </div>
        </div>
      )}

      <section className="section">
        <h2 className="section__title">
          Opportunities <span className="section__count">[{opportunities.length}]</span>
        </h2>
        {opportunities.length > 0 ? (
          <div className="cards">
            {opportunities.map((opp) => (
              <OpportunityCard key={opp.cycle.id} opp={opp} />
            ))}
          </div>
        ) : (
          <div className="notice">
            {data
              ? `No cycles above ${data.config.thresholdPct}% right now — the hunt continues.`
              : 'Waiting for the first scan…'}
          </div>
        )}
      </section>

      {results.length > 0 && (
        <section className="section">
          <h2 className="section__title">
            All cycles <span className="section__count">[{results.length}]</span>
          </h2>
          <ResultsTable results={results} thresholdPct={data?.config.thresholdPct ?? 0} />
        </section>
      )}

      <footer className="foot">
        <span>
          Network: {data?.network ?? '—'} · Assets: {data?.config.assets.join(' · ') ?? '—'}
        </span>
        <span>Testnet only · no real value</span>
      </footer>
    </div>
  );
}
