# Working in this repo

A tabletop tactical wargame (משחק מלחמה לפו"ם) as a deterministic TypeScript
rules engine plus a React hotseat UI. [README.md](README.md) holds the design,
the rules decisions, and the roadmap — read it before proposing changes. This
file is the operating manual.

Picking the work up cold? [docs/handoff.md](docs/handoff.md) is where the
project stands, what is waiting on the author, and what to take next — current
state only. Why a past decision went the way it did is in
[docs/handoff-archive.md](docs/handoff-archive.md).

## Commands

```bash
npm test             # vitest, the engine suite — run before calling work done
npm run typecheck    # strict tsc over engine + app
npm run dev          # Vite dev server, the hotseat game
npm run build:engine # emit the engine as a standalone library -> dist/
```

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
- **All randomness comes from `Rng`.** No `Math.random`, no `Date.now` in the
  engine. A game must replay bit-for-bit from its seed — that is what makes
  tests, replays, and future networked play possible.
- **The engine is DOM-free.** `src/engine/` never imports React or browser APIs;
  the app layer lives only in `src/app/` and reaches the engine through the
  `src/engine/index.ts` barrel.
- **Imports carry the `.js` extension** even for TypeScript files
  (`./units.js`), throughout.
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
  13). Adding a new `RecordedAction` means adding it to both switches there, or
  it silently defaults to hidden.
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
usually scripted through the browser tools. These cost real time to rediscover:

- **A token's symbol image is large in map coordinates.** `elementFromPoint` at
  a spot near a unit hits the `<image>`, and `Token`'s handler calls
  `stopPropagation`, so the click never reaches the map — a move silently does
  nothing. Dispatch on `svg.map` itself instead: the background handler reads
  `clientX/clientY` off the event and does not care what was under the cursor.
- **Every state change re-renders every token through milsymbol**, which is
  slow enough that a long click sequence blows the 30 s tool timeout. Drive one
  or two activations per call and read the state back between them.
- **C2 is measured from where the חפ"ק stands when the order is given**, so
  move the command group *before* the subordinate if you want the squad to
  stay in the every-turn band.
- **One order is usually enough.** Since a standing order executes every turn,
  a script can order a force once and then just advance activations — far
  cheaper than clicking a bound per turn, and it no longer stalls when the
  force falls out of contact.
- **Check a move landed by looking for a movement line anywhere in the new log
  entries**, not at the top one — detection and orders log after it. (The log
  renders newest-first.)
- **One click per script call, or await a tick between them.** React batches
  state updates, so two `.click()`s in the same tick both hit the pre-render
  DOM — the second silently re-clicks the same stale button. A
  `await new Promise(r => setTimeout(r, 60))` between clicks is enough, and the
  whole activation sequence can then run in one call.
- **Advancing turns needs all three buttons**, in this order of preference each
  time: `התחל תור`, `מוכן — הצג את המפה`, `סיים שלב`. Click whichever is present
  and *enabled*. A driver that clicks only the last two stalls at the initiative
  panel and looks like the engine hung. Six to eight such steps per tool call is
  the ceiling before the 30 s timeout — read the log back between batches.
- **The `.roster` list only exists during an activation**, not on the initiative
  panel — querying it to decide "has the app rendered?" gives a false negative
  at the start of a turn.
- **Getting into the debrief without touching the disk.** `שמור הקלטה` triggers
  a download and `טען לתחקיר` is a file input, but both drive in-page, and this
  is the only cheap way to check anything in `Debrief.tsx`: patch
  `URL.createObjectURL` to capture the Blob, click save, restore it, then push
  `await blob.text()` back through the input as a `File` via a `DataTransfer`
  (`input.files = dt.files`) and dispatch a bubbling `change` event.
- **The browser console buffer survives reloads.** Stale HMR errors from a
  mid-edit moment look alarming after a hard reload — especially after renaming
  an export, where every module that imported the old name logs a failure. Check
  what the modules *currently loaded* export before chasing one:
  `(await import('/src/engine/index.ts')).theThing`. If that answers correctly
  and the page renders, the errors are history.

Once a position is set up, a **recording is the cheap way back to it**: save
one (`שמור הקלטה`), then `replayGame()` reconstructs that exact state without
replaying the clicks. For engine-only checks, building a recording in a test is
faster than driving the UI at all.

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
