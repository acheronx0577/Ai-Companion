# Accessibility tests

Runs [axe-core](https://github.com/dequelabs/axe-core) against the Flask UI via Playwright.

```bash
cd "Ai App/companion-python"
npm ci
npx playwright install chromium
npm run test:a11y
```
