# Convex Auth setup

Google sign-in uses **Convex Auth** in the main app (sidebar button). Flask `/auth/google` is only a fallback when Convex is not configured.

**Production:** see [RENDER.md](RENDER.md) §4 — different `SITE_URL` and redirect URIs.

---

## 1. Convex environment variables (local dev)

In the [Convex dashboard](https://dashboard.convex.dev) → **Development** (or CLI):

| Variable | Value |
|----------|--------|
| `AUTH_GOOGLE_ID` | Same as `GOOGLE_OAUTH_CLIENT_ID` in `.env` |
| `AUTH_GOOGLE_SECRET` | Same as `GOOGLE_OAUTH_CLIENT_SECRET` |
| `SITE_URL` | `http://127.0.0.1:5000` |
| `JWT_PRIVATE_KEY` | From `npm run convex:set-jwt-keys` |
| `JWKS` | Set together with the script above |

Quick sync from `.env`:

```bash
node scripts/sync_convex_auth_env.mjs
npm run convex:set-jwt-keys
```

Restart after any Convex env change: stop and run `npm run dev` again.

**Production JWT** (different deployment):

```bash
npm run convex:set-jwt-keys:prod
```

Do **not** use `npm run convex:set-jwt-keys -- --prod` — npm breaks the `--prod` flag.

---

## 2. Google Cloud — redirect URIs

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client → **Authorized redirect URIs**:

**Local:**

```text
http://127.0.0.1:5000/auth/google/callback
http://127.0.0.1:3211/api/auth/callback/google
```

**Production** (replace hostnames):

```text
https://YOUR-APP.onrender.com/auth/google/callback
https://YOUR-PROJECT.convex.site/api/auth/callback/google
```

Use `127.0.0.1`, not `localhost`, for local sign-in.

---

## 3. Run and test

```bash
npm run dev
```

Open http://127.0.0.1:5000 — sign in from the sidebar.

Optional debug page: http://127.0.0.1:5000/convex-auth-test

Check data: Convex dashboard → **Data** → `users`, `dailyUsage`, `chatRateState`.

---

## 4. Verify

```bash
npm run phase:gate -- 2
npx convex run jwtDebug:testJwtKey
npx convex run authInfo:phase2Status
```

JWT health: `configured: true`, `valid: true`.
