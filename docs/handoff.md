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

**Elevation (backlog 6, reframed) — a proposal put to him 2026-09-06, not yet
answered.** Every existing rules decision is ✅ as of 2026-08-16; do not reopen
one without him. Build nothing until he answers; if he never does, the defaults
below are what to build, marked ⚠️.

The author's steer, 2026-09-06: the game is to scale from soldier level up to
brigade and above, with the engine eventually moving and resolving individual
units at metre scale under a commander who can zoom down. So **no terrain
types** (wood, built-up) — the map carries **objects** (trees, buildings,
walls) — and the thing to resolve now is **elevation**. A first proposal of
terrain types with a cover/sight/movement table was withdrawn on that steer.

The shape proposed:

- **One height function.** A heightfield (grid of ground elevations, ~10 m
  spacing at platoon scale) plus objects as footprints with a height on top of
  it (building ~6 m, tree ~4 m, wall ~1.5 m). Line of sight is one test: sample
  the profile along the segment, block if ground or object rises above the line
  from observer eye to target. Smoke stays a second blocker on the same
  predicate. Scales as he wants: a brigade map is the same grid sampled
  coarser, objects aggregate into polygons later without changing the test.
- **Authoring.** Demo map = a few analytic hills rasterised into the grid; the
  same grid can later be filled from a real DTM. Nothing procedural.
- **Sight is binary and symmetric.** A crest hides a force and blinds it
  equally, so reverse slope vs crest is the player's dial with no invented
  number. No elevation bonus to hit or detect (the document has none).
- **Eye height follows posture** (proposed): infantry 1.5 m, vehicle 2.5 m, a
  force in full cover 0.5 m. Gives digging in a cost it lacks today — lower
  silhouette, but it sees less over a rise.
- **No slope cost to movement** in the first cut (the document gives none).
- **Cover comes from objects, not height**: inside a building footprint full,
  at a wall or tree partial — `baseCover` again, no new machinery.

Questions put to him: (1) heightfield grid with a DTM as the eventual source,
and whether a real training area is in mind; (2) the eye heights, or one
height for all to start; (3) binary symmetric LOS only, no hull-down state;
(4) no slope cost; (5) object cover in the first cut, or pure elevation first.

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
