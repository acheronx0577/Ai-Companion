# Tests

## Accessibility (Playwright + axe)

From the project root:

```bash
npm install
npx playwright install chromium
npm run test:a11y
```

Starts a local Flask server automatically (see `playwright.config.js`).  
Report: `npm run test:a11y:report`

## Deploy smoke tests

```bash
python scripts/check_deploy_env.py
python -m unittest tests.test_serve tests.test_deploy -v
# or
npm run test:deploy
```

## Convex phase checks

```bash
npm run test:convex-phase0   # … through phase6
npm run phase:gate -- 6      # full gate for phase N
```

See [docs/PHASE_GATE.md](../docs/PHASE_GATE.md).
