# Checks before you commit

Run automated tests before `git commit` or opening a PR:

```bash
npm run phase:gate -- 6
```

Use `0` through `6` to match how much of the stack you changed (higher = more checks). For UI changes, the gate always runs accessibility tests.

---

## What the gate runs

| Area | Command (examples) |
|------|---------------------|
| Lint | `npm run lint` |
| Deploy smoke | `npm run test:deploy` |
| Convex layout | `npm run test:convex-phase0` … `test:convex-phase6` |
| Convex live | `npx convex dev --once`, status queries |
| Accessibility | `npm run test:a11y` |

---

## Run checks yourself

```bash
npm run lint
npm run test:deploy
npm run test:a11y
npm run test:convex-phase5    # frontend bridge
npm run test:convex-phase6      # Flask /chat + usage HTTP
npx convex run chatBridgeInfo:phase6Status
```

---

## Cleanup checklist

- [ ] No secrets in the diff (`.env`, keys)
- [ ] `.env.local` and `convex/_generated/` not committed
- [ ] `.env.example` updated if you added new env vars
- [ ] No debug `console.log` left in `static/`

**Rule:** Do not commit until `npm run phase:gate -- <N>` exits 0 for the area you touched.
