import type { Opportunity } from '../types';
import { formatAmount, formatPct, formatRate } from '../format';

export function OpportunityCard({ opp }: { opp: Opportunity }) {
  const { cycle, simulation } = opp;
  const [a, b, c] = cycle.assets;
  const [l0, l1, l2] = simulation.legs;

  return (
    <article className="card">
      <div className="card__top">
        <span className="card__cycle">{cycle.id}</span>
        <span className="card__profit">{formatPct(simulation.profitPct)}</span>
      </div>
      <div className="card__amounts">
        {formatAmount(simulation.startAmount)} → {formatAmount(simulation.endAmount)} {a.code}
      </div>
      <div className="card__legs">
        <span className="leg">
          {a.code}→{b.code} <b>×{formatRate(l0?.effectivePrice)}</b>
        </span>
        <span className="leg">
          {b.code}→{c.code} <b>×{formatRate(l1?.effectivePrice)}</b>
        </span>
        <span className="leg">
          {c.code}→{a.code} <b>×{formatRate(l2?.effectivePrice)}</b>
        </span>
      </div>
    </article>
  );
}
