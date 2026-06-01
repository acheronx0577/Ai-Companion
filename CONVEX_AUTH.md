# Convex Auth setup (Phase 2)

Google sign-in via **Convex Auth** runs alongside Flask OAuth until Phase 5.

## 1. Convex environment variables

In the [Convex dashboard](https://dashboard.convex.dev) (or via CLI), set:

| Variable | Value |
|----------|--------|
| `AUTH_GOOGLE_ID` | Same Client ID as `GOOGLE_OAUTH_CLIENT_ID` |
| `AUTH_GOOGLE_SECRET` | Same secret as `GOOGLE_OAUTH_CLIENT_SECRET` |
| `SITE_URL` | `http://127.0.0.1:5000` (local Flask origin) |
| `JWT_PRIVATE_KEY` | From `node scripts/generate_auth_keys.mjs` |
| `JWKS` | From same script (second line) |

CLI examples:

```bash
npx convex env set AUTH_GOOGLE_ID "your-client-id.apps.googleusercontent.com"
npx convex env set AUTH_GOOGLE_SECRET "your-secret"
npx convex env set SITE_URL http://127.0.0.1:5000
```

Generate JWT keys (run once, paste both lines into Convex env):

```bash
node scripts/generate_auth_keys.mjs
```

Alternatively, you can automatically generate and set both JWT keys in Convex using the command below (recommended on Windows to avoid CLI argument flag issues):

```bash
npm run convex:set-jwt-keys
```

Always restart `npx convex dev` after setting or changing any Convex environment variables.

Optional: sync Google vars from `.env`:

```bash
node scripts/sync_convex_auth_env.mjs
```

## 2. Google Cloud — add Convex redirect URI

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client → **Authorized redirect URIs**, add:

**Local Convex (from `.env.local` `CONVEX_SITE_URL`):**

```text
http://127.0.0.1:3211/api/auth/callback/google
```

**Cloud deployment:**

```text
https://YOUR-DEPLOYMENT.convex.site/api/auth/callback/google
```

Keep existing Flask URI:

```text
http://127.0.0.1:5000/auth/google/callback
https://YOUR-APP.onrender.com/auth/google/callback
```

## 3. Test sign-in + profile sync (Phase 3)

```bash
npm run convex:dev
python app.py
```

Open http://127.0.0.1:5000/convex-auth-test → **Sign in with Google (Convex)**.

After redirect, the page auto-calls `users.upsertFromAuth` and shows `users.me` JSON.

**Phase 4:** Use **Test increment** to exercise `usage.increment` until `remaining: 0` (11th message blocked).

After success, check Convex dashboard → **Data** → `users`, `dailyUsage`, `chatRateState`.

## 4. Verify

```bash
npm run phase:gate -- 2   # Auth wiring
npm run phase:gate -- 3   # User sync + test page
npx convex run authInfo:phase2Status
npx convex run usersInfo:phase3Status
```
