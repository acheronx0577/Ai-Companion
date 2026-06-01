# Deploy on Render

Host the Flask app on [Render](https://render.com). Convex (when added) stays on [Convex Cloud](https://convex.dev).

## What Render runs

| Component | On Render |
|-----------|-----------|
| Flask (`/`, `/chat`, `/tts`, `/auth/*`) | Yes (Docker) |
| Groq API | External (env var) |
| Google OAuth | Your `https://….onrender.com` URL |
| Piper TTS | Off by default (`DISABLE_PIPER=1`) — browser voice works |
| Convex | Not on Render — set `CONVEX_URL` in env when ready |

---

## 1. Push code to GitHub

Commit includes `Dockerfile`, `serve.py`, and `requirements-prod.txt`.

---

## 2. Create a Web Service

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. Connect **GitHub** → repo **Ai-Companion**
3. Settings:

| Field | Value |
|-------|--------|
| **Name** | `wakuwaku-companion` (or any name) |
| **Region** | Closest to you |
| **Branch** | `main` |
| **Runtime** | **Docker** |
| **Instance type** | Free |

Render auto-detects the root `Dockerfile`. Do **not** set a custom Docker command with `$PORT`.

4. **Advanced** → **Health Check Path**: `/health`

---

## 3. Environment variables

In the service → **Environment**:

| Variable | Required |
|----------|----------|
| `GROQ_API_KEY` | Yes |
| `FLASK_SECRET_KEY` | Yes (long random string) |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes |
| `DISABLE_PIPER` | `1` (recommended on Free tier) |
| `CONVEX_URL` | Yes — **production** URL from [Convex dashboard](https://dashboard.convex.dev) → Settings → Production |
| `CONVEX_SITE_URL` | Yes — same project, `https://….convex.site` (not `.cloud`) |
| `PRODUCTION` | `1` (recommended — secure cookies behind HTTPS) |

Do **not** set `PORT` — Render sets it automatically.

Do **not** point `CONVEX_URL` at `http://127.0.0.1:3210` — that is local dev only.

---

## 4. Google OAuth + Convex Auth (production)

The main app sign-in button uses **Convex Auth**, not Flask `/auth/google`, when `CONVEX_URL` is set.

You must configure **three places** (local-only setup is not enough):

### A. Render environment

Set `CONVEX_URL` and `CONVEX_SITE_URL` from your **deployed** Convex project (Production deployment in the dashboard).

### B. Convex **production** environment variables

In [Convex dashboard](https://dashboard.convex.dev) → your project → **Production** → Environment Variables:

| Variable | Example for this app |
|----------|----------------------|
| `SITE_URL` | `https://ai-companion-ngbi.onrender.com` |
| `AUTH_GOOGLE_ID` | Same as `GOOGLE_OAUTH_CLIENT_ID` |
| `AUTH_GOOGLE_SECRET` | Same as `GOOGLE_OAUTH_CLIENT_SECRET` |
| `JWT_PRIVATE_KEY` | From `npm run convex:set-jwt-keys -- --prod` |
| `JWKS` | Set together with JWT script |

From your machine (after `npx convex deploy`):

```bash
node scripts/sync_convex_production.mjs https://ai-companion-ngbi.onrender.com
npm run convex:set-jwt-keys -- --prod
```

`SITE_URL` must be your **public Render URL**, not `http://127.0.0.1:5000`. If it stays on localhost, Google sign-in on Render will fail or redirect wrong.

### C. Google Cloud — **Authorized redirect URIs**

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client, add **both**:

```text
https://ai-companion-ngbi.onrender.com/auth/google/callback
https://YOUR-PROJECT-NAME.convex.site/api/auth/callback/google
```

Replace `YOUR-PROJECT-NAME` with the hostname from Convex dashboard `CONVEX_SITE_URL` (e.g. `happy-animal-123.convex.site`).

Keep for local dev:

```text
http://127.0.0.1:5000/auth/google/callback
http://127.0.0.1:3211/api/auth/callback/google
```

### Verify

Open `https://ai-companion-ngbi.onrender.com/health` and check:

- `googleOAuthConfigured`: true  
- `convex.urlConfigured` / `convex.siteUrlConfigured`: true  
- `convex.expectedGoogleCallback`: `https://….convex.site/api/auth/callback/google`  

Add that exact `expectedGoogleCallback` URL in Google Cloud if missing.

---

## 5. Deploy and test

1. Wait for **Live** status (first build ~5–10 min).
2. Open `https://YOUR-SERVICE.onrender.com/health` → `"status": "ok"`
3. Sign in with Google → send a chat message.

**Note:** Free tier **spins down** after ~15 min idle; first visit may take 30–60s to wake up.

---

## Pre-flight (local)

```powershell
python scripts/check_deploy_env.py
python -m unittest tests.test_serve tests.test_deploy -v
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails | Check Render build logs; confirm `Dockerfile` at repo root |
| 502 on wake | Normal on Free tier — wait and refresh |
| Google login error | Add **both** Render `/auth/google/callback` and Convex `….convex.site/api/auth/callback/google`; set Convex prod `SITE_URL` to your Render URL |
| Convex sign-in blocked | `CONVEX_URL` on Render must be **cloud** URL; JWT keys on **Production** deployment; not local `127.0.0.1:3210` |
| No CSS | Ensure `static/` is in the repo (not in `.dockerignore`) |

See also [docs/README.md](docs/README.md) for all documentation links.
