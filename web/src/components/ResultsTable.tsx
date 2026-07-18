import type { CycleResult } from '../types';
import { formatAmount, formatPct } from '../format';

interface ResultsTableProps {
  results: CycleResult[];
  thresholdPct: number;
}

/** Dense "ticker" of every scanned cycle, feasible or not. */
export function ResultsTable({ results, thresholdPct }: ResultsTableProps) {
  const rows = [...results].sort((a, b) => b.simulation.profitPct - a.simulation.profitPct);

  return (
    <table className="ticker">
      <thead>
        <tr>
          <th>Cycle</th>
          <th className="num">Start</th>
          <th className="num hide-sm">End</th>
          <th className="num">Profit</th>
          <th>Feasible</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ cycle, simulation }) => {
          const isOpp = simulation.feasible && simulation.profitPct >= thresholdPct;
          const profitClass = simulation.profit >= 0 ? 'pos' : 'neg';
          return (
            <tr key={cycle.id} className={isOpp ? 'is-opp' : undefined}>
              <td>{cycle.id}</td>
              <td className="num">{formatAmount(simulation.startAmount, 2)}</td>
              <td className="num hide-sm">{formatAmount(simulation.endAmount, 2)}</td>
              <td className={`num ${profitClass}`}>{formatPct(simulation.profitPct)}</td>
              <td>
                <span className={`chip ${simulation.feasible ? 'chip--yes' : 'chip--no'}`}>
                  {simulation.feasible ? 'yes' : 'no'}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
