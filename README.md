# Tactical Wargame — Rules Engine (משחק מלחמה לפו"ם)

A deterministic, fully-tested **TypeScript rules engine** implementing the
tabletop tactical wargame described in [`Tactical - Mechanics.docx`](Tactical%20-%20Mechanics.docx)
(Hebrew; readable as Markdown at
[`docs/mechanics.he.md`](docs/mechanics.he.md)). Stage 1 — the engine — is
complete; stage 2, the hotseat browser game on top of it, is in progress. Mobile
and networked/single-player modes sit on the same module later.

Working on this repo with Claude Code? Start with [CLAUDE.md](CLAUDE.md).

## Why it's built this way

- **The engine has no runtime dependencies** — pure TypeScript, no React and no
  browser APIs, so the same module powers the browser game now and the mobile
  app later. (React, react-dom and milsymbol belong to the app layer only.)
- **Single seeded RNG** ([`Rng`](src/engine/rng.ts)) — every random outcome is
  drawn from one seedable generator, so a whole game is replayable bit-for-bit.
  Essential for tests, debugging, and future networked play (all clients
  resolve identically from the same inputs).
- **Data tables transcribed verbatim** from the document, kept separate from
  the logic ([`src/engine/data/`](src/engine/data)), so a rules tweak is a data
  edit, not a code change.

## Commands

```bash
npm install
npm run dev          # start the browser game (Vite dev server, hotseat UI)
npm run build        # production build of the app -> dist/
npm run preview      # preview the production build
npm test             # run the engine test suite (115 tests)
npm run typecheck    # strict type-check (engine + app)
npm run build:engine # emit the engine as a standalone library -> dist/
```

## Stage 2 — browser UI (hotseat) — in progress

A React + Vite + SVG app in [`src/app/`](src/app) (see **Layout** below) drives
the engine in **hotseat** mode, using **NATO symbols** (via the `milsymbol`
library) for all units. Affiliation is drawn relative to the **viewing** side.

Implemented in the slice: initiative roll, hotseat handoff overlay (hides the
board between players so fog-of-war isn't leaked), per-side fog-of-war (an enemy
is shown once a friendly unit is within 300 m), unit selection with a movement
range ring, range-validated movement with detection, direct fire (small-arms /
MG and tank round) with a combat log, casualty/neutralisation display, **one
fire action per force per fire phase**, a **command group (חפ"ק)** per side that
the player moves (shown with the APP-6 HQ staff), **enforced command & control**
(the פו"ש order interval gates manoeuvre — see rules decision 6 — with a live
readout of distance to the command group, order frequency, and the turn the next
orders arrive), **fixed faction colours** (BLUE always friendly/blue, RED always
hostile/red, regardless of whose turn it is), and a **targeting phase**: each
side marks one indirect-fire mission and one smoke screen per turn (see rules
decision 8). A marked aim point is drawn only on its owner's map, with the turn
it will land; the round scatters through the dispersion table on arrival and the
combat log reports the miss distance and every casualty. Smoke comes from any of
the document's three sources — a thrown רימון is in place at once, a פצמ"ר or
פגז ארטילריה has to be fired and arrives with its weapon's שיהוי, each with its
own screen size (rules decision 9); a screen in flight shows its future
footprint so it can be sited on a line. **Smoke blocks fire into and through it**
(אין ירי לתוך\דרך עשן) — the engine derives line of sight from the screens on
the map rather than the app asserting it.

RED also defends behind a **minefield** in the demo scenario. A side sees its own
charges; the enemy's only once they have been spotted, and a force that walks
into one takes the blast mid-bound (rules decision 10).

In the fire phase a force can shoot or **assault** (הסתערות) a neighbouring
enemy: pick the action, choose how many grenades to throw, and the selected
force is ringed with its 25 m reach (rules decision 11). The log reports assault
fire, grenade hits, and any casualties the throwers inflict on themselves.

**שמור הקלטה** in the header saves the battle as a recording — the seed plus the
action log, a few kilobytes rather than a state dump, because the seeded engine
can rebuild everything else. [`replayGame()`](src/engine/recording.ts) replays
it to the same state, ids and RNG position included.

Engine capability the UI does not reach yet — the next obvious work:

- **Charges cannot be laid during play** — they are placed when a scenario is
  built. Laying them is an engineering action the document does not describe.
- **Fog-of-war is a flat 300 m radius** (`hotseat.ts`), with no terrain and no
  probabilistic spotting. Line of sight now accounts for smoke, but nothing else
  obstructs it.
- **No terrain**: the map is a bare 900 × 800 m field, and cover is the engine's
  "did not move or fire" flag rather than a feature of the ground.
- **A recording can be saved but not loaded back** — replaying one reconstructs
  the game in the engine, but the hotseat UI has no debrief view to step
  through it yet.

## Layout

```
src/engine/
  rng.ts            Seedable Mulberry32 PRNG
  dice.ts           Dice notation (1d8 / Hebrew 1ק8), rolling
  geometry.ts       Distance, range-band lookup, blast radius, LOS through smoke
  types.ts          Units, soldiers, vehicles, mines, smoke, fire missions
  units.ts          Casualty bookkeeping + unit constructors
  upkeep.ts         Bleeding, smoke decay, end-of-turn flag reset
  recording.ts      Battle recording: action log -> replayable game
  game.ts           Game class: 7-phase turn loop, C2 gating, action API
  index.ts          Public API barrel
  data/
    movement.ts     Normal/run gaits, detection %, enemy-hit modifiers
    directFire.ts   Small-arms & sustained-MG range bands, cover modifiers
    explosives.ts   RPG, mortar, artillery, tank, mines, ATGM
    smoke.ts        Smoke duration + screen radius by source
    uav.ts          Fixed-wing & drone profiles
    armor.ts        Armour hit-location / penetration / effect table
    artillery.ts    Dispersion (short/long, left/right) configuration
    c2.ts           Command-interval-by-distance table (פו"ש)
    casualties.ts   nq"p thresholds + assault values
  combat/
    directFire.ts   Ballistic fire resolution
    explosives.ts   Blast + direct-fire-explosive resolution
    indirectFire.ts Dispersion → impact → blast (mortar/artillery)
    artillery.ts    Dispersion roll
    armorDamage.ts  Armour hit resolution
    assault.ts      Assault (fire + grenades)
    detection.ts    Movement-based and UAV-based detection
    mines.ts        Charges triggered along a force's path

src/app/                Hotseat browser game (React + Vite + SVG)
  App.tsx           Controller: turn loop, activations, selection, actions
  hotseat.ts        Activation order, fog-of-war, victory check
  scenario.ts       Demo scenario (BLUE platoon vs RED position + tank)
  symbols.ts        APP-6/2525 SIDC per unit, rendered via milsymbol
  components/       MapView (SVG map + interaction), Handoff, LogPanel

docs/mechanics.he.md    The rules document as Markdown (+ table → code map)
tools/dump-docx.py      Raw .docx extraction, to re-verify that transcription
```

Tests live beside the code they cover (`*.test.ts`).

## Quick example

```ts
import { Game, makeInfantry } from "./src/engine/index.js";

const g = new Game({ seed: 2024 });
const blue = g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: 0, y: 0 }, 8));
const red  = g.addUnit(makeInfantry("RED-1",  "RED",  "squad", { x: 0, y: 80 }, 6));

g.beginTurn();                 // turn 1, rolls initiative
g.advanceToPhase("combat");
const result = g.fire(blue.id, red.id, { weapon: "smallArms" });
// → { fired, hitChance, shooters, hits, totalDamage, newCasualties, ... }
```

## What's implemented (from the document)

- 7-phase turn order with initiative (1d10/side), delayed indirect fire
- Movement gaits (normal/run), under-fire half-pace, no-move-after-hit
- Detection on movement; UAV/drone footprint detection
- Direct fire: range bands, cover, target-movement modifiers, split fire, 1d4
- Explosives: RPG, mortar, artillery (with rate-of-fire & impact delay), tank
  round, ATGM (vs infantry / vs armour)
- AP/AT mines: spotted on the approach, or triggered by the path a force walks
- Artillery dispersion (short/long, left/right; launcher & UAV scaling)
- Smoke screens: per-source duration, size and flight time, blocking fire into
  and through them
- Assault (assault fire + grenades, self-hit) within 25 m, infantry only
- Armour damage table (location → penetration → crew/component/critical effect)
- Casualties: nq"p accumulation, 5-pt bleeding (1d4 / 5 turns), 8-pt neutralise,
  50%-attrition force neutralisation
- Command & control order intervals by distance (פו"ש), gating manoeuvre
- Battle recording: a game replays exactly from its seed and action log

## Rules decisions

Where the document is silent or ambiguous, the reading is decided here rather
than in the code. ✅ = confirmed with the author (2026-05-29); ⚠️ = implemented
on the stated reasoning, still awaiting the author's word.

1. ✅ **מטול = under-rifle grenade launcher** (key `rifleGrenade`).
2. ✅ **נגד רק"מ = RPG** (key `rpgVsArmor`), usable to **700 m** at 10%. A guided
   ATGM will be added as a separate weapon later.
3. ✅ **HE vs tanks**: artillery/mortar/rifle-grenade within blast radius have a
   **20% chance to do 2 nq"p to the tracks**; two such hits (the 4-pt track
   pool) immobilise the vehicle — [`armor.ts`](src/engine/data/armor.ts).
4. ✅ **Infantry casualty allocation is random** among fit soldiers when a force
   is targeted; a player may instead name a specific soldier via
   `targetSoldierId` — [`units.ts`](src/engine/units.ts).
5. ✅ **Engine/track damage**: the 8/4 nq"p are component pools; a penetrating
   hit deals the full pool (one-hit mobility kill), light HE chips 2 at a time.
6. ⚠️ **C2 gates manoeuvre, not fire** (assumed 2026-08-12, not yet confirmed
   with the author). A force that cannot receive new orders this turn may not be
   *moved*; it may still fire, on its local commander's initiative. The command
   group itself is never gated, and the interval is recomputed live — bringing
   the חפ"ק forward restores a cut-off force's tempo immediately.
   [`game.ts`](src/engine/game.ts) `canManoeuvre` / `moveUnit`; the whole module
   is switched off with `new Game({ seed, enforceC2: false })`.
7. ⚠️ **Cover cuts the hit chance proportionally, not by percentage points**
   (decided 2026-08-12 from the document, worth a sanity check). The source
   reads `-50% מסיכויי הפגיעה` — "-50% *of* the hit chance" — and the partitive
   מ־ makes it a proportional cut: full cover halves the shot (20% → 10%),
   partial cover shaves a tenth off it. Read as a subtraction of 50 points it
   would zero the entire direct-fire table (small arms 30/20/10 → 0/0/0,
   sustained MG 70/50/20 → 20/0/0), and since a force that holds still is *by
   definition* in full cover ([`upkeep.ts`](src/engine/upkeep.ts)), no defender
   could ever be shot. The table values stay verbatim (`-0.5` / `-0.1`); only
   their application changed — [`combat/directFire.ts`](src/engine/combat/directFire.ts).
8. ⚠️ **Indirect fire is an off-map asset, one mission per side per turn**
   (assumed 2026-08-12). The document gives rates of fire per barrel (3 bombs
   for a mortar, 2 shells for artillery) but the game has no battery piece to
   own them, so the hotseat UI allows each side one fire mission and one smoke
   screen per turn. This is a UI limit over an engine that already models
   `roundsPerTurn`; a battery unit would replace it.
9. ✅ **A smoke screen waits for its delivery, and is sized by it** (confirmed
   with the author 2026-08-12). The document lists the three sources with their
   durations but neither a delay nor a size, so:

   | מקור | רדיוס | משך | שיהוי |
   |---|---|---|---|
   | רימון | 25 m | 1 turn | none — in place when thrown |
   | פצמ"ר | 50 m | 2 turns | 1 turn |
   | פגז ארטילריה | 100 m | 4 turns | 2 turns |

   The **delay is not a separate table**: it is read from the delivering
   weapon's own שיהוי in the explosives table, so the two can never drift apart.
   The **radii are chosen** (⚠️ — the document sizes no screen) to scale with
   the delivery: a thrown pot screens a bound, a mortar bomb a squad's frontage,
   a shell a platoon's — [`data/smoke.ts`](src/engine/data/smoke.ts). A screen in
   flight is queued like an HE mission and lands in `resolvePriorArty`; screens
   go down *before* the rounds do, so a barrage cannot walk through its own
   smoke on the turn both arrive.
10. ⚠️ **A charge is triggered by the path walked, within 10 m** (assumed
    2026-08-12). The document gives the trigger as `דריכה` — stepping on it —
    with a 50% activation roll, but no distance, and a token here is a squad
    spread over some frontage rather than one man. So:
    - the **whole bound** is tested, not just where it ends, or a 100 m rush
      would vault a minefield;
    - **10 m** is the trigger radius — half the 20 m at which a charge can be
      *spotted*, so a force that fails its detection roll can still walk into
      one ([`combat/mines.ts`](src/engine/combat/mines.ts));
    - a charge already **found is stepped around**, which is what makes the
      document's detection percentages worth having: moving at normal pace
      spots charges within 20 m at 30%, running at only 5% — so the gait choice
      is a real gamble over a mined approach;
    - a charge that fires is **spent**; one that fails its activation roll stays
      armed for the next force through;
    - **no force triggers its own side's charges.**

    Until this, `activationChance` sat in the data and nothing read it — charges
    could be found but never went off.
11. ✅ **An assault reaches 25 m** (confirmed with the author 2026-08-12). The
    document puts הסתערות in the fire phase and makes the grenade
    `הסתערות בלבד`, but states no range; closing the last stretch is a
    movement-phase job, so the assault itself only checks that the force is
    already there — [`combat/assault.ts`](src/engine/combat/assault.ts).
    Two riders (⚠️): **armour cannot be assaulted** — the document models no
    infantry close assault on a vehicle, only נגד רק"מ as a weapon — and the
    **number of grenades is the player's choice** (0–3 in the UI) with no
    ammunition tracked, since logistics is still a roadmap item.

Still modelled by reasonable assumption (flag if you want them changed):

- **Small-arms band edges** (`299-100`, `400-300`) encoded as ≤100 / ≤299 / ≤400.
- **Target-movement modifiers** (`+30%` / `-20%` from the movement table) kept
  **additive** — the document phrases those without the partitive מ־ that made
  cover proportional (decision 7), and read additively they stay in range
  (30% → 60% against a walking target). Say if you want them proportional too.
- **Artillery "2d10 per axis"** read as a **d100 percentile** per axis (matching
  the ≤15% / 16–30% / 31%+ thresholds).
- **"hit% × fit soldiers"** modelled as each fit soldier rolling the hit chance
  independently (binomial), then 1d4 per hit.

## Design principles (apply to everything below)

- **Scalable & modular.** Every feature ships as a module that can be **toggled
  on/off** per game. A match is configured by a feature set, not a fixed
  ruleset, so a quick squad firefight and a full brigade exercise run on the
  same engine.
- **Selectable level of control — the player operates "one level down".** The
  player picks the echelon they command and directly manoeuvres the echelon
  **one level below** it:
  | Player commands | Directly moves | (Lower levels abstracted) |
  |---|---|---|
  | Squad leader | individual soldiers | — |
  | Platoon leader | squads | soldiers within each squad |
  | Company commander | platoons | squads/soldiers |
  | Battalion commander | companies | … |
  | Brigade commander | battalions | … |

  The current playable slice is the **platoon-leader** view (the pieces are
  squads). Selecting other levels is the *echelon-scaling* iteration.
- **The player controls their own command group (חפ"ק).** Each side has a
  movable command-group icon. Its position is the reference point for the C2
  (פו"ש) order-frequency table: the farther a subordinate is from the command
  group, the less often it can receive new orders. It can be targeted and take
  casualties, and it can engage in combat — but only with its small personnel
  (e.g. 3 shooters → 3 attack rolls), not a full squad's strength.
- **UI uses NATO symbology (APP-6 / MIL-STD-2525)** for all units and control
  measures on the map.
- **Deterministic core preserved.** New systems draw from the single seeded RNG
  so replays, networked play, and recordings stay reproducible.

## Roadmap

### Near-term

- **Stage 2 — browser UI (hotseat).** Interactive map, NATO-symbol tokens,
  fog-of-war, turn/phase panel, driving this engine.
- **Stage 3 — networked multiplayer** (per-side fog-of-war) and
  **single-player vs AI**. Both already supported by the seed-driven design.
  The AI opponent and backlog item 13 (OPORD mode) are the same engine seam
  seen from two directions: something other than a human emitting the actions.

### Later development iterations (unordered backlog)

Each is intended to be an independent, toggleable module:

1. **Troop morale** — suppression/cohesion states beyond the current neutralise rule.
2. **Individual soldier generator** — named soldiers with attributes/roles.
3. **Echelon scaling** — platoons, companies, battalions, brigade (ties into the
   level-of-control selector and the C2 model).
4. **UAVs & quadcopters** — expand the current fixed-wing/drone assets into a
   fuller aerial-asset system.
5. **Underground infrastructure** — tunnels, bunkers, subterranean movement & detection.
6. **Map generation** — procedural / authored maps and terrain (LOS, cover).
7. **Battle recording & debrief tool** — *recording done*: `game.toRecording()`
   captures the seed and action log, `replayGame()` reconstructs the game
   exactly, and the hotseat UI saves one to a file. The debrief view that steps
   through a recording is still to come.
8. **Leaderboards.**
9. **Leagues.**
10. **Air support** — fixed/rotary CAS missions.
11. **Electronic warfare** — jamming, comms degradation (interacts with C2 & UAV).
12. **Logistics** — ammunition, fuel, resupply, sustainment.
13. **OPORD mode — write the order, watch it executed.** A game mode where the
    player does not manoeuvre pieces at all: they write a **פקודת מבצע** and/or
    draw a plan on the map (axes, objectives, control measures, fire plan), and
    the engine plays it out. Execution is driven by an **LLM with RAG over
    doctrine publications**, so subordinates behave the way the doctrine says a
    force at that echelon behaves, rather than following a hand-written script.

    This is the natural end of the C2 line of work: rules decision 6 gates
    *when* a force may receive orders, and this mode supplies *what* the order
    says and lets the engine interpret it — the persistent standing-orders model
    considered and set aside when C2 was implemented, at OPORD scale.

    **To settle before building** (deliberately not decided here):

    - **Model size and where it runs.** Local small model vs hosted frontier
      model; latency budget per turn; whether every subordinate reasons or only
      the commander does, with the rest resolved mechanically.
    - **Where it attaches to the turn loop.** The engine's action API is already
      the seam — an LLM planner would emit the same `moveUnit` / `fire` /
      `queueIndirectFire` calls a player makes. Likely once per side per
      activation, reading the fog-of-war view that side is entitled to.
    - **Determinism.** An LLM is not reproducible, which collides head-on with
      the seeded core. The action log is the way out: record what the model
      *decided*, not how it decided it, so a recording still replays exactly
      (see `recording.ts`). A recording would then also need the model and
      prompt version stamped on it to be reproducible from the order itself.
    - **The doctrine corpus.** Which publications, how chunked and cited — and
      it has to be material the project may lawfully hold and ship.
    - **Adjudication.** Whether the model may only choose among actions the
      rules already permit (safest — the engine stays the referee), or may also
      argue for outcomes the tables do not cover.
