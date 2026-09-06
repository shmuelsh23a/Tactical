# Handoff — where the project stands

**Current as of `2e616d9`, 2026-09-06.** This is the working note for whoever
picks the project up next: the state of play, what is waiting on the author, and
what I would take next. It is **current state only** — history lives in
[handoff-archive.md](handoff-archive.md), and anything durable has been moved
out of here on purpose:

- [AGENTS.md](../AGENTS.md) — the operating manual: commands, conventions that
  are easy to get wrong, and how to drive the game in a browser.
- [README.md](../README.md) — the design: what is implemented, the **rules
  decisions**, the gap list and the roadmap.
- [docs/mechanics.he.md](mechanics.he.md) — the rules document itself.
- [docs/balance.md](balance.md) — every number that was chosen rather than
  transcribed, and the interactions to preserve when tuning them.
- [docs/review-checklist.md](review-checklist.md) — what to check before
  committing, written for any reviewer of any make.
- [docs/driving-the-game.md](driving-the-game.md) — scripting the browser to
  verify a change for real.

## Green as of this commit

```
npm run check       lint + typecheck clean, 284 tests, 15 files
```

The demo scenario plays end to end in the browser, including the debrief. The
rule is that nothing is called done on tests alone: if a player can see it, it
gets driven in the actual game first.

## How this repo expects to be worked on

The rules that matter are **enforced, not written down**. `npm run check` is the
one command — lint, typecheck, suite — and the three surfaces divide the work
with one owner per rule: [`eslint.config.js`](../eslint.config.js) for
determinism and layering, [`src/invariants.test.ts`](../src/invariants.test.ts)
for what a selector states badly, and the compiler for the four switches over
`RecordedAction`. Node is pinned to **24** in `.nvmrc`, which `engines` and CI
both read. Prefer adding a check to adding a paragraph.

Instructions are vendor-neutral: [AGENTS.md](../AGENTS.md) is canonical,
`CLAUDE.md` is a pointer to it, and `.claude/` holds adapters only — hooks that
call the project's npm scripts and a reviewer that reads
[review-checklist.md](review-checklist.md). Any assistant should be able to work
here from AGENTS.md alone.

## Waiting on the author

**Terrain (backlog 6) — a proposal put to him 2026-09-06, not yet answered.**
Every existing rules decision is ✅ as of 2026-08-16; do not reopen one without
him. Terrain is a *new* question, and the document has no terrain table at all,
so all of the below is invention. Build nothing until he answers; if he never
does, the defaults below are what to build, marked ⚠️.

The shape: **authored features on the map** (polygons a scenario places, drawn
under the tokens, recorded like a unit so a replay has the same ground). A map
with none plays exactly as today, so the module is additive. Each feature has a
type, and a type carries at most three effects — all through machinery that
already exists, so the invention is the table, not the engine:

| Type | Cover for a force in it (`baseCover`) | Line of sight | Movement |
|---|---|---|---|
| open (no feature) | none | clear | as the document |
| חורש / מטע (wood, orchard) | **partial** | concealing | metres in it count **double** |
| שטח בנוי (built-up) | **full** | concealing | metres in it count **double** |
| מכשול (water, cliff) | — | clear | **impassable** |

- **Cover**: terrain sets `baseCover`, which exists and nothing sets. A force
  in a wood still digs from partial up to full. Cover already carries its own
  (tentative) concealment figure, so terrain adds **no new detection number**.
- **Line of sight**: a line may cross at most **20 m** of concealing terrain in
  total — the document's own hidden-enemy band, so a fight inside cover is a
  fight at 20 m. Into the edge: allowed. Through a wood: blocked. Two forces
  deep in the same wood: blocked past 20 m. Rejected alternatives: opaque like
  smoke (a force inside could neither see nor fire out — a hide, never a
  position), and blocks-through-only (a deep wood would hide nobody).
- **Movement**: the double cost is what keeps terrain from being a dominated
  choice — cover, concealment and a 20 m sight limit for nothing would make the
  wood always the right place to be. Depth is the player's dial: at the edge
  you fight, deep in you hide and see nothing.
- **Kept out of the first cut**: elevation (a ridge blocks *through* but never
  *into*, different geometry — a later row), terrain-specific detection
  figures, and any effect on indirect fire or assault (cover is a direct-fire
  modifier only; that is the document's scope).
- **Riders proposed**: a UAV does not auto-detect a *stationary* force inside
  concealing terrain (it is not "גלוי"); a moving one it does. Vehicles pay the
  same double cost in wood and built-up rather than being barred.

Questions put to him: (1) the cover grades — partial for a wood, full for
built-up; (2) the 20 m sight rule; (3) the double movement cost; (4) whether a
ridge belongs in the first cut; (5) the UAV rider.

Two are ✅ *as decisions* while their **numbers** are still ours. They belong to
the balance pass, not to the rules list, and live on
[balance.md](balance.md):

| | Chosen | Note |
|---|---|---|
| Decision 9 | smoke radii **25 / 50 / 100 m** | The document sizes no screen. |
| Decision 13 | casualty bands **0 / 1–2 / 3–5 / 6+** | He confirmed that reports are banded, not where the bands fall. |

**Decision 11's riders** (no assault on armour, no ammunition tracking) remain
assumptions he has not contradicted; ammunition is backlog 12's job.

So the next rules question is a **new** one, and terrain is it.

## Do not re-propose

Closed deliberately, with reasons that are not obvious from the code:

- **An artillery battery as a standalone unit.** Indirect fire is off-map
  *because* the playable slice is the platoon-leader view — a platoon commander
  calls for fire rather than owning guns. The battery arrives with **echelon
  scaling** (backlog 3) and not before (decision 8).
- **Reading the cover modifier as percentage points.** Settled on the document's
  own grammar, not on the arithmetic (decision 7).
- **A flat bonus for a sector of observation.** It made the width control a trap
  — the widest arc dominated every narrower one. The bonus is divided by the
  arc's width for that reason (decision 14).
- **Raising the charge trigger radius to the 20 m search band.** The gap between
  10 m and 20 m is the ground where a charge is found without being trodden on,
  which is the only thing the search roll buys (decision 10).

## Do not re-derive

Measurements that cost real time and are already recorded:

- **Charges, before the decision-10 fix:** a charge 5 m off the route at the
  midpoint of a 50 m walk fired **200/200 seeds and was found 0/200**.
- **Hidden enemy, same shape:** a stationary squad 15 m beside a 50 m walk was
  found **0/400** from the endpoint against **~26%** beside the halt.
- **Sector bonus by width:** `13.5 ÷ width` → +23% / +15% / +8% at
  60° / 90° / 180°, against a flat −20% outside.
- **Node support windows** (from `nodejs/Release`, checked 2026-09-05): 20 went
  EOL **2026-04-30**, 22 ends 2027-04-30, 24 ends **2028-04-30** and leaves
  Active LTS on 2026-10-20. That is why the pin is 24 and not 22.

## What I would pick up next

1. **Terrain** (backlog 6) — and it needs the author more than it needs code.
   The document has **no terrain table at all**, so this is the biggest rules
   invention left, bigger than sectors were. Everything now points at it:
   `baseCover` sits on a `Unit` with nothing to set it, line of sight only knows
   about smoke, the map is a bare field, and a sector now tells a force where to
   look with nothing on the ground to look at or from behind. Bring him a
   proposal with the tradeoffs already worked out — he settles a well-framed
   question in one line, and he checks new mechanics for dominated options.
2. **Laying charges during play.** Small and self-contained, but the document
   does not describe engineering work at all — ask before building.
3. **Morale** (backlog 1). The neutralise rule is the only cohesion model; the
   posture system is the natural place to hang suppression.

Two I would *not* rush: **echelon scaling** (backlog 3) touches the C2 model
everywhere and has since picked up the artillery battery, which makes it larger
rather than more urgent; and **OPORD mode** (backlog 13) is a research project
with a section of its own in the README.

## Traps that cost real time

Browser-driving traps live in [driving-the-game.md](driving-the-game.md) and
testing ones in [AGENTS.md](../AGENTS.md). These are the ones specific to where
the code currently stands:

- **Sealed recordings made before 2026-08-16 that cross a minefield will fail
  `verifyRecording`.** Decision 10 changed how many rng draws a move near a
  charge makes. That is the tool doing its job, not a regression.
- **A rule with two halves is where the bugs have actually been.** Three of the
  five decisions settled on 2026-08-16 turned up real defects, and every one was
  two halves of a single rule applied at different layers or measured off
  different geometry — each half defensible alone. When you touch one half, go
  and read the other.
- **`addUnit` records the force as it stands.** Setting `camouflaging` or
  `baseCover` after adding a unit desyncs the recording from the live game — the
  replay gets an undressed unit. Set it before `addUnit`.
