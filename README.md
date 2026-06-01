# WakuWaku AI Companion

A small chat app with a cat companion, Google sign-in, and a daily free message limit.  
You type on the web page (up to **100 words per message**); the app talks to an AI (Groq or Gemini) and can read replies aloud.

---

## What you need first

| Thing | Why | Where to get it |
|--------|-----|----------------|
| **Python 3.11+** | Runs the web server | [python.org](https://www.python.org/downloads/) |
| **Node.js 18+** | Runs Convex (login + limits) | [nodejs.org](https://nodejs.org/) |
| **Groq API key** | Free chat AI (no card) | [console.groq.com/keys](https://console.groq.com/keys) |
| **Google OAuth client** | “Sign in with Google” | [Google Cloud credentials](https://console.cloud.google.com/apis/credentials) |
| **Convex account** | Backend for sign-in & usage | [convex.dev](https://www.convex.dev/) — run `npx convex login` once |

Optional: **Gemini** key instead of Groq (see `.env.example`).

---

## Quick start (local)

### 1. Get the code and install

```powershell
cd Ai-Companion
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
npm install
```

On Mac/Linux use `source venv/bin/activate` instead of `venv\Scripts\activate`.

### 2. Create your `.env` file

```powershell
copy .env.example .env
```

Edit `.env` and fill in at least:

```env
GROQ_API_KEY=your-groq-key
FLASK_SECRET_KEY=any-long-random-string-you-make-up
GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-secret
```

`FLASK_SECRET_KEY` can be any long random text (for example 40+ letters and numbers). It keeps you signed in between restarts.

### 3. Set up Convex (first time only)

```powershell
npx convex login
npx convex dev --once
```

This creates `.env.local` with `CONVEX_URL` and `CONVEX_SITE_URL`. Keep that file — do not commit it.

Set Convex Auth (copy Google values from `.env`):

```powershell
node scripts/sync_convex_auth_env.mjs
npm run convex:set-jwt-keys
```

Restart dev after changing Convex env vars.

**Google redirect URIs** (OAuth client → Authorized redirect URIs):

```text
http://127.0.0.1:5000/auth/google/callback
http://127.0.0.1:3211/api/auth/callback/google
```

Use `127.0.0.1`, not `localhost`, for local sign-in.

More detail: [CONVEX_AUTH.md](CONVEX_AUTH.md)

### 4. Run the app (one terminal)

```powershell
venv\Scripts\activate
npm run dev
```

This starts **Convex** and **Flask** together.

Open in your browser: **http://127.0.0.1:5000**

Sign in with Google in the sidebar, then chat.

**Stop:** press `Ctrl+C` in that terminal.

### Run in two terminals (optional)

```powershell
npm run convex:dev
```

```powershell
python app.py
```

---

## Put it online (Render)

The live site is a **Flask app on Render** plus **Convex in the cloud** — not two servers on Render.

1. Deploy Convex: `npx convex deploy`
2. Follow **[RENDER.md](RENDER.md)** for Render env vars and Google redirect URIs for your `https://….onrender.com` URL.
3. Set Convex **production** auth:

```powershell
node scripts/sync_convex_production.mjs https://YOUR-APP.onrender.com
npm run convex:set-jwt-keys:prod
```

Use `npm run convex:set-jwt-keys:prod` for production JWT keys (not `npm run convex:set-jwt-keys -- --prod` — npm breaks that flag).

---

## Common problems

| Problem | What to try |
|---------|-------------|
| Google sign-in fails locally | Add both redirect URIs above; use `127.0.0.1:5000`; run `npm run convex:set-jwt-keys` and restart `npm run dev` |
| `"pkcs8" must be PKCS#8` error | Run `npm run convex:set-jwt-keys` again, then restart Convex |
| Chat history gone after refresh | Pull latest code (history loads before sign-in now) |
| Paste trimmed to 100 words | Expected — long paste is cut to the word cap; counter shows `N / 100 words` |
| Production sign-in fails | Set `CONVEX_URL` + `CONVEX_SITE_URL` on Render; set Convex prod `SITE_URL` to your Render URL; add **both** Google redirects (Render + `….convex.site`) — see [RENDER.md](RENDER.md) |
| `/health` check | Local: http://127.0.0.1:5000/health — Production: `https://YOUR-APP.onrender.com/health` |

---

## Useful commands

| Command | What it does |
|---------|----------------|
| `npm run dev` | Run Convex + Flask (local) |
| `npm run convex:dev` | Convex only |
| `python app.py` | Flask only |
| `npm run test:a11y` | Accessibility tests |
| `npx convex deploy` | Push backend to production |
| `npm run convex:sync-prod` | Set prod `SITE_URL` + Google vars on Convex (pass your Render URL) |

---

## More docs

Full index: **[docs/README.md](docs/README.md)**

| Doc | Contents |
|-----|----------|
| [RENDER.md](RENDER.md) | Deploy on Render step by step |
| [CONVEX_AUTH.md](CONVEX_AUTH.md) | Google + Convex Auth (local) |
| [DESIGN.md](DESIGN.md) | UI / colors / layout |
| [docs/PHASE_GATE.md](docs/PHASE_GATE.md) | Tests before commit |
| [convex/README.md](convex/README.md) | Convex backend quick reference |
| [tests/README.md](tests/README.md) | Playwright / unit tests |

---

## License / class project

Built as a class AI companion project. Do not commit `.env`, `.env.local`, or API key files.
