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

## Layout

| File | Phase | Purpose |
|------|-------|---------|
| `schema.ts` | 1 | Tables + indexes |
| `auth.ts` | 2 | Convex Auth + Google |
| `users.ts` | 3 | Profile sync |
| `usage.ts` | 4 | Daily limit + rate limit |
| `http.ts` | 6 | Flask HTTP bridge |
