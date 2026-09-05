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

## Commands

```bash
npm run check        # typecheck + the whole suite. The one command to run.
npm run dev          # Vite dev server, the hotseat game
npm run build:engine # emit the engine as a standalone library -> dist/
npm test             # vitest alone
npm run typecheck    # strict tsc alone
```

`npm run check` is what CI runs and what the Claude Code hooks call, so all
three agree by construction. **Never report work as done without running it and
quoting the result** (test count, exit status). If a player can see the change,
drive it in the browser too — see *Verifying a change in the actual game*.

## What is enforced, and what is asked

Most of the traps below are **checked by the build**, not left to whoever reads
this file:

- [`src/invariants.test.ts`](src/invariants.test.ts) fails on `Math.random` or
  `Date.now` anywhere in `src/`, React/DOM inside `src/engine/`, an app import
  that bypasses the engine barrel, and a relative import missing its `.js`.
- The compiler fails on a new `RecordedAction` that any of the three switches
  (`recording.ts`, and both in `debriefView.ts`) does not handle — the
  disclosure rules cannot be skipped by omission.

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
- **A player is never shown a count of enemy losses.** Losses go through
  `casualtyReport(n, exact)`, exact only for the reader's own forces — the
  umpire's debrief view is the one place the tally belongs (rules decision 13).
- **Hebrew phrasing lives in [`src/app/debriefText.ts`](src/app/debriefText.ts).**
  Orders, engine refusal reasons and action narration are worded once there and
  used by both the live log and the debrief, so the two cannot drift apart.
- **`noUncheckedIndexedAccess` is on**: indexing an array yields `T | undefined`.
- **The UI is Hebrew and RTL.** User-facing strings, log lines and labels are in
  Hebrew; keep new ones consistent with the existing phrasing.

## Verifying a change in the actual game

Engine changes are covered by tests, but anything the player sees should be
driven in the browser before you call it done: start the `dev` preview, play the
demo scenario to the situation you changed, and read the combat log back.

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
