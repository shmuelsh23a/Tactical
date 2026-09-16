# Handoff — where the project stands

**Current as of `29e1cfe`, 2026-09-16.** This is the working note for whoever
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
npm run check       lint + typecheck clean, 373 tests, 20 files
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

**One ⚠️ raised 2026-09-16 with decision 17, and unanswered:** a force is now
told when a charge **it laid** goes off — that it fired, not who it caught or
where. The charge is spent and its marker leaves the layer's map the same
instant, so the alternative is watching it vanish with nothing in the log. The
document rules on neither; this is ours. He may prefer the layer learn nothing
until he looks.


**Nothing.** Rules decision 15 (elevation and objects) closed on 2026-09-06
in two steps: the shape — one sight test over real ground, eye heights, object
cover — and then, from our suggestions, **Naismith** for climbing and **no hit
modifier for now**. Every figure he gave that day is "tentative, write it
down" and sits on [balance.md](balance.md). The ODbL carve-out for the
OpenStreetMap-derived file went into `LICENSE` the same day at his word. Do
not reopen a decision without him.

Decision 16 (laying charges) closed on 2026-09-16 the same way: he gave the
shape and the two turns, and confirmed our reading of what the two turns cost.
The only ⚠️ left in it is scaffolding rather than a rule — the demo hands
RED-1 the `canLayCharges` flag so the rule can be played, and that line goes
when force types arrive with echelon scaling.

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

## What I would pick up next

1. **Morale** (backlog 1) — but **ask first**. The neutralise rule is the only
   cohesion model and the posture system is the natural place to hang
   suppression, so the work is clear. The problem is that the mechanics
   document says *nothing* about morale: not מורל, not שבירה, not דיכוי, not a
   table. Every number and every state transition would be ours, which is a
   larger pile of assumptions than any decision so far. Get the shape from him
   before building, the way decision 15 was got.
2. **A scenario picker.** `tools/make-scenario.py` writes a scenario module
   from a spec, so a second battle is a spec file — but the app still opens
   exactly one. Choosing between them is UI that does not exist.

**The live log is filtered by side now** (rules decision 17, 2026-09-16), so
that item is off this list. `LogEntry` carries `readers`, `pushLog` takes a
required audience, and `LogPanel` renders only what the side at the screen may
read. See decision 17 for the three cases and the author's three rulings.

Chasing it turned up four things the filter alone would not have fixed, each
worth knowing because each was a rule with two halves:

- The log **baked exact-vs-banded losses from whoever was viewing** when the
  line was written, then showed that line to everybody.
- The fire line printed `${shooters} יורים` — the firer's **exact fit
  strength** — to the target, which makes banding its casualties pointless.
- The debrief hid `executeStandingOrders` from the enemy **wholesale**, so a
  force shot at under a standing order was never told; and the **לקחים** panel
  read only explicit `fire` / `assault` actions, so the same ambush left
  `hitByUnseen` at nought.
- Filtering to `viewingSide` at a **handoff** shows the outgoing player the
  incoming side's private log — `viewingSide` is already the incoming side
  there. The panel takes a nullable reader for exactly this.
- **A shot has three readers, not two.** The debrief's `exact` means "the
  reader owns the target", which is true of the umpire *and* of the force being
  shot at — so the side under fire read the firer's exact strength, its hit
  chance and the damage it took. `Lens.side` is required now (`null` is the
  umpire) so a lens has to say which it is; before, a lens built without one
  silently became the umpire.
- **`knows` is not "is looking now".** It says a contact record exists. Reading
  it as a sighting let a side read `נראה מנוטרל` off a three-turn-old mark its
  own map still drew alive — decision 13 had already ruled the other way.

**Backlog 6 is closed.** A battle is now laid out by describing it:
`tools/make-scenario.py` takes a JSON spec and writes the scenario module, and
the demo is its output — which is what keeps the tool honest, since the suite
plays the generated battle. A second scenario is a spec file and nothing else.
The app still opens exactly one battle, though: choosing between scenarios is
UI that does not exist.

Small things noticed and left: for an **ordered tank-round** engagement,
`engaged.newCasualties` sums every unit caught in the blast against the
target's id (`game.ts`), so the firer's own men caught in its own burst land in
the debrief's `inflicted` rather than `suffered` — pre-existing normalisation,
newly visible now that the לקחים panel counts ordered engagements; a tank round
that hits reports no casualties in the live log at all (`handleFireAt`'s `fireExplosive` branch) — pre-existing,
and now a two-line fix since `logLosses` exists; the debrief has no *height*
readout for a force; `fetch-osm.py` keeps a way whole when any vertex is inside, so Route 6
carries 1.3 km of off-map points that the SVG clips — file size only.

Two I would *not* rush: **echelon scaling** (backlog 3) touches the C2 model
everywhere and has since picked up the artillery battery, which makes it larger
rather than more urgent; and **OPORD mode** (backlog 13) is a research project
with a section of its own in the README.

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
- **A rule with two halves is where the bugs have actually been.** Three of the
  five decisions settled on 2026-08-16 turned up real defects, and every one was
  two halves of a single rule applied at different layers or measured off
  different geometry — each half defensible alone. When you touch one half, go
  and read the other.
- **`src/app/scenario.ts` is a seam, not the scenario.** The demo lives in
  `src/app/scenarios/yokneamIllit.ts`, which is generated — editing it is
  editing a build product, and the next run of the tool throws the edit away.
  The spec is `tools/scenarios/yokneam-illit.json`.
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
- **The console buffer in the Browser pane survives reloads.** After changing
  an export's shape (a component becoming a `memo`), the buffer shows
  "Component is not a function" with an *older* module timestamp than the
  page. If a clean reload renders tokens and buildings, it is history.
