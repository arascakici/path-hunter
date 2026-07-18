# PathHunter

> A scanner bot that hunts **triangular arbitrage** (A→B→C→A cycles) on Stellar's
> built-in DEX — **testnet only**, no real money.

PathHunter fetches order books for a configurable set of assets, simulates round-trip
cycles through Stellar's decentralized exchange, and flags cycles that return more than
you put in. It ships with a local CLI bot and a React web panel.

⚠️ **Testnet only.** PathHunter talks exclusively to Horizon testnet and funds accounts
via Friendbot. There is no mainnet code path and no real value at risk.

## Status

🚧 Under construction — building in small steps. See the sections below as they land.

## Documentation (coming as the project is built)

- Setup & installation
- Testnet setup (Friendbot funding)
- Usage: `scan` and `execute` modes
- Example output
- Web panel & Vercel deployment

---

Built as a portfolio project. TypeScript · Node · `@stellar/stellar-sdk` · React + Vite.
