import { describe, expect, it } from 'vitest';
import {
  buildTriangularCycles,
  fillBuy,
  isProfitable,
  simulateCycle,
} from '../src/arbitrage/triangular.js';
import type { CycleSimulation, OrderBook, OrderBookLevel } from '../src/arbitrage/types.js';

/** Builds an order book from `[price, amount]` ask tuples (bids unused by the math). */
function asks(...levels: [number, number][]): OrderBook {
  return {
    base: 'BASE',
    counter: 'COUNTER',
    bids: [],
    asks: levels.map(([price, amount]): OrderBookLevel => ({ price, amount })),
  };
}

/** A book deep enough that a leg at `price` never exhausts at test sizes. */
function deep(price: number): OrderBook {
  return asks([price, 1_000_000]);
}

describe('fillBuy', () => {
  it('fills a single level exactly', () => {
    const r = fillBuy(50, [{ price: 2, amount: 25 }]); // cost = 25 * 2 = 50
    expect(r.bought).toBeCloseTo(25, 7);
    expect(r.spent).toBeCloseTo(50, 7);
    expect(r.exhausted).toBe(false);
  });

  it('partially fills a level and does not exhaust', () => {
    const r = fillBuy(30, [{ price: 2, amount: 100 }]); // only spend 30 of a 200-cost level
    expect(r.bought).toBeCloseTo(15, 7);
    expect(r.spent).toBeCloseTo(30, 7);
    expect(r.exhausted).toBe(false);
  });

  it('walks multiple levels, modelling slippage', () => {
    // spend 100 across [price 1 x50 (cost 50), price 2 x50]: 50 units then 25 units
    const r = fillBuy(100, [
      { price: 1, amount: 50 },
      { price: 2, amount: 50 },
    ]);
    expect(r.bought).toBeCloseTo(75, 7);
    expect(r.spent).toBeCloseTo(100, 7);
    expect(r.exhausted).toBe(false);
  });

  it('marks exhausted when the book is too thin', () => {
    const r = fillBuy(100, [{ price: 1, amount: 10 }]);
    expect(r.bought).toBeCloseTo(10, 7);
    expect(r.spent).toBeCloseTo(10, 7);
    expect(r.exhausted).toBe(true);
  });

  it('returns nothing and exhausts on an empty book', () => {
    const r = fillBuy(100, []);
    expect(r.bought).toBe(0);
    expect(r.spent).toBe(0);
    expect(r.exhausted).toBe(true);
  });

  it('skips non-positive price/amount levels', () => {
    const r = fillBuy(30, [
      { price: 0, amount: 100 },
      { price: -1, amount: 50 },
      { price: 1, amount: 0 },
      { price: 1, amount: 50 },
    ]);
    expect(r.bought).toBeCloseTo(30, 7);
    expect(r.spent).toBeCloseTo(30, 7);
    expect(r.exhausted).toBe(false);
  });
});

describe('simulateCycle', () => {
  it('detects a profitable, feasible cycle', () => {
    // end = start / (p1*p2*p3) = 100 / (1*1*0.5) = 200
    const sim = simulateCycle(100, [deep(1), deep(1), deep(0.5)]);
    expect(sim.feasible).toBe(true);
    expect(sim.endAmount).toBeCloseTo(200, 6);
    expect(sim.profit).toBeCloseTo(100, 6);
    expect(sim.profitPct).toBeCloseTo(100, 6);
  });

  it('reports a break-even cycle as ~0%', () => {
    const sim = simulateCycle(100, [deep(1), deep(1), deep(1)]);
    expect(sim.feasible).toBe(true);
    expect(sim.profitPct).toBeCloseTo(0, 9);
  });

  it('reports a losing cycle with negative profit', () => {
    // end = 100 / (1*1*2) = 50
    const sim = simulateCycle(100, [deep(1), deep(1), deep(2)]);
    expect(sim.feasible).toBe(true);
    expect(sim.endAmount).toBeCloseTo(50, 6);
    expect(sim.profitPct).toBeCloseTo(-50, 6);
  });

  it('marks the cycle infeasible when any leg exhausts', () => {
    const sim = simulateCycle(100, [deep(1), asks([1, 10]), deep(1)]);
    expect(sim.legs[1]?.exhausted).toBe(true);
    expect(sim.feasible).toBe(false);
  });

  it('populates per-leg detail correctly', () => {
    const sim = simulateCycle(100, [deep(1), deep(1), deep(0.5)]);
    const [l0, l1, l2] = sim.legs;
    expect(l0).toMatchObject({ input: 100, output: 100, consumed: 100, exhausted: false });
    expect(l1?.input).toBeCloseTo(100, 6);
    expect(l2?.input).toBeCloseTo(100, 6);
    expect(l2?.output).toBeCloseTo(200, 6);
    expect(l2?.effectivePrice).toBeCloseTo(2, 6); // 200 out / 100 in
  });

  it('applies a per-leg fee haircut', () => {
    // all rates 1, so end = 100 * 0.99^3
    const sim = simulateCycle(100, [deep(1), deep(1), deep(1)], { feePerLegPct: 1 });
    expect(sim.endAmount).toBeCloseTo(100 * 0.99 ** 3, 6);
    expect(sim.profitPct).toBeLessThan(0);
  });

  it('ignores an invalid negative fee', () => {
    const withBadFee = simulateCycle(100, [deep(1), deep(1), deep(1)], { feePerLegPct: -5 });
    expect(withBadFee.profitPct).toBeCloseTo(0, 9);
  });

  it('throws on a non-positive start amount', () => {
    expect(() => simulateCycle(0, [deep(1), deep(1), deep(1)])).toThrow(/positive/);
    expect(() => simulateCycle(-10, [deep(1), deep(1), deep(1)])).toThrow(/positive/);
  });
});

describe('isProfitable', () => {
  const base: CycleSimulation = {
    startAmount: 100,
    endAmount: 101,
    profit: 1,
    profitPct: 1,
    feasible: true,
    legs: [],
  };

  it('is true when feasible and at/above threshold', () => {
    expect(isProfitable({ ...base, profitPct: 1 }, 1)).toBe(true);
    expect(isProfitable({ ...base, profitPct: 2 }, 1)).toBe(true);
  });

  it('is false when below threshold', () => {
    expect(isProfitable({ ...base, profitPct: 0.4 }, 0.5)).toBe(false);
  });

  it('is false when infeasible even with high profit', () => {
    expect(isProfitable({ ...base, profitPct: 99, feasible: false }, 0.5)).toBe(false);
  });
});

describe('buildTriangularCycles', () => {
  const assets = [
    { code: 'XLM', issuer: null },
    { code: 'USDC', issuer: 'G1' },
    { code: 'SRT', issuer: 'G2' },
  ];

  it('generates both directions for a 3-asset set', () => {
    const cycles = buildTriangularCycles(assets, 'XLM');
    expect(cycles.map((c) => c.id)).toEqual(['XLM->USDC->SRT', 'XLM->SRT->USDC']);
  });

  it('generates n*(n-1) cycles over n intermediates', () => {
    const four = [...assets, { code: 'EURC', issuer: 'G3' }];
    // 3 intermediates -> 3 * 2 = 6 ordered pairs
    expect(buildTriangularCycles(four, 'XLM')).toHaveLength(6);
  });

  it('never repeats or reuses the start asset as an intermediate', () => {
    const cycles = buildTriangularCycles(assets, 'XLM');
    for (const c of cycles) {
      const [a, b, cc] = c.assets;
      expect(a.code).toBe('XLM');
      expect(b.code).not.toBe('XLM');
      expect(cc.code).not.toBe('XLM');
      expect(b.code).not.toBe(cc.code);
    }
  });

  it('throws when the start asset is absent', () => {
    expect(() => buildTriangularCycles(assets, 'MISSING')).toThrow(/not in the provided asset list/);
  });
});
