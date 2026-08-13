# Handoff — where the project stands

**Written 2026-08-13, at commit `4c01fa8`.** This is a working note for the next
session: the state of play, what is waiting on the author, and what I would pick
up next. It deliberately does *not* restate the rules or the conventions —

- [CLAUDE.md](../CLAUDE.md) is the operating manual: commands, conventions that
  are easy to get wrong, and how to drive the game in a browser.
- [README.md](../README.md) is the design: what is implemented, the **rules
  decisions** (✅ confirmed / ⚠️ assumed), the gap list and the roadmap.
- [docs/mechanics.he.md](mechanics.he.md) is the rules document itself.
- [docs/balance.md](balance.md) is every number that was chosen rather than
  transcribed — the list for the balance pass the author has twice signalled.

## Green as of this commit

```
npm test        248 tests, 14 files
npm run typecheck   clean
```

The demo scenario plays end to end in the browser. Everything below was driven
in the actual game before it was called done, not only unit-tested.

## What the last session built

One arc, in six commits, each verified in play:

1. **Orders carry a task** (`5b2c660`) — an order is an objective *and* what to
   do about the enemy there: advance, engage a named force, hold fire.
2. **A knowledge model** (`eb5be1b`, `830b510`) — the engine keeps per-side
   contacts (`intel.ts`); the hotseat draws contacts, not forces.
3. **Posture** (`d9a5bfc`, `e88ca59`, `9cc72eb`, `b55b197`) — hidden while
   stationary, continuous observation from position, digging in, camouflage,
   scouting, and the concealed-charge floor under camouflage.
4. **Ambush** (`1c27683`, `056518f`) — hold fire with an engagement range that
   springs itself on the nearest enemy, or on a designated one.
5. **Per-side debrief** (`ca9e18f`, `dd34261`, `901e4a0`) — the review reads
   through the umpire's eyes or either side's, with banded reports, a לקחים
   panel and a truth reveal.
6. **What-if** (`4c01fa8`) — re-fight the same decisions under other dice,
   skipping decisions the alternate history has made impossible and reporting
   how many were skipped.

## Waiting on the author

The ⚠️ rules decisions in the README, and what each actually needs:

| # | Decision | The question |
|---|---|---|
| 7 | Cover cuts hit chance **proportionally** | Is `-50% מסיכויי הפגיעה` a proportional cut (halves a 20% shot) or percentage points? Read as points it zeroes the whole direct-fire table. |
| 8 | Indirect fire is one mission per side per turn | The document gives rates of fire per barrel but the game has no battery piece. Should a battery be a unit? |
| 10 | A charge triggers within **10 m** of the path walked | The document says `דריכה` with no distance, and a token is a squad, not a man. |
| 13 | What a side may be told in its own debrief | The disclosure line — enemy orders never, own casualties always, enemy casualties only for a force in sight. The **banding is confirmed ✅**; the rest of the line is mine. |

Also open, though not rules: **decision 9's smoke radii** (25/50/100 m) are
chosen, and **decision 11's riders** (no assault on armour, no ammunition
tracking) are assumptions the author has not contradicted.

## What I would pick up next

The gap list in the README, in the order I would take it:

1. **Terrain** (backlog 6). Everything now points at it: `baseCover` exists on a
   `Unit` with nothing to set it, line of sight only knows about smoke, scouting
   has no sector to look at, and the map is a bare field. It is also the biggest
   rules invention left — the document has no terrain table — so it needs the
   author's involvement more than it needs code.
2. **A force cannot be told where to look.** Scouting raises detection
   everywhere at once. A sector or an observation post would make it a decision
   rather than a switch, and it is small next to terrain.
3. **Laying charges during play.** Small, self-contained, but the document does
   not describe engineering work at all — ask before building.
4. **Morale** (backlog 1). The neutralise rule is the only cohesion model; the
   posture system built this session is the natural place to hang suppression.

Two things I would *not* rush: echelon scaling (backlog 3) touches the C2 model
everywhere, and OPORD mode (backlog 13) is a research project with a section of
its own in the README.

## Traps that cost real time

The browser-driving notes are in CLAUDE.md; these are the ones that bit during
this session and are not obvious from the code:

- **`addUnit` records the force as it stands.** Setting `camouflaging` or
  `baseCover` on a unit *after* adding it desyncs the recording from the live
  game — the replay gets an undressed unit. Set it before `addUnit`.
- **The engine's rng must not be drawn from the app.** Anything that wants
  randomness (observation error, fuzzing) has to happen inside the engine and be
  derived from the seed, or replays diverge. `whatIf.ts` re-rolls by *replaying*
  with a different seed rather than by rolling anything itself.
- **A "no observations" result is usually an unlucky seed, not a bug.** A single
  80% check fails one time in five; when a test needs a detection to land, pick a
  seed that produces one and say so.
- **The browser console buffer survives reloads.** Stale HMR errors from a
  mid-refactor moment look alarming after a hard reload; check whether the
  modules currently loaded export what they should before chasing one.
