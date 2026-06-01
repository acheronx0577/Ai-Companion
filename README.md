# WakuWaku AI Companion

Flask chat companion with Google sign-in, Gemini, Piper TTS, and a responsive mint-dark UI.

## Setup

1. Create a virtual environment and install dependencies:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

2. Copy environment template and fill in your values:

```bash
copy .env.example .env
```

Required in `.env`: `GROQ_API_KEY` (or `GEMINI_API_KEY`), `FLASK_SECRET_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

**No credit card:** use [Groq](https://console.groq.com/keys) — set `GROQ_API_KEY` in `.env`. The app uses Groq automatically when that key is set. Gemini is optional if your Google account still has free AI Studio access.

Optional local key files (`gemini_key.txt`, `project_id.txt`) are supported by setup scripts but are **gitignored** — do not commit them.

3. Run the app (one terminal — Convex + Flask):

```bash
npm run dev
```

Or run separately: `npm run convex:dev` and `python app.py`.

Open http://127.0.0.1:5000

## Deploy (Render)

Follow **[RENDER.md](RENDER.md)** to deploy on Render (Docker, Free tier).

## Tests

```bash
npm install
npm run test:a11y
```

**Before each Convex phase commit:**

```bash
npm run phase:gate -- 0   # use 1, 2, … for later phases
```

See [docs/PHASE_GATE.md](docs/PHASE_GATE.md).

## Design

See [DESIGN.md](DESIGN.md) for the Night Desk UI system.

## Architecture (Convex migration)

See [ARCHITECTURE.md](ARCHITECTURE.md) for the phased Convex backend plan (auth, database, usage limits).

**Phase 0 (done locally):**

```bash
npm install
npm run convex:dev:once
npx convex run users:bootstrapPing
npm run test:convex-phase0
```

Details: [convex/README.md](convex/README.md). Optional: `npx convex login` for a cloud deployment.
