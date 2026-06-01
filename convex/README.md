# Convex backend (WakuWaku)

Phased rollout: see [ARCHITECTURE.md](../ARCHITECTURE.md).

## Phase 0 — local dev

```bash
npm install
npm run convex:dev          # watch mode (local deployment by default)
# or
npm run convex:dev:once     # push once and exit
```

After first run, `.env.local` contains `CONVEX_URL` and `CONVEX_DEPLOYMENT`.

Optional: `npx convex login` to link a cloud project instead of anonymous local.

## Verify Phase 0

```bash
npm run phase:gate -- 0
```

Or manually:

```bash
npm run test:convex-phase0
python -m unittest tests.test_convex_phase0 -v
npx convex run users:bootstrapPing
```

## Phase 1 — schema

Tables: `users`, `dailyUsage`, `chatSessions`, `chatMessages` (chat tables stubbed for Phase 4b).

Constants in `constants.ts` mirror `usage_limit.py`.

```bash
npm run test:convex-phase1
npm run convex:dev:once
npx convex run schemaInfo:phase1Status
```

## Layout

| File | Phase | Purpose |
|------|-------|---------|
| `schema.ts` | 1 | Tables + indexes |
| `constants.ts` | 1 | Daily + rate limits |
| `schemaInfo.ts` | 1 | `phase1Status` query |
| `auth.ts` | 2 | Convex Auth + Google |
| `users.ts` | 3 | Profile sync |
| `usage.ts` | 4 | Daily limit + rate limit |
| `http.ts` | 6 | Flask HTTP bridge |
