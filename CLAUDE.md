# Working in this repo

A tabletop tactical wargame (משחק מלחמה לפו"ם) as a deterministic TypeScript
rules engine plus a React hotseat UI. [README.md](README.md) holds the design,
the rules decisions, and the roadmap — read it before proposing changes. This
file is the operating manual.

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
