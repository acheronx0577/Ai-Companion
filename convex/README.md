# Convex backend

Auth: [CONVEX_AUTH.md](../CONVEX_AUTH.md) · Deploy: [RENDER.md](../RENDER.md) · Tests: [docs/PHASE_GATE.md](../docs/PHASE_GATE.md)

## How it works

```text
Browser  →  Convex (sign-in, profile, usage limits)
         →  Flask (chat AI, TTS, serves the web page)
```

| Stored in Convex | Handled by Flask |
|------------------|------------------|
| Google sign-in (Convex Auth) | Groq/Gemini chat (`/chat`) |
| User profile (`users`) | Piper/browser TTS (`/tts`) |
| Daily message limit | Session bridge (`/auth/convex-bridge`) |

**Limits:** 10 messages per day (see `constants.ts`). Each message is capped at 100 words (enforced in Flask — see `message_limits.py`).

Chat history is in the browser (`localStorage`), not Convex yet.

---

## Local dev

```bash
npm install
npm run dev          # from repo root — Convex + Flask
```

First run creates `.env.local` with `CONVEX_URL` and `CONVEX_SITE_URL`.

```bash
node scripts/sync_convex_auth_env.mjs
npm run convex:set-jwt-keys
```

---

## Deploy backend

```bash
npx convex deploy
npm run convex:set-jwt-keys:prod
node scripts/sync_convex_production.mjs https://YOUR-APP.onrender.com
```

---

## Main files

| File | Purpose |
|------|---------|
| `schema.ts` | Database tables |
| `constants.ts` | Limit numbers |
| `auth.ts` | Google sign-in |
| `users.ts` | Profile |
| `usage.ts` | Daily message limit |
| `chatHttp.ts` | Flask calls this before each chat message |

## Useful commands

```bash
npx convex run users:me
npx convex run usageInfo:phase4Status
npx convex run chatBridgeInfo:phase6Status
npx convex run jwtDebug:testJwtKey
npm run test:convex-phase6
```
