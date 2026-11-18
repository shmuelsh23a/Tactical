---
name: verify
description: Start this project and drive a change end to end, the way a person testing it would. Use before committing any change to this repository, and whenever asked whether something works.
---

# Verify a change in this repository

Tactical is a deterministic TypeScript wargame engine (`src/engine/`) and a React/Vite
hotseat app (`src/app/`). AGENTS.md is the operating manual; this is the smoke test run
before every commit. Every command below was run on 2026-11-18 at `7f3a0eb`, on Windows
(Git Bash), Node 24.19.0, from the repository root.

## 1. Cheap checks (about three minutes)

```bash
npm run check    # eslint src + tsc (app) + tsc (engine, no platform types) + vitest run
npm run build    # vite build -> dist/ (gitignored); not part of check
```

- **Pass:** `npm run check` exits 0 and vitest ends with `Test Files 86 passed (86)` /
  `Tests 1268 passed (1268)` (the counts on 2026-11-18; they only grow). It took 153 s.
  `npm run build` exits 0 with `✓ built in …` in about 3 s.
- The halves alone, for a faster loop: `npm run lint`, `npm run typecheck`,
  `npm run typecheck:engine`, `npm test`. The `.claude/` hooks run `typecheck` after an
  edit to a `.ts`/`.tsx` file, and `npm test` before a turn ends when `src/` or `tools/`
  has uncommitted changes; neither runs lint, the engine typecheck or the build.
- **Not a failure:** the build's warning that a chunk is larger than 500 kB.
- After a `git pull` that touched `package.json`, run `npm ci` first, or the typecheck
  fails with TS2307 in `src/sim/` and reads like broken code (docs/handoff.md).

## 2. Run it (the part that counts)

No keys and no spend: the app, the engine and the computer opponent run locally.

1. Start the dev server: the `dev` configuration in `.claude/launch.json` (`npm run dev`,
   port 5173). In the Claude desktop app use `preview_start {name: "dev"}`, not Bash.
2. Open the battle the change is about, skipping the picker:
   - `http://localhost:5173/?scenario=yokneamHouse&vs=computer`: the house at the edge
     of Yokneam against the computer (the interior fight and the breach card).
   - `http://localhost:5173/?scenario=yokneamIllit`: the demo, hotseat.
   - `http://localhost:5173/` alone opens the scenario picker (every listed scenario).
3. Set the viewport to 1280×900 first (a hidden pane reports 0×0).
4. A battle opens on **mission planning**, not turn 1: click `סיים תכנון (BLUE)`, then
   `התחל תור`. In a **hotseat** game (no `vs=computer`) each side's planning, and every
   activation, starts behind a handoff screen: click `RED מוכן — הצג את המפה` (or BLUE's)
   first, or the driver stalls there. Each phase then ends with its own button
   (`סיים שלב סימון מטרות (BLUE)`, `סיים שלב תנועה (BLUE)`, …).
5. Play to the situation the change is about, then read the result back: the
   **יומן קרב** (battle log, newest first), the card or panel that changed, and the
   console (no errors). A selected force is chosen from **הכוחות שלי** in the sidebar.

Smoke run on 2026-11-18 (no app change): `yokneamHouse&vs=computer` loaded with the
title `יקנעם — הבית שבקצה`, planning finished, turn 1 started (`תור 1 / 90`, log
`T1 תור 1 — יוזמה: BLUE → RED`), the targeting phase ended into the movement phase with
the order buttons shown, and the console had no errors.

Traps that will otherwise make you "verify" the wrong code (AGENTS.md, *Verifying a
change in the actual game*; docs/driving-the-game.md has the rest):
- **Hot reload does not reach the engine.** The `Game` lives in a React ref: after an
  engine change, hard-reload. A reload of a saved battle (`&saved=1`) replays the old
  battle under the new code; for a fresh one, pick the scenario again.
- **Click the map by dispatching on `svg.map`**, not by screen coordinates: a token's
  image swallows the click and a move silently does nothing.
- Drive one or two activations per tool call; every state change re-renders every token.

For a change under `src/engine/interior/` also measure the fight itself, which the tests
do not (REVIEW.md, *The fight inside a building*):

```bash
npm run interior-sim -- --houses 20 < /dev/null    # 43 s on 2026-11-18; the default (every house) takes minutes
```

**Pass:** it prints `interior-sim: 20 houses, …` and a table of entry × grenades with
`Cleared`, `Repulsed` and `Standoff` columns. A `Standoff` that rises against a run at the
commit before the change, or a cleared rate that moves with no rule change, is the
finding. Compare against the same command at the base commit, not against memory.

## 3. What to look at

- **A pass:** `npm run check` exit 0 with the test count quoted; `npm run build` exit 0;
  the driven situation shows the changed behaviour in the log or on the card, with no
  console errors.
- **Where a failure shows:** vitest prints the failing test and its assertion; tsc and
  eslint print `file:line`; in the browser, the console (`read_console_messages`) and the
  dev server's log (`preview_logs`).

## 4. Known gaps (what this run does not cover)

- **The smoke run above stops at the movement phase.** It resolves no fire and does not
  reach the computer's turns, the debrief (the main fog-of-war surface), or a reload of a
  saved battle (`&saved=1`). A change to any of those must be driven there.
- **`npm run build:engine`** (the standalone engine library) is run by neither `check` nor
  CI; `typecheck:engine` is the nearest check.
- **`npm run build` does not fail CI yet** (`continue-on-error` in `.github/workflows/ci.yml`
  until it has been green on Linux).
- **No browser run in CI.** The drive in step 2 is by hand (or by the agent's browser
  pane). `tools/smart-attacker.mjs` (a scripted attacker through Playwright, dev server on
  :5199) was not run when this skill was written and is not part of it.
- **Paid and networked modes are out of scope:** `jev-sim --jev` (needs `TYPESAFE_API_KEY`
  and api.typesafe.ai) and `jev-sim --claude` (needs `ANTHROPIC_API_KEY`). Never run them
  to verify a change. `jev-sim --rule` and the other sims need no keys.
- **The long measurements are not smoke tests:** `npm run balance`, `validate`,
  `scenario-sim`, `suppression-pays` and a full `interior-sim` take minutes to hours and
  belong to balance work (docs/balance.md), not to every commit.
- **Operating systems:** the suite is run on Windows by hand and on Linux (ubuntu-latest)
  by CI; macOS is never run.
- **Old recordings:** the suite replays the recordings it builds; a battle saved in a
  player's browser before a rule change is not tested, only refused with a reason when it
  no longer replays.

## 5. Report

What was run, what it showed (test count, exit codes, the situation driven and the text
read back), what was not verified. Then stamp the commit: `Verified: <what was run>`.
