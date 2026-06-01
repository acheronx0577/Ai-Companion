# Railway deployment — phased guide

Deploy **one phase at a time**. Finish each phase’s exit criteria before the next.  
Convex backend comes **after** Railway is live (see `ARCHITECTURE.md`).

| Phase | Who | Goal |
|-------|-----|------|
| **0** | Code (repo) | Gunicorn, health check, deploy hints |
| **1** | You (Railway UI) | GitHub → new Railway service |
| **2** | You (Railway UI) | Environment variables |
| **3** | You (Google + Railway) | Public domain + OAuth redirect |
| **4** | You (browser) | Smoke test production |
| **5** | Later | `CONVEX_URL` when Convex Phase 5 ships |

---

## Phase 0 — Repo ready (code)

**Status:** Complete in repo.

| File | Role |
|------|------|
| `railway.json` | Start command, health check, EU region |
| `nixpacks.toml` | Python 3.12 |
| `Procfile` | Fallback start |
| `requirements.txt` | Includes `gunicorn` |
| `app.py` | Proxy fix, `/health`, deploy logs |

**Verify locally:**

```powershell
cd "path\to\Ai-Companion"
.\venv\Scripts\Activate.ps1
pip install gunicorn
$env:PORT="5000"
gunicorn app:app --bind 0.0.0.0:5000
```

Open http://127.0.0.1:5000/health — should show `"status": "ok"`.

**Optional check env (before Railway):**

```powershell
python scripts/check_deploy_env.py
```

**Exit:** `/health` returns JSON; `gunicorn` starts without errors.

**PR (optional):** `feat/railway-phase-0-config`

---

## Phase 1 — Connect Railway (YOU + push)

**Code status:** Ready — uses `requirements-railway.txt` (faster build, no Gemini/Piper on server).

### A. Run tests locally (done in `/build`)

```powershell
$env:GROQ_API_KEY="test"
python -m unittest tests.test_deploy -v
```

### B. Commit and push to GitHub

```powershell
git add railway.toml nixpacks.toml Procfile requirements-railway.txt requirements.txt
git add app.py DEPLOY.md RAILWAY.md scripts/ tests/test_deploy.py .env.example .env.railway.example README.md
git commit -m "feat(railway): phase 0-1 deploy config, health check, slim Railway deps"
git push origin main
```

### C. Railway dashboard

1. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**.
2. Select **acheronx0577/Ai-Companion** (or your fork).
3. Wait for build (~2–5 min with slim requirements).
4. Open **Deployments** → logs should show gunicorn starting.

**Exit:** Deploy succeeds; visiting `/health` on the service URL returns `"status":"ok"` (domain comes in Phase 3).

### Build failed: `No module named pip` (Nixpacks)

**Cause:** Overriding `[phases.setup]` with only `python312` skipped Nixpacks’ venv/pip setup.

**Fix in repo:** `nixpacks.toml` now uses `/opt/venv/bin/pip` only; **or** `railway.json` uses **DOCKERFILE** builder (recommended on Metal V3).

### Deploy failed: `'$PORT'` or `'${PORT'` is not a valid port number

**Cause (most common):** Railway **Deploy → Start Command** still has something like:

```text
gunicorn app:app --bind 0.0.0.0:$PORT ...
```

or `${PORT}` — gunicorn gets the **literal text** `$PORT` / `${PORT`, not a number.

**Cause (less common):** Variable `PORT` in Railway is set to the string `${PORT}` instead of a number. `railway_serve.py` now ignores invalid values and uses `8080`.

**Fix:**

1. Railway → **Settings → Deploy → Start Command** → set exactly:
   ```text
   python -u railway_serve.py
   ```
   Or leave **empty** and use Dockerfile `CMD` from git.
2. **Delete** any custom `PORT` variable you added manually (Railway injects `PORT` automatically).
3. Push latest code and redeploy.

**Fix:** If healthcheck fails but build OK — often **CRLF** in `start.sh` from Windows (`/bin/sh\r: bad interpreter`). Repo uses `.gitattributes` + `sed` in Dockerfile.

### Build failed: app has no CSS

**Cause:** `.dockerignore` used to exclude `static/` — fixed; `static/` must be in the image.

**Default Railway variable (add in Phase 2):** `DISABLE_PIPER=1`

**PR:** `feat/railway-phase-1` optional if not pushing to `main` directly.

---

## Phase 2 — Environment variables

In Railway → your service → **Variables**, add:

| Variable | Required |
|----------|----------|
| `GROQ_API_KEY` | Yes |
| `FLASK_SECRET_KEY` | Yes (long random string) |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes |

Optional:

| Variable | When |
|----------|------|
| `DISABLE_PIPER` | `1` if deploy crashes or TTS OOM — browser voice still works |
| `GROQ_MODEL` | Custom Groq model |
| `USAGE_LIMIT_PEPPER` | Custom usage hash |

Copy values from your local `.env` (never commit `.env`).

**Exit:** Variables saved; Railway triggers redeploy; deploy succeeds.

**PR:** None.

---

## Phase 3 — Public URL + Google OAuth

1. Railway → **Settings** → **Networking** → **Generate Domain**.  
   Example: `wakuwaku-production.up.railway.app`
2. Railway sets `RAILWAY_PUBLIC_DOMAIN` automatically.
3. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth client → **Authorized redirect URIs** → add:

   ```
   https://YOUR-DOMAIN.up.railway.app/auth/google/callback
   ```

4. Keep local URI: `http://127.0.0.1:5000/auth/google/callback`
5. Redeploy if needed; check **Deploy logs** for line:

   ```
   OAuth redirect URI: https://YOUR-DOMAIN.../auth/google/callback
   ```

**Exit:** Redirect URI in Google matches logs exactly (https, no typo).

**PR:** None.

---

## Phase 4 — Production smoke test

Open `https://YOUR-DOMAIN.up.railway.app` and check:

- [ ] `/health` → `"status": "ok"`, `"chatConfigured": true`
- [ ] Home page loads (Night Desk UI)
- [ ] **Sign in with Google** works
- [ ] Send a chat message (Groq)
- [ ] Usage meter shows remaining trials
- [ ] Voice: Piper or browser TTS (if `DISABLE_PIPER=1`, browser only)

**Exit:** All checked items pass.

**PR (optional):** `docs/railway-smoke-test` — only if you add screenshots to README.

---

## Phase 5 — Convex on Railway (later)

When Convex frontend is ready (ARCHITECTURE Phase 5):

1. `npx convex deploy` → production URL
2. Railway variable: `CONVEX_URL=https://....convex.cloud`
3. Add Convex OAuth redirect URIs in Google Cloud
4. Set `USE_CONVEX_AUTH=true` when implemented

Not part of initial Railway rollout.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build timeout / OOM | Set `DISABLE_PIPER=1`; upgrade Railway plan |
| Health check failing | Open `/health`; check deploy logs |
| Google login error | Redirect URI must match logs exactly |
| Chat 503 | `GROQ_API_KEY` missing or invalid |
| Session lost on refresh | `FLASK_SECRET_KEY` set and stable |

See also [DEPLOY.md](DEPLOY.md).
