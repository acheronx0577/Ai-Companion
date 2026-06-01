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

## Phase 2 — Convex Auth (Google)

See [CONVEX_AUTH.md](../CONVEX_AUTH.md). Test page: http://127.0.0.1:5000/convex-auth-test

```bash
npm run test:convex-phase2
npx convex run authInfo:phase2Status
```

## Phase 3 — User sync

`users.upsertFromAuth` patches profile fields from the auth identity; `users.me` returns the current user.

```bash
npm run test:convex-phase3
npx convex run usersInfo:phase3Status
npx convex run users:me   # null when not authenticated from CLI
```

## Phase 4 — usage limits

`usage.status` (read-only) and `usage.increment` (auth required). Rate limits stored in `chatRateState`.

```bash
npm run test:convex-phase4
npx convex run usageInfo:phase4Status
npx convex run usage:checkDailyLimit '{"used":10}'
```

## Phase 6 — Flask `/chat` bridge

Flask calls `POST {CONVEX_SITE_URL}/api/chat/increment-usage` with the user's Convex Auth JWT before running the LLM.

```bash
npm run test:convex-phase6
npx convex run chatBridgeInfo:phase6Status
```

When `CONVEX_URL` is in `.env.local`, `USE_CONVEX_USAGE` defaults on (set `USE_CONVEX_USAGE=0` to use local `daily_usage.json`).

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
