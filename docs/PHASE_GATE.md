# Phase gate — audit, verify, optimize, cleanup (before every commit)

Run this **at the end of each Convex phase** (and any PR) before `git commit`.  
Maps to **Design Pro**: `audit` → `verify` → `optimize` → cleanup.

```bash
npm run phase:gate -- <phase-number>
# Example Phase 0:
npm run phase:gate -- 0
```

---

## 1. Audit (what to check)

| Area | All phases | Phases 5–7 (UI) |
|------|------------|-----------------|
| **Accessibility** | No regressions in shared shell | axe + keyboard + touch targets |
| **Performance** | No new blocking scripts; cache-friendly assets | Bundle size, defer/async |
| **Theming** | CSS tokens unchanged unless intended | Sidebar/auth states |
| **Responsive** | — | mobile + Nest Hub + 1920px tests |
| **Anti-patterns** | No secrets in diff; no AI-slop UI churn | Match `DESIGN.md` |

**Backend phases (0–4, 6):** focus audit on Convex auth boundaries, no public unauthenticated mutations, env vars documented.

**Phases 0–4:** `phase:gate` runs Playwright a11y so the shell never regresses while Convex backend work lands.  
**Phase 5+:** same suite is **required** before merge.

---

## 2. Verify (automated — must pass)

| Command | Phases |
|---------|--------|
| `npm run lint` | all |
| `npm run test:deploy` | all |
| `npm run test:convex-phase0` | 0 |
| `npm run test:convex-phase1` | 1 |
| `npx convex run schemaInfo:phase1Status` | 1 |
| `npm run test:convex-phase2` | 2 |
| `npx convex run authInfo:phase2Status` | 2 |
| `npm run test:convex-phase3` | 3 |
| `npx convex run usersInfo:phase3Status` | 3 |
| `npm run test:convex-phase4` | 4 |
| `npx convex run usageInfo:phase4Status` | 4 |
| `npx convex run usage:checkDailyLimit '{"used":10}'` | 4 |
| `npm run test:convex-phase5` | 5 |
| `npx convex run frontendInfo:phase5Status` | 5 |
| `npm run test:convex-phase6` | 6 |
| `npx convex run chatBridgeInfo:phase6Status` | 6 |
| `npm run convex:dev:once` | 0–6 |
| `npx convex run users:bootstrapPing` | 0–3 |
| `npm run test:a11y` | **0–4** (baseline), **5 & 7** (required), or any UI-touching PR |

Gate script (single entry): **`npm run phase:gate -- <N>`**

---

## 3. Optimize (quick pass)

- [ ] Remove dead files, commented blocks, debug `console.log`
- [ ] Static assets use version query (`data-asset-version`), not random cache bust
- [ ] No duplicate env docs (`.env.example` matches new vars)
- [ ] `convex/_generated/` and `.env.local` not staged

---

## 4. Cleanup (repo hygiene)

- [ ] Update `ARCHITECTURE.md` phase status table
- [ ] Update `.cursor/memory-bank/tasks.md` + `progress.md` (local)
- [ ] `convex/README.md` if commands changed
- [ ] Delete obsolete deploy docs / examples (e.g. old host configs)
- [ ] One PR = one phase branch name from ARCHITECTURE §8

---

## Phase-specific exit criteria

| Phase | Extra verify |
|-------|----------------|
| **0** | `bootstrapPing` OK; dashboard shows deployment |
| **1** | Schema visible in Convex dashboard; `schemaInfo:phase1Status` lists 4 tables |
| **2** | Test Google sign-in via Convex Auth |
| **3** | `users.me` returns profile after login |
| **4** | 11th message rejected in Convex |
| **5** | App works without Flask `/auth/me` reads; **must** pass `test:a11y` |
| **6** | Login → meter → chat → 10/day enforced E2E |
| **7** | No `auth.py` OAuth / no `daily_usage.json` writes |

---

## Design Pro mapping

| Step | Design Pro command |
|------|-------------------|
| Audit | `/design-pro audit` (UI phases) or code review for backend |
| Verify | `/design-pro verify` + `npm run phase:gate` |
| Optimize | `/design-pro optimize` |
| Cleanup | `/design-pro distill` + repo hygiene above |

**Rule:** Do not commit until `phase:gate` exits 0 for the current phase.
