# Handoff — where the project stands

**Current as of `1c91733`, 2026-09-21.** This is the working note for whoever
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
npm run check       lint + typecheck clean, 428 tests, 22 files
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

**Two things, both raised 2026-09-21, neither blocking today's work.**

1. **Mission and victory conditions** (backlog 18) — the shape, before
   anything is built on a reading. The document names none.
2. **Weather and light** (backlog 19) — same, and the same reason as morale.

The `LICENSE` carve-out closed the same day it was raised: it named the two
Ramat Menashe map files and not the two Tel Azeka ones, which had shipped on
2026-09-16 without it. ✅ author 2026-09-21, and it is now grouped by source
rather than listed per file. **A test holds it** — `src/invariants.test.ts`
fails when a module under `src/app/maps/` is not named there — so the next
window cannot repeat it. The clause still lists files, though, which is what
backlog 17 breaks: ground fetched at runtime cannot be named in advance.

Six rulings closed on 2026-09-16, every one of them the same day
it was raised — decisions 16, 17 and 18, and two riders on 12.

The biggest was חיפוי, **covering fire**, which had been in the document all
along and never in the engine: phase 6 is `ירי\חיפוי\הסתערות` and we had two
of the three. The document gives one line, *פגיעה במקרה של פעולה על ידי האויב:
כמו ירי*, so how it resolves was settled and what triggers it was not; he gave
the four answers, and decision 18 is built on them.

The smallest was a charge telling the man who laid it: he learns it has gone
off only **if he can see it happen** — line of sight, not ownership (decision
17). Sight is the weaker test on purpose, so the layer who can only see the
ground is told his charge fired, while a side holding a contact on the force
that trod on it is told who.

Rules decision 15 (elevation and objects) closed on 2026-09-06 in two steps:
the shape — one sight test over real ground, eye heights, object cover — and
then, from our suggestions, **Naismith** for climbing and **no hit
modifier for now**. Every figure he gave that day is "tentative, write it
down" and sits on [balance.md](balance.md). The ODbL carve-out for the
OpenStreetMap-derived file went into `LICENSE` the same day at his word. Do
not reopen a decision without him.

Decision 16 (laying charges) closed on 2026-09-16 the same way: he gave the
shape and the two turns, and confirmed our reading of what the two turns cost.
The only ⚠️ left in it is scaffolding rather than a rule — the demo hands
RED-1 the `canLayCharges` flag so the rule can be played, and that line goes
when force types arrive with echelon scaling.

**Covering fire is in** (decision 18, 2026-09-16). A force holds its action to
answer the first enemy it sees move, fire or assault; the shot falls at the
first point of the bound the coverer could reach, and the mover carries on to
where it was going.

**One thing about covering fire to keep in mind when it is next played.** A
force answers only an enemy its side has **detected** (author, 2026-09-16), and
the roll that picks a mover up happens on the way into the *fire* phase — after
the movement phase. So the first bound that breaks cover in front of a coverer
is not answered; the ambush fires on the next one. That is the ruling working
as given, not a bug, and it is pinned by a test — but it is the sort of thing
that feels wrong at the table before it is explained, and the alternative (the
coverer rolls its own look at the moment of the trigger) is a change he would
have to make, not us.

**A prepared position now protects from turn 1, and is left behind when the
force walks away** (decision 12, ✅ author 2026-09-16, two rulings the same
hour). `addUnit` used to raise cover from the ground's objects only and leave
`baseCover` to the first upkeep, so a defender who had prepared stood in the
open through turn 1's exchange of fire; and nothing ever cleared `baseCover`,
so that same defender could displace 800 m into the open and take its cover
with it — safer on the move than a force that had never dug. Both halves were
latent for as long as nothing set `baseCover` at setup. The Tel Azeka scenario
was the first thing that did, and its test found the first half the same hour
it was written.

He also confirmed, rather than changed, that **cover is read at the end of the
turn and not on arrival**: a force that moves into a building is behind it from
the next turn. That holds while nothing shoots mid-bound — which is why חיפוי
above is not just another backlog item.

Some are ✅ *as decisions* while their **numbers** are still ours. They belong to
the balance pass, not to the rules list, and live on
[balance.md](balance.md):

| | Chosen | Note |
|---|---|---|
| Decision 9 | smoke radii **25 / 50 / 100 m** | The document sizes no screen. |
| Decision 13 | casualty bands **0 / 1–2 / 3–5 / 6+** | He confirmed that reports are banded, not where the bands fall. |
| Decision 15 | eye heights **1.5 / 2.5 / 0.5 m**, object cover, **8 m per metre climbed**, **30°** for vehicles | All his, all "tentative until balance". |
| Decision 16 | laying a charge takes **2 turns** | "Tentatively", 2026-09-16. What the two turns *cost*, and that the charge goes where the force stands, he confirmed the same day. |

**Decision 11's riders** (no assault on armour, no ammunition tracking) remain
assumptions he has not contradicted; ammunition is backlog 12's job.

One rules question is **open but not asked**, because nothing needs it yet:

- **Roads as going.** The map draws roads and the engine ignores them. Faster
  along a road, a vehicle confined to one — the document does not raise it.

## Do not re-propose

Closed deliberately, with reasons that are not obvious from the code:

- **A limit on how many charges a force may lay.** No stock and no cooldown is
  deliberate: put to the author 2026-09-16 and **deferred to ammunition**
  (backlog 12), because a stock of charges per force is the same mechanism as
  rounds per force and a separate one here would only have to be unpicked. It
  is a known dominated option in the meantime — for a force that was going to
  sit still anyway the two turns are free (decision 16).

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
- **Terrain types** (wood, built-up, each with a cover grade, a sight rule and
  a movement cost). Proposed and **withdrawn on the author's steer**
  2026-09-06: the game is to scale from soldier to brigade with metre-level
  resolution underneath, so the map carries *objects* and *elevation*, never
  a zone with a rules table. A wood is a footprint from OpenStreetMap, not a
  type (decision 15).
- **An elevation bonus to hit or to detect.** "No hit modifier for now" — the
  sight lines already reward the high ground. To be looked at again at
  balance, not before (decision 15).
- **Judging "no climb" on the whole order line.** It was the shortcut in
  `reachAlong`, and on the real map it disagreed with the bound's own
  samples one order in 260 and threw out of the order loop. The climb is
  judged on the bound taken; a test holds a field on which the old shortcut
  overspends.

## Do not re-derive

Measurements that cost real time and are already recorded:

- **Charges, before the decision-10 fix:** a charge 5 m off the route at the
  midpoint of a 50 m walk fired **200/200 seeds and was found 0/200**.
- **Hidden enemy, same shape:** a stationary squad 15 m beside a 50 m walk was
  found **0/400** from the endpoint against **~26%** beside the halt.
- **Sector bonus by width:** `13.5 ÷ width` → +23% / +15% / +8% at
  60° / 90° / 180°, against a flat −20% outside.
- **Dead ground on the demo map:** BLUE-2 running up the centre from
  (400, 60) is seen by nobody on turn 1 at (400, 160) — **0/200 seeds** —
  and by someone on turn 2 at (400, 260) — **200/200**, RED-1 itself 185
  times. The shoulder at about y = 250 is where the northern low ground comes
  into view.
- **Node support windows** (from `nodejs/Release`, checked 2026-09-05): 20 went
  EOL **2026-04-30**, 22 ends 2027-04-30, 24 ends **2028-04-30** and leaves
  Active LTS on 2026-10-20. That is why the pin is 24 and not 22.
- **What a NATO symbol costs to draw** (measured in the dev browser,
  2026-09-21): **0.037 ms** per `renderUnitSymbol` call before it was cached,
  **0.0006 ms** on a cache hit after — about 60×. Worth knowing what that does
  *not* buy: at the 5–8 tokens a platoon battle draws it is well under a
  millisecond per re-render either way, so this was never the cause of the
  "ten button clicks in one script call is too many" ceiling further down
  this file. That cause is still unmeasured. The cache earns its place at the
  token counts echelon scaling (backlog 3) brings, and on a phone (Stage 4),
  not on a desktop platoon.
- **What Jev actually exposes** (from `typesafe-ai/typesafe-sdk-js`, read
  2026-09-21, for backlog 15): three question kinds — `noul`, `choice`, `score`
  — answers carrying a confidence and per-label probabilities, and **no seed and
  no temperature among the exported types**. Hosted API, Node 20+,
  `TYPESAFE_API_KEY`, no published weights and no self-hosting. The vendor's own
  documentation site was unreachable from a sandboxed session, so the SDK source
  on GitHub is the reference that can actually be read.

## What I would pick up next

1. **Morale** (backlog 1) — but **ask first**. The neutralise rule is the only
   cohesion model and the posture system is the natural place to hang
   suppression, so the work is clear. The problem is that the mechanics
   document says *nothing* about morale: not מורל, not שבירה, not דיכוי, not a
   table. Every number and every state transition would be ours, which is a
   larger pile of assumptions than any decision so far. Get the shape from him
   before building, the way decision 15 was got.
2. **Mission and victory conditions** (backlog 18) — **ask first**, but this
   is the one to ask about. It sits under the whole product direction: a
   campaign needs a result to carry (backlog 16), a mission builder needs
   "objective" to mean something (backlog 17), and the debrief would finally
   measure a plan against its mission instead of a body count. Today a battle
   ends only when one side is wiped out.
3. **The AI player** (backlog 15, added 2026-09-21). Unlike morale this is
   **unblocked** — it invents no rule, so it needs no ruling — but it is Stage 3
   work while the repo is mid-Stage 2, and it brings a hosted third-party
   dependency with it. The item names the shape, the first slice, and the four
   things still open. Read it before touching any of it, particularly the part
   about `sideView` versus `game.units`: that mistake would pass every test in
   the suite.

**The roadmap now carries the product direction** (2026-09-21): the browser
build is the development shell, and **Stage 4** is the mobile and desktop app
on the same engine. Backlog **16–19** are the four things the author described
that the repo did not have — campaigns, a mission builder over real ground and
mission parameters, mission and victory conditions, and weather. Two of the
four are blocked on rulings, and the README says which.

**The scenario picker is built** (2026-09-21), so that item is off this list.
`בחר קרב` in the header lists the catalogue in
[`scenario.ts`](../src/app/scenario.ts); each generated module exports its own
entry, so adding a battle is a spec, a run of the tool, and one line in that
list. Tel Azeka is reachable from the app now rather than only from its test.

**The live log is filtered by side now** (rules decision 17, 2026-09-16), so
that item is off this list. `LogEntry` carries `readers`, `pushLog` takes a
required audience, and `LogPanel` renders only what the side at the screen may
read. See decision 17 for the three cases and the author's three rulings.

## Traps that cost real time

Browser-driving traps live in [driving-the-game.md](driving-the-game.md) and
testing ones in [AGENTS.md](../AGENTS.md). These are the ones specific to where
the code currently stands:

- **Recordings saved from the demo before Naismith (2026-09-06) replay
  differently**: an order's bound now stops short uphill, so every position
  after the first climb moves. `verifyRecording` will say so.
- **Sealed recordings made before 2026-08-16 that cross a minefield will fail
  `verifyRecording`.** Decision 10 changed how many rng draws a move near a
  charge makes. That is the tool doing its job, not a regression.
- **A rule with two halves is where the bugs have actually been — every time.**
  Three of the five decisions settled on 2026-08-16 turned up real defects this
  way; on 2026-09-16 it was **eleven**, across three features, and not one of
  them was a typo or a bad algorithm. Each was one rule applied in two places
  off different state, each half defensible alone: cover written at placement
  but read mid-bound, exactness keyed to the firer where the document keys it
  to the owner of the casualties, three of four attack paths carrying a
  refusal, an action economy borrowing a flag two other rules read. See
  [handoff-archive.md](handoff-archive.md) for that day's list.

  **When you touch one half, go and read the other** — and when a comment says
  a rule "cannot disagree" with another, check that it is true rather than
  intended. One of the day's bugs was a comment of mine claiming exactly that
  about two expressions that were not the same.
- **A sealed recording of a game whose forces had `baseCover`, made before
  2026-09-16, will fail `verifyRecording`.** Placement now gives a prepared
  force its cover, so the first turn resolves differently. No such recording
  exists in the repo — nothing set `baseCover` at setup before Tel Azeka — but
  a recording saved from a scenario of your own might.
- **`src/app/scenario.ts` is the catalogue, not a scenario.** The battles live
  in `src/app/scenarios/`, and both are generated — editing one is editing a
  build product, and the next run of the tool throws the edit away. The specs
  are `tools/scenarios/*.json`. That now includes each module's **catalogue
  entry**, so a title or a picker line is changed in the spec too.
- **A new battle is not open to the player until it is in the catalogue.**
  Running `make-scenario.py` writes a module that nothing imports. The one
  hand-written step is adding its `*_BATTLE` export to `SCENARIOS` in
  `src/app/scenario.ts`; `src/app/scenario.test.ts` checks what is in that
  list, so it cannot tell you about a battle you left out of it.
- **Switching battles remounts `App` on the scenario's id** ([`Root.tsx`](../src/app/Root.tsx)).
  The engine is a mutable instance in a ref with a turn's worth of state beside
  it, so a new battle is a new `App` rather than a reset that would have to be
  extended every time a piece of state is added. Anything that must survive a
  switch has to live in `Root`, above the key — nothing does yet.
- **`addMine` is setup only now** (decision 16). A test or tool that emplaced a
  charge mid-game gets a `PhaseError`; in play a force lays one, which takes
  turns. Every call site was already before `beginTurn`, so nothing had to
  move — but a new one written from memory will fail.
- **`addUnit` records the force as it stands.** Setting `camouflaging` or
  `baseCover` after adding a unit desyncs the recording from the live game — the
  replay gets an undressed unit. Set it before `addUnit`.
- **The demo seed can miss a 90% roll twice.** On seed 2026 BLUE-2 crests the
  shoulder on turn 2 in full view of the tank and the ridge squad, and on that
  seed both missed before the wall fix; after it the tank sees it. Over 200
  seeds it is seen every time. A "nobody saw it" in the browser is a seed
  before it is a bug — measure before ruling.
- **Ten button clicks in one browser script call is too many.** The pane
  re-renders every token through milsymbol between clicks; eight is the
  ceiling, six is safe, and the handoff button's label starts with the side
  (`RED מוכן — הצג את המפה`), so match on the word, not the prefix.
- **The tank's cover is 1.6 m from flipping.** `RED-TANK` stands 4.6 m from
  the nearest house and the cover reach is 3 m; full cover would drop its
  eye to 0.5 m and switch off the "far low ground" lesson.
  `src/app/scenario.test.ts` pins it — if a regenerated map fails there, move
  the tank, do not loosen the test.
- **A log line without an audience does not compile, and that is deliberate.**
  `pushLog`'s third argument says who may read the line (rules decision 17).
  Reaching for the old `pushLog(text, kind, viewingSide)` shape passes a `Side`
  where an `Audience` belongs — the compiler says so, and
  `src/invariants.test.ts` catches it as text too. Use `onlyFor(side)` for a
  decision behind one's own lines, `sharedBy(side)` for an exchange both sides
  were in, `TABLE` for the umpire's bookkeeping, and `pushPerSide` when the two
  sides are entitled to different words — which is every line carrying losses.
- **A force's own object is left off its sight line for 6 m only.** The first
  cut skipped the whole object and let a squad against a house be seen
  straight through it from the far side. `OWN_OBJECT_SIGHT_M` is twice the
  cover reach for exactly the wall-versus-building distinction; read
  `terrainBlocksSight`'s comment before touching either number.
- **A zero-size Browser pane makes every map click land at (0, -1).** With the
  pane hidden the page gets no layout at all — `innerWidth` is 0 — so a click
  aimed as a fraction of `svg.map`'s rect maps to the origin, the order *is*
  accepted, and the log shows a plausible-looking bound to nowhere. Set a
  viewport (`resize_window` 1280×900) before aiming at map coordinates, and
  re-measure the rect *after* the map is on screen rather than at a handoff.
- **The console buffer in the Browser pane survives reloads.** After changing
  an export's shape (a component becoming a `memo`), the buffer shows
  "Component is not a function" with an *older* module timestamp than the
  page. If a clean reload renders tokens and buildings, it is history.
