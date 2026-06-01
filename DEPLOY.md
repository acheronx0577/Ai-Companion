# Deploy on Railway

**Phased guide:** see **[RAILWAY.md](RAILWAY.md)** (Phase 0 → 4 step by step).

Host the Flask app on [Railway](https://railway.com). Convex (when added) stays on Convex Cloud; the browser uses `CONVEX_URL` from env.

## What Railway runs

| Component | On Railway |
|-----------|------------|
| Flask (`/`, `/chat`, `/tts`, `/auth/*`) | Yes |
| Groq API | External (env var only) |
| Google OAuth | Your Railway HTTPS URL |
| Piper TTS | Optional — often slow or OOM on small plans; **browser voice still works** |
| Convex | Not on Railway — [convex.dev](https://convex.dev) |

## 1. Push code to GitHub

Railway deploys from a Git repo. Commit and push this project.

## 2. Create a Railway project

1. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**.
2. Select this repository.
3. Railway detects Python via `railway.toml` / `requirements.txt`.

First deploy may take several minutes (`onnxruntime` + dependencies are large).

## 3. Generate a public URL

1. Open the service → **Settings** → **Networking** → **Generate Domain**.
2. Note your URL, e.g. `https://wakuwaku-production.up.railway.app`.

Railway sets `RAILWAY_PUBLIC_DOMAIN` automatically (used for secure cookies and OAuth).

## 4. Environment variables

In the service → **Variables**, add:

| Variable | Required | Example |
|----------|----------|---------|
| `GROQ_API_KEY` | Yes (for chat) | `gsk_...` |
| `FLASK_SECRET_KEY` | Yes | long random string |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes (for sign-in) | `....apps.googleusercontent.com` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | `GOCSPX-...` |
| `CONVEX_URL` | When using Convex | `https://....convex.cloud` |

Optional:

| Variable | Purpose |
|----------|---------|
| `GROQ_MODEL` | Default `llama-3.1-8b-instant` |
| `CHAT_PROVIDER` | `groq` or `gemini` |
| `USAGE_LIMIT_PEPPER` | Usage hashing |
| `PRODUCTION` | `1` — force secure cookies if not on Railway |
| `DISABLE_PIPER` | `1` — skip server TTS (use browser voice; saves memory on Railway) |

Do **not** commit `.env` to git.

**Pre-flight:** `python scripts/check_deploy_env.py`

## 5. Google OAuth redirect URIs

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → your OAuth client → **Authorized redirect URIs**, add:

```
https://YOUR-RAILWAY-DOMAIN.up.railway.app/auth/google/callback
```

Replace with your real Railway domain. Keep `http://127.0.0.1:5000/auth/google/callback` for local dev.

When Convex Auth is enabled, also add redirect URIs from the Convex dashboard / CLI.

## 6. Redeploy

After saving variables, Railway redeploys. Open your public URL and:

1. Sign in with Google  
2. Send a test message (Groq)  
3. If voice fails, use browser TTS — Piper may be unavailable on small instances  

## 7. Logs and debugging

- **Deployments** → latest deploy → **View logs**
- Chat errors: look for `Chat request failed` in logs
- Auth errors: check OAuth redirect URI matches exactly (https, no trailing slash on domain)

## Build configuration (repo files)

| File | Role |
|------|------|
| `railway.json` | Dockerfile builder, health check, region |
| `Dockerfile` | Python 3.12-slim + `requirements-railway.txt` |
| `nixpacks.toml` | Fallback Nixpacks config (if you switch builder back) |
| `nixpacks.toml` | Python 3.12 |
| `Procfile` | Fallback start command |
| `requirements.txt` | Includes `gunicorn` |

Start command:

```bash
python -u railway_serve.py
```

(`railway_serve.py` reads numeric `PORT` from the environment — do **not** use `$PORT` or `${PORT}` in a custom start command.)

## Cost / sizing

- Hobby usage is fine for a class demo (~10 msgs/day per user).
- If the build fails or the app crashes on boot, try a **larger memory** plan or remove Piper from the deploy (browser TTS only). Piper needs `voices/*.onnx` plus `onnxruntime` RAM.

## Local vs production

| | Local | Railway |
|---|--------|---------|
| Run | `python app.py` | Gunicorn (automatic) |
| URL | `http://127.0.0.1:5000` | `https://*.up.railway.app` |
| Debug | `FLASK_DEBUG=1` optional | Leave unset |
