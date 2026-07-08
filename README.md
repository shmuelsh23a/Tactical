# Tactical Wargame — Rules Engine (משחק מלחמה לפו"ם)

A deterministic, fully-tested **TypeScript rules engine** implementing the
tabletop tactical wargame described in `משחק מלחמה לפום.docx`. This is stage 1
of the project: a pure engine with no UI. The browser game (and, later, mobile
and networked/single-player modes) will sit on top of this module.

## Why it's built this way

- **Pure TypeScript, no runtime deps** — the same engine powers the browser
  game now and the mobile app later.
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
npm test             # run the engine test suite (65 tests)
npm run typecheck    # strict type-check (engine + app)
npm run build:engine # emit the engine as a standalone library -> dist/
```

## Stage 2 — browser UI (hotseat) — in progress

A React + Vite + SVG app in [`src/app/`](src/app) drives the engine in
**hotseat** mode, using **NATO symbols** (via the `milsymbol` library) for all
units.

- `src/app/scenario.ts` — demo scenario (BLUE platoon vs RED position + tank)
- `src/app/symbols.ts` — builds an APP-6/2525 SIDC per unit (affiliation is
  relative to the **viewing** side) and renders the NATO symbol
- `src/app/hotseat.ts` — turn activations, fog-of-war, victory check
- `src/app/components/` — `MapView` (SVG map, tokens, move/fire interaction),
  `Handoff` (device-handoff overlay), `LogPanel`
- `src/app/App.tsx` — controller: 7-phase turn loop, initiative, per-side
  activations, selection, movement (range-capped), direct fire, combat log

Implemented in the slice: initiative roll, hotseat handoff overlay (hides the
board between players so fog-of-war isn't leaked), per-side fog-of-war (an enemy
is shown once a friendly unit is within 300 m), unit selection with a movement
range ring, range-validated movement with detection, direct fire (small-arms /
MG and tank round) with a combat log, casualty/neutralisation display, **one
fire action per force per fire phase**, a **command group (חפ"ק)** per side that
the player moves (shown with the APP-6 HQ staff) and a live **C2 readout**
(distance to the command group → order interval from the פו"ש table), and
**fixed faction colours** (BLUE always friendly/blue, RED always hostile/red,
regardless of whose turn it is).

## Layout

```
src/engine/
  rng.ts            Seedable Mulberry32 PRNG
  dice.ts           Dice notation (1d8 / Hebrew 1ק8), rolling
  geometry.ts       Distance, range-band lookup, blast radius
  types.ts          Units, soldiers, vehicles, mines, smoke, fire missions
  units.ts          Casualty bookkeeping + unit constructors
  upkeep.ts         Bleeding, smoke decay, end-of-turn flag reset
  game.ts           Game class: 7-phase turn loop, C2 gating, action API
  index.ts          Public API barrel
  data/
    movement.ts     Normal/run gaits, detection %, enemy-hit modifiers
    directFire.ts   Small-arms & sustained-MG range bands, cover modifiers
    explosives.ts   RPG, mortar, artillery, tank, mines, ATGM
    smoke.ts        Smoke durations by source
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
```

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
  round, AP/AT mines, ATGM (vs infantry / vs armour)
- Artillery dispersion (short/long, left/right; launcher & UAV scaling)
- Smoke screens with per-source duration
- Assault (assault fire + grenades, self-hit)
- Armour damage table (location → penetration → crew/component/critical effect)
- Casualties: nq"p accumulation, 5-pt bleeding (1d4 / 5 turns), 8-pt neutralise,
  50%-attrition force neutralisation
- Command & control order intervals by distance (פו"ש)

## Rules decisions

Resolved with the author (2026-05-29):

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

Still modelled by reasonable assumption (flag if you want them changed):

- **Small-arms band edges** (`299-100`, `400-300`) encoded as ≤100 / ≤299 / ≤400.
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
7. **Battle recording & debrief tool** — capture a game (seed + action log) for
   replay and after-action review.
8. **Leaderboards.**
9. **Leagues.**
10. **Air support** — fixed/rotary CAS missions.
11. **Electronic warfare** — jamming, comms degradation (interacts with C2 & UAV).
12. **Logistics** — ammunition, fuel, resupply, sustainment.
