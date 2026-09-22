# Working in this repo

A tabletop tactical wargame (משחק מלחמה לפו"ם) as a deterministic TypeScript
rules engine plus a React hotseat UI. [README.md](README.md) holds the design,
the rules decisions, and the roadmap — read it before proposing changes. This
file is the operating manual.

**This file is the canonical instructions for every assistant**, whatever make.
`CLAUDE.md` is a pointer to it, and `.claude/` holds Claude Code adapters only —
nothing in there is a rule that is not also stated here or enforced by a test.
If you add project instructions, add them here.

Picking the work up cold? [docs/handoff.md](docs/handoff.md) is where the
project stands, what is waiting on the author, and what to take next — current
state only. Why a past decision went the way it did is in
[docs/handoff-archive.md](docs/handoff-archive.md).

**`main` is not the only place work lives.** Sessions push to their own
branches and nothing merges them for you, so the handoff on `main` can be days
behind. Before taking anything from it, run `git fetch && git branch -r` and
`git log main..origin/<branch>` on each other branch — the scenario picker was
built twice, on consecutive days, because the second session read only
`main`.

## Commands

```bash
npm run check        # lint + typecheck + the whole suite. The one to run.
npm run dev          # Vite dev server, the hotseat game
npm run build:engine # emit the engine as a standalone library -> dist/
npm test             # vitest alone
npm run typecheck    # strict tsc alone
npm run lint         # the architectural rules alone
```

Node **24** — pinned in `.nvmrc`, declared in `engines`, and read from that same
file by CI, so there is one number rather than three. It is in Active LTS and
supported to **2028-04-30**; 22 would have run out in April 2027, and **20 went
end-of-life on 2026-04-30**, which is what this pin was moved off. Checked
against `nodejs/Release`, not remembered.

`npm run check` is what CI runs. The hooks in `.claude/` run its two halves —
`typecheck` after each edit, the suite before finishing — so they gate the same
things without waiting for the whole of it on every keystroke. **Never report
work as done without running `npm run check` and quoting the result** (test count, exit status). If a player can see the change,
drive it in the browser too — see *Verifying a change in the actual game*.

## What is enforced, and what is asked

Most of the traps below are **checked by the build**, not left to whoever reads
this file:

- [`eslint.config.js`](eslint.config.js) fails on `Math.random` or `Date.now`
  anywhere in `src/`, and on React, the DOM, node globals or an app import
  inside `src/engine/`, and on an app import that bypasses the engine barrel.
  It carries **architectural rules only** — no style layer, nothing to argue
  about, and no mechanical diff across files that have never been linted.
- [`src/invariants.test.ts`](src/invariants.test.ts) takes what a selector
  states badly: a relative import missing its `.js`, a structural check that
  the compiler's own exhaustiveness guards have not been deleted, and that
  every module under `src/app/maps/` is still named in `LICENSE`'s third-party
  carve-out — cutting a new window writes two more of them, and the carve-out
  does not extend itself.
- The compiler fails on a log line written without an audience — `pushLog`'s
  third argument — so the live log cannot regain the fog-of-war hole it had
  (rules decision 17), and on a new `RecordedAction` that any of the four
  switches does not handle — `recording.ts` (replay), both in `debriefView.ts` (what a
  side may see, and what it may learn of the result) and `describeAction` in
  `debriefText.ts` (its Hebrew narration). The disclosure rules cannot be
  skipped by omission, and an unnarrated action cannot print its raw object at
  a player.
- `tsconfig.engine.json` sets `"types": []`, so the standalone engine build
  cannot quietly acquire node's ambient globals from `node_modules/@types`.

Prefer adding a check to adding a paragraph. A rule a machine can state is worth
more than a rule a reader has to remember, and it works on assistants that never
read this file at all.

## The rules document is the authority

`Tactical - Mechanics.docx` (Hebrew, repo root) is the source of truth for every
number in the game. Nothing here can read a .docx, so **read
[docs/mechanics.he.md](docs/mechanics.he.md) instead** — a hand-checked Markdown
transcription of the whole document, verbatim, with the tables intact. It also
maps each rules table to the code that implements it.

When the author revises the .docx, re-verify the Markdown against it:

```bash
python tools/dump-docx.py   # prints the raw extraction
```

The Markdown is written by hand and is *not* generated — merged table cells
collapse in the raw extraction, so a regenerated file would lose structure.

Never invent or "balance" a rule. When the document is silent or ambiguous:
decide, implement, and record it in the README's **Rules decisions** list —
✅ for what the author confirmed, ⚠️ for what is still an assumption. Say which
one it is in your reply, too.

## Conventions that are easy to get wrong

- **Data tables are transcribed verbatim.** `src/engine/data/` mirrors the
  document's numbers exactly. When a *reading* of the document turns out to be
  wrong, change how the value is applied in `src/engine/combat/`, not the value
  itself — see rules decision 7, where the cover modifier stayed `-0.5` and only
  its application became proportional.
- **All randomness comes from `Rng`** — a game must replay bit-for-bit from its
  seed, which is what makes tests, replays and future networked play possible.
  *(enforced)* Watch the **number** of draws too: rolling for a different set of
  candidates reorders the rng and diverges older recordings. The compiler cannot
  see that one.
- **The engine is DOM-free** and the app reaches it only through the
  `src/engine/index.ts` barrel. *(enforced)*
- **Imports carry the `.js` extension**, even for TypeScript files. *(enforced)*
- **A unit is recorded as it stands when `addUnit` is called.** Dressing it
  afterwards (camouflage, `baseCover`) desyncs the recording from the live game.
- **Features are toggleable per game**, not baked in — the pattern is a flag on
  `GameOptions` (see `enforceC2`), so a quick firefight and a full exercise run
  on the same engine.
- **The player issues orders; the engine moves the pieces.** A force is given a
  standing order (`setStandingOrder`) — an objective, a gait, and optionally an
  enemy to engage — and `executeStandingOrders` carries it out every turn until
  it is replaced (rules decision 6). `moveUnit` is the primitive underneath and
  is only called directly for the חפ"ק, which the player drives by hand. Reach
  for an order, not a move, when adding anything that manoeuvres a force. A
  consequence worth remembering: a hotseat battle journals *orders*, not moves,
  so anything that reads a recording (extent, narration, digests) has to work
  from the order.
- **Posture drives both being seen and being hit.** `stationaryTurns`, `cover`
  and `camouflageTurns` on a `Unit` are maintained by `endTurnUnitUpkeep` and
  read by `detectionChance` and by fire resolution — a force is hidden because
  it did not move, in cover because it dug, and hard to find because it
  camouflaged (rules decision 12). Don't assert cover at a call site: the engine
  derives it from the target (`coverAgainst`).
- **Morale is judged once a turn, in one place** (`resolveMorale`, rules
  decision 19). It finds casualties itself, by comparing every soldier with the
  snapshot taken at `beginTurn`, so nothing that hurts a force has to report
  to it. What it cannot find is **being shot at**: suppression and the
  direction of fire (flanking) arrive only through `Game.noteFire`. A new way
  of firing at a force must call it. And a force's men are drawn from their
  own seeded stream (`unitSeed`), never from `game.rng` — a recording carries
  them as drawn.
- **Line of sight takes two forces, not two points.** `Game.hasLineOfSight`
  reads the ground from the map and the eye height from each force's posture
  (rules decision 15), so anything that asks "can A see B" passes the units.
  The map's ground is in `game.terrain`; a game built without one is flat and
  empty and plays exactly as it did before there was ground. Object cover
  arrives through `coverFromObjects` at `addUnit` and at upkeep — do not set it
  by hand.
- **The demo is generated, ground and battle both.** `src/app/maps/ramatMenashe.ts`
  is written by `tools/fetch-dtm.py` from public terrain tiles and
  `ramatMenasheObjects.ts` (objects and roads) by `tools/fetch-osm.py` from
  OpenStreetMap; the battle on them, `src/app/scenarios/yokneamIllit.ts`, by
  `tools/make-scenario.py` from `tools/scenarios/yokneam-illit.json`. **Change
  the spec and rerun the tool** rather than editing any of the three:

  ```bash
  python tools/make-scenario.py tools/scenarios/yokneam-illit.json
  ```

  The forces, the charges and the module's own prose all live in the spec. The
  tool refuses what would otherwise compile and play *differently from what the
  spec says*: a force off the map, a duplicate id, a misspelt key, a key given
  to the wrong kind of force (`soldiers` on a command group), a fractional
  count, a seed that is not a whole number, a title or a `brief` that is empty,
  and a window that is not the one the relief was cut to. It leaves the ground
  alone unless asked (`--fetch-map`) — refetching moves the data under a layout
  already placed on it. `src/app/scenario.ts` is only the list of generated battles the
  **scenario picker** offers (`SCENARIOS`); a new spec needs one line there, and
  `src/app/scenarioCatalogue.test.ts` fails until it has it. A spec's `brief` is
  the picker's text and **both players read it before taking a side** — write
  a tasking there (who attacks, who holds, where), never forces or charges.

  Roads are `Terrain.roads`: drawn, carried by the recording, read by no rule —
  keep it that way unless the author rules on roads. `src/app/scenario.test.ts`
  pins the sight lines the demo's lesson depends on, so a regenerated map that
  moves them fails there rather than in play.
- **The engine is the umpire; what a side *knows* is a separate ledger.**
  `game.units` is ground truth and must never be drawn to a player directly —
  the hotseat renders `sideView()` ([`hotseat.ts`](src/app/hotseat.ts)), built
  from `game.contactsFor(side)`, so an enemy shows up where it was last seen
  rather than where it is. When adding anything the player looks at, ask which
  of the two it should read; when adding anything that *resolves*, use the
  truth (firing at a stale mark is meant to miss).
- **The debrief must not teach what a side never saw.** Anything added to the
  review goes through [`debriefView.ts`](src/app/debriefView.ts) — which action
  a side may see, and what it may be told the action produced (rules decision
  13). A new `RecordedAction` must be handled in both switches — the compiler
  now says so, rather than the omission defaulting to hidden.
- **The live log is filtered by side too, and says so in its type.** The
  hotseat log is one list both players read across a handoff, so
  [`pushLog`](src/app/App.tsx) takes a **required** `Audience` — `TABLE` for the
  umpire's bookkeeping, `onlyFor(side)` for a decision behind one's own lines,
  `sharedBy(side)` for an exchange both sides were in — and `LogPanel` renders
  only what the side at the screen may read (rules decision 17). A line whose
  two readers are entitled to different words is written once per reader with
  `pushPerSide`, never once from whoever happens to be viewing.
- **A player is never shown a count of enemy losses.** Losses go through
  `casualtyReport(n, exact)`, exact only for the reader's own forces — the
  umpire's debrief view is the one place the tally belongs (rules decision 13).
  The trap this rule has actually sprung: wording a line from `viewingSide` at
  the moment it is written, and then showing that line to everybody. Ask who
  will *read* it, not who is looking when you write it.
- **Hebrew phrasing lives in [`src/app/debriefText.ts`](src/app/debriefText.ts).**
  Orders, engine refusal reasons and action narration are worded once there and
  used by both the live log and the debrief, so the two cannot drift apart.
  The engine says *what* went wrong as data and never in Hebrew — a refusal
  reason, or a `RecordingError`'s `problem` for a file that is not a recording
  — and the app words it there; an engine's English message is for a stack
  trace, not a player.
- **Never cache anything on a `Unit`'s identity.** The engine is imperative
  and mutates a force in place, so the same object reference is the squad
  before and after it loses three men. A `React.memo` on a token, or a
  `WeakMap` keyed on the unit, would go on drawing 8/8 over the casualties.
  Cache on the *values* the thing being cached actually reads — that is what
  `renderUnitSymbol` does, and `src/app/symbols.test.ts` pins the mutation
  case so the shortcut cannot come back.
- **`noUncheckedIndexedAccess` is on**: indexing an array yields `T | undefined`.
- **The UI is Hebrew and RTL.** User-facing strings, log lines and labels are in
  Hebrew; keep new ones consistent with the existing phrasing.

## Verifying a change in the actual game

Engine changes are covered by tests, but anything the player sees should be
driven in the browser before you call it done: start the `dev` preview, play the
demo scenario to the situation you changed, and read the combat log back. The
app opens on the scenario picker; `/?scenario=yokneamIllit` goes straight into
the demo.

One trap: the `Game` instance is held in a React ref, so **Vite's hot reload
will not pick up an engine change** — the old instance keeps running the old
code. Hard-reload the page to get a fresh game, or you will "verify" the
behaviour you just replaced.

### Driving it by script

Playing the demo to an interesting position takes many activations, so it is
usually scripted. The techniques — the three-button turn loop, getting a
recording into the debrief without touching the disk, why a token swallows a
click, and the stale HMR console buffer — are in
[docs/driving-the-game.md](docs/driving-the-game.md). Read it before scripting
the browser; every note in it was paid for once already.

## Tests

Vitest, colocated as `*.test.ts` next to the code. The interesting suites are
`src/engine/game.test.ts` (turn loop, C2), `src/engine/orders.test.ts` (standing
orders) and `src/engine/combat/combat.test.ts` (fire resolution). Tests assert
against the document's numbers — if a test needs changing, be sure the *rule*
changed and not just the code.

- **A "nothing happened" result is usually an unlucky seed, not a bug.** A
  single 80% check fails one time in five. When a test needs a detection or a
  detonation to land, pick a seed that produces one **and say in a comment why
  that seed** — otherwise a later change to the draw order reads as a rules
  regression instead of a seed to re-pick.
- **Measure before ruling on a rule that "feels" wrong.** Twice now a suspected
  problem turned out to be exactly quantifiable with a throwaway loop over a few
  hundred seeds (`{ triggered: 200, detected: 0 }`), and the number is what
  settled the question. Write the scratch test, read it, delete it — and put the
  figure in the README so the decision carries its evidence.
- **When a rule has two halves, test them against each other.** The bugs this
  repo has actually shipped were halves of one rule measured off different
  geometry or filtered at different layers, each half fine alone. The test that
  catches those applies *both* at once and asserts the wrong combinations are
  not produced (see "adds the movement modifier, then scales by cover").
