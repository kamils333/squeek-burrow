# Squeek Burrow 🐹🌻

An idle game powered by a real hamster.

Squeektoshi runs on the WHEELY9000 for [Squeekchain](https://squeekchain.com), the hamster-powered proof-of-work toychain on Ethereum. In Squeek Burrow, every real turn of that wheel grows your sunflower seeds.

- **Live link:** the game polls the public Squeekchain API. While Squeektoshi is running, the wheel on screen spins at the real rpm and your income gets a live boost.
- **Offline earnings:** when you come back, the half-hour wheel history (`/v1/measurement/stats`) pays out what the real hamster ran while you were away, up to your Seed Storage cap (max 7 days).
- **Upgrades:**

  | Upgrade | Effect |
  | --- | --- |
  | Wheel Tuning | Seeds per real wheel turn |
  | Sunflower Field | Idle seeds per second |
  | Cheer Squad | Multiplier while the real hamster runs |
  | Seed Storage | Offline earnings cap |

Seeds are a game score only. They are not SQK or tokens, and the game needs no wallet. Progress is saved in your browser (localStorage).

## Squeekchain

- Genesis Code: https://squeekchain.com/genesis/code
- Docs: https://docs.squeekchain.com/
- API: https://api.squeekchain.com/v1/status (public, read-only, no key)
- Network: Ethereum Sepolia (chain ID 11155111)

## Genesis submission

This is a community project for the Squeekchain Genesis Buildooooor badge. It is not affiliated with Squeekchain.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Deploy

Import the GitHub repository at [vercel.com/new](https://vercel.com/new). It needs no settings and no environment variables. Every push to `main` redeploys.

API requests go straight from the browser to `api.squeekchain.com`. If that fails, they fall back to a same-origin rewrite at `/sq/*` (see `next.config.mjs`).

## Files

| Path | What |
| --- | --- |
| `components/Game.tsx` | Game loop, live polling, offline settlement, UI |
| `components/Wheel.tsx` | SVG wheel and hamster, spun at the real rpm |
| `lib/api.ts` | Squeekchain API client and the turns-between-timestamps calculation |
| `lib/game.ts` | Economy, upgrades and save/load |
