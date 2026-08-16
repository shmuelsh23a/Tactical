# Tactical Wargame — Rules Engine (משחק מלחמה לפו"ם)

A deterministic, fully-tested **TypeScript rules engine** implementing the
tabletop tactical wargame described in [`Tactical - Mechanics.docx`](Tactical%20-%20Mechanics.docx)
(Hebrew; readable as Markdown at
[`docs/mechanics.he.md`](docs/mechanics.he.md)). Stage 1 — the engine — is
complete; stage 2, the hotseat browser game on top of it, is in progress. Mobile
and networked/single-player modes sit on the same module later.

Working on this repo with Claude Code? Start with [CLAUDE.md](CLAUDE.md), then
[docs/handoff.md](docs/handoff.md) for where the work stands.

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
npm test             # run the test suite (270 tests: engine + app + review)
npm run typecheck    # strict type-check (engine + app)
npm run build:engine # emit the engine as a standalone library -> dist/
```

## Stage 2 — browser UI (hotseat) — in progress

A React + Vite + SVG app in [`src/app/`](src/app) (see **Layout** below) drives
the engine in **hotseat** mode, using **NATO symbols** (via the `milsymbol`
library) for all units. Affiliation is drawn relative to the **viewing** side.

Implemented in the slice: initiative roll, hotseat handoff overlay (hides the
board between players so fog-of-war isn't leaked), **per-side fog-of-war on
what each side has actually detected** (rules decision 12), unit selection with a movement
range ring, range-validated movement with detection, direct fire (small-arms /
MG and tank round) with a combat log, casualty/neutralisation display, **one
fire action per force per fire phase**, a **command group (חפ"ק)** per side that
the player moves (shown with the APP-6 HQ staff), **enforced command & control**
(the פו"ש order interval governs how often a force can be given *new* orders —
see rules decision 6 — with a live readout of distance to the command group,
order frequency, and the turn fresh orders become possible; a force out of
contact goes on with the order it holds, drawn on its own side's map), **orders
that carry a task** — an order is an objective *and* what to do about the enemy
there: advance, advance and engage a named force, hold where you are and engage,
or **hold fire** — enforced against the player's own click, and with an optional
range at which the force springs the ambush by itself; the order the selected force is working to is written out on its card,
and its objective and its target are both drawn on the map, **fixed faction colours** (BLUE always friendly/blue, RED always
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

**Fog-of-war is the document's own detections, not a radius.** The document has
the umpire reflect גילויים onto each player's map, so a side sees the enemy it
has picked up — by the movement table's rolls (70% at a walk, 50% at a run,
within 300 m), by a UAV sweep, or by being shot at — and nothing else. A contact
is drawn **where it was last seen**: a force that has moved since leaves a faded
mark behind, and firing at that mark is resolved against the truth, so it can
turn up out of range.

**A force that holds still is hidden** — looked for in the document's 20 m band
rather than its 300 m one — while a force in position watches its sector every
turn, and better for not being on the move. So the defender sees the attack
coming and the attacker does not see the defence: an ambush. A force can be told
to **camouflage** its position (a step every two turns, up to -50% to be found,
thrown away the moment it moves), and one that stays put long enough **digs in**,
improving its protection every two turns up to the protection of a force behind
cover. Against that, a force can be sent out **scouting** — it looks harder and
walks while it does, and the range ring and the gait control follow it. The
selected force's card reads its posture back: what it is behind, whether it is
hidden, whether it is out scouting, and how far its camouflage and its digging
have got (rules decision 12).

None of that, though, is a decision about *where* to look: scouting sharpens a
force's eyes in every direction at once. So a force can also be given a **sector
of observation** (גזרת תצפית) — an arc drawn on the map, worth a bonus inside it
and -20% outside it. Attention is a fixed budget spread over the arc, so a narrow
sector is worth more where it points (+23% at 60°, +8% at 180°): a narrow one is
a wager that you know the axis of advance, a wide one is insurance against not
knowing. That makes attention a thing a commander allocates and can get wrong —
the squad watching the eastern approach is the squad that does not see the
flanking move (rules decision 14).

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

**טען לתחקיר** loads one back into a **debrief** ([`Debrief.tsx`](src/app/Debrief.tsx)):
step or scrub through the battle action by action, with a narrated timeline you
can click to jump. It can be read through three sets of eyes — **the umpire's**
(both sides, every outcome, the default) or **either side's**, which shows that
side's own forces, the enemy only where it had been detected, and a timeline
with everything it never saw taken out of it: the enemy's orders, its
undetected forces, and the results of shots into ground it could not observe.
What a side *is* shown of its own fire is a report rather than a tally —
`נפגעים בודדים` where the umpire reads `2 נפגעים` — and the live combat log
reads the same way during play.

That makes the review a **teaching instrument**: read the battle blind as the
side fought it, with a **לקחים** panel counting what it never found, how often
it was ambushed by a force it had not seen, and how often it fired at ground it
had no eyes on — then **חשוף את תמונת המנחה** to put the truth beside it, adding
back every step the side never saw and the umpire's version of every report it
was given (rules decision 13).

And **תוכנית או מזל?** re-fights the whole thing 20 times under different dice —
same orders, same shots, same timing — and reports the spread beside what
actually happened, so a plan can be told apart from the luck it ran into.
State at step N is replayed from the seed rather than stored as snapshots, so
what is on screen is what the engine actually does with that recording.

Each step also shows **what it rolled** — hits out of shooters and at what
chance, casualties, dispersion, charges tripped, whether the assault carried.
These outcomes are **derived, never stored**: they come back out of the
resolvers as replay re-applies the decisions, so an outcome cannot disagree
with the engine that just computed it, and the recording stays a log of
intent. Indirect fire is narrated on the step that *resolved* it rather than
the one that marked it, which is where it actually lands.

A saved recording is **sealed** with a state fingerprint per action, and a
loaded one is checked against them. If the rules have moved since it was
recorded, the debrief says so and names the action the battle first diverges
at — the decisions still replay, but what they produce has changed. That
matters here: rules decisions 7 and 10 both altered how an existing number is
applied, which silently rewrites every recording made before them.

Because a battle is now fought almost entirely through orders, a recording of
one contains **no `moveUnit` actions at all** — only the orders and the turns
they were carried out on, with every bound and every shot derived by the replay.
The debrief names the objective on the step that ordered it and reports each
force's bound on the step that executed it.

Engine capability the UI does not reach yet — the next obvious work:

- **An order has no sector, and only one trigger.** `StandingOrder` holds a
  destination, a gait, one named target, and hold-fire with an engagement range
  — a range is the only condition the engine watches for. "Engage anything that
  appears on this axis", "hold fire until the artillery lands", or a fire plan
  tied to the indirect-fire missions would all need the order model widened.
- **Charges cannot be laid during play** — they are placed when a scenario is
  built. Laying them is an engineering action the document does not describe.
- **A force cannot be told where to look.** Scouting raises what a force finds
  everywhere at once; there is no sector, no observation post, and no way to
  watch one approach rather than another.
- **Digging in and camouflage are the only ground a force can improve.** There
  is no terrain to take cover in, so `baseCover` is set by a scenario and
  nothing on the map suggests where cover would be.
- **No terrain**: the map is a bare 900 × 800 m field, and cover is the engine's
  "did not move or fire" flag rather than a feature of the ground.

## Layout

```
src/engine/
  rng.ts            Seedable Mulberry32 PRNG
  intel.ts          What each side has detected, and where it last saw it
  dice.ts           Dice notation (1d8 / Hebrew 1ק8), rolling
  geometry.ts       Distance, range-band lookup, blast radius, LOS through smoke
  types.ts          Units, soldiers, vehicles, mines, smoke, fire missions
  units.ts          Casualty bookkeeping + unit constructors
  upkeep.ts         Bleeding, smoke decay, end-of-turn flag reset
  orders.ts         Standing orders: advance, engage, hold at the objective
  recording.ts      Battle recording: action log -> replayable game
  digest.ts         State fingerprints, for spotting rules drift in a recording
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
    concealment.ts  Observation, digging in and camouflage figures
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
  Debrief.tsx       After-action review: step through a saved recording
  debriefText.ts    Hebrew narration: recorded actions, orders, refusals, extent
  debriefView.ts    What each side may be shown of its own battle (decision 13)
  whatIf.ts         Re-fighting the same decisions under other dice
  hotseat.ts        Activation order, fog-of-war, victory check
  scenario.ts       Demo scenario (BLUE platoon vs RED position + tank)
  symbols.ts        APP-6/2525 SIDC per unit, rendered via milsymbol
  components/       MapView (SVG map + interaction), Handoff, LogPanel

docs/mechanics.he.md    The rules document as Markdown (+ table → code map)
docs/handoff.md         State of play: what is done, what is waiting, what next
docs/balance.md         Every number that was chosen rather than transcribed
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
- Detection on movement, in both directions; UAV/drone footprint detection
- Per-side contacts: what a side has detected, and where it last saw it
- Posture: hidden while stationary, digging in over time, camouflage (with a
  floor at the concealed-charge chance), scouting, and the detection modifiers
  each carries
- Sectors of observation: an arc a force is told to watch, better inside it and
  worse outside
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
- Command & control order intervals by distance (פו"ש), gating *new* orders
- Standing orders: a force keeps to its last order until it is replaced
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
6. ✅ **A force out of contact keeps executing its standing orders**
   (ruled by the author 2026-08-12). Being beyond the פו"ש interval does not
   freeze a force: it goes on doing what it was last told to do until new
   orders can reach it. Distance from the חפ"ק therefore measures how *stale*
   a force's orders are, not whether it may act at all.

   **An order stands until it is replaced.** The engine carries it out every
   turn for every force holding one — being in contact means the player *may*
   rewrite the order, not that the force waits to be told again. Issuing a new
   order is the override, and so is moving the force by hand.

   An order is deliberately small — a destination, a gait, and optionally a
   task: a force to engage, or **hold fire** (אחזקת אש), under which the force
   does not shoot at all, not even at the player's click, until the order is
   replaced. Hold fire is what keeps an ambush an ambush, since firing puts a
   force on the enemy's map (decision 12).

   Hold fire takes an optional **engagement range** — the fire-discipline line
   an ambush is laid on — and that line is a **trigger**: the force opens fire
   by itself the moment an enemy is inside it, on the **nearest** one unless
   the order designates a target, in which case it waits for that one
   (ruled 2026-08-13). With no range given it simply holds, at any range. It
   will not spring on a force its own side has never detected, and it holds
   again if the enemy pulls back out of the line. A tank ambushes with its own
   round. Reaching the objective drops the
   destination, which is what turns "advance" into "hold at the objective".
   The no-move-after-being-hit and half-pace-under-fire rules bite while it
   executes, exactly as they do under the player's hand.
   [`orders.ts`](src/engine/orders.ts), `Game.setStandingOrder` /
   `Game.executeStandingOrders`.

   Two consequences worth knowing. The פו"ש interval still governs *new*
   orders, so a force out of contact keeps marching but cannot be redirected —
   which is the whole point of the rule. And because the interval is measured
   live, a force advancing towards its חפ"ק works its way back into the
   every-turn band under its own orders.

   Unchanged: the command group is never gated, fire is never gated, and the
   interval module switches off with `new Game({ seed, enforceC2: false })` —
   which governs the interval on new orders, not whether a force carries out
   the ones it has.
7. ✅ **Cover cuts the hit chance proportionally, not by percentage points**
   (read from the document 2026-08-12, **confirmed with the author 2026-08-16**).
   The source reads `-50% מסיכויי הפגיעה` — "-50% *of* the hit chance" — and the
   partitive מ־ makes it a proportional cut: full cover halves the shot
   (20% → 10%), partial cover shaves a tenth off it.

   **The document distinguishes the two phrasings itself**, which is what
   settles it. The cover bullets carry the partitive and the definite article
   (`מסיכויי הפגיעה`, "of *the* hit chances"); the movement table's modifier is
   bare (`+30% סיכויי פגיעה לאש אויב`). Same kind of quantity, same document,
   deliberately different wording — so cover is proportional and the movement
   modifiers stay additive.

   The arithmetic agrees. Read as a subtraction of 50 points, full cover would
   zero the entire small-arms table (30/20/10 → 0/0/0) and leave the sustained
   MG live only inside 300 m (70/50/20 → 20/0/0) — an entire weapon class
   switched off by a parenthetical bullet, and the 400 m band unreachable
   against any covered target. Proportionally it stays a real defence without
   being an immunity: 15/10/5 and 35/25/10.

   (The reasoning originally leaned on every stationary force counting as in
   full cover; decision 12 has since made cover something a force digs or starts
   with — and the document's own behavioural condition,
   `לא לנוע ולא לירות בתור הקודם`, is honoured through that machinery: moving
   resets cover at upkeep, and `coverAgainst` downgrades full to partial for a
   force that has fired. The arithmetic above is unchanged either way.) The
   table values stay verbatim (`-0.5` / `-0.1`); only their application changed
   — [`combat/directFire.ts`](src/engine/combat/directFire.ts).
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

12. ✅ **A side sees what it has detected — and a force that holds still is
    hidden** (ruled by the author 2026-08-13). The document is explicit that the
    game is played on separate maps and that
    "גילויי אדום\כחול ישוקפו על מפות השחקנים על ידי המנחה" — the umpire reflects
    *detections* onto each player's map. It gives detection percentages (70% at
    a walk, 50% at a run against a **visible** enemy within 300 m; 30% / 5%
    against a **hidden** one within 20 m) but only as an effect of *moving*, and
    never says what makes a force hidden. The author settled the rest:

    - **A hidden force is a stationary one.** A force that has not moved this
      turn is looked for in the 20 m band, not the 300 m one. That is how an
      ambush works, and it is what a force gives up by moving.
    - **A force in position observes continuously**, at **+10%** — it does not
      need the enemy to walk into it, and it is not distracted by its own
      movement. Run once a turn, on the way into the fire phase, so it sees the
      turn's movement.
    - **A running force is easier to find**; **cover** and **camouflage** make a
      force harder to find.
    - **A stationary force in the open digs in**: nothing for 3 turns, then a
      level of protection every 2 turns, up to the protection of a force that
      was behind cover to begin with. Getting up and moving leaves the hole
      behind. This replaces the old "held still ⇒ in full cover" derivation:
      cover is now something a force has, or earns, not a side effect of a quiet
      turn.
    - **Camouflage is a command** (הסוואה): -10% to be detected every 2 turns,
      up to -50%. A moving force cannot be camouflaged and loses what it had
      banked. A defender may declare a force camouflaged at setup — read here as
      a position prepared before the battle, so it **starts at the full -50%**
      (⚠️ the one part of the camouflage rule that is an interpretation).
    - **Scouting is a command** (סיור): a force that looks rather than covers
      ground detects better and **may only walk** while it does. An order to run
      is walked rather than refused, so a force can be sent out to look without
      rewriting the order it holds.
    - **A camouflaged force has a floor under it**: whatever cover and
      camouflage take off, it is never harder to find than a **concealed
      charge** — the document's own 30% at a walk, 5% at a run, inside 20 m.
      Camouflage can cancel out an observer's advantages; it cannot make a
      squad impossible to find. **A scout beats the floor by its own bonus**
      (40% at a walk), so looking properly remains the answer to a camouflaged
      position rather than being swallowed by the floor.
    - **A contact unobserved for 3 turns is dropped** from the map.
    - **A shot puts both forces on each other's map** — the firer plainly sees
      what it is shooting at, and the target learns where the fire came from.
      Indirect fire gives nothing away: it comes from off the map.
    - **Smoke stops the eye as well as the bullet**: observation runs through
      the same line-of-sight check as fire. The document only says
      "אין ירי לתוך\דרך עשן".
    - **A contact is a report, not a tracker**: it is drawn where the force was
      last seen, so a stale mark can be fired at and turn up out of range.

    The module is a `GameOptions` flag (`trackIntel`, off by default; the
    hotseat turns it on) and is stamped into a recording, so a battle recorded
    without it replays without it and asks the rng for exactly what it asked at
    the time. Contacts live in [`intel.ts`](src/engine/intel.ts), the figures in
    [`data/concealment.ts`](src/engine/data/concealment.ts).

    **Tentative numbers, for the balance pass.** The author gave +10% for
    observing from position, -10%/2 turns to -50% for camouflage, 3 turns to
    start digging and 2 per level, and 3 turns to drop a contact. Two he left
    open, and they are marked `tentative` in the data: how much easier a
    **running** force is to find (**+10%**), how much **cover** hides it
    (**-10%** partial, **-20%** full), and what **scouting** is worth
    (**+10%**). The concealed-charge floor is his answer to the first version of
    this rule, where a fully camouflaged force could not be found by looking at
    all; with the floor, a walking searcher always has the document's 30%
    inside 20 m, and a scout 40%. What camouflage really buys is cancelling out
    the bonuses an ordinary observer brings — but not a scout's.

13. ⚠️ **What a side may be told in its own debrief** (assumed 2026-08-13).
    Reviewing a battle as one side saw it needs a line drawn that the document
    never discusses, because the engine returns ground truth and the review
    must not teach a player what they never observed. The line drawn is:

    - **Its own decisions, always** — orders, postures, fire missions, UAV
      sweeps. The enemy's never: an order is not something you can watch.
    - **The enemy's forces only where it held a contact**, from the same ledger
      the battle was played on (decision 12). A force never detected is absent
      from the review rather than merely unmentioned, and a stale contact is
      drawn where it was last seen.
    - **Being fired on is always known** — you know you are under fire, and
      firing puts the firer on your map anyway.
    - **Your own casualties are always known**; the enemy's only for a force
      you can currently see. So a side that fires on a stale mark is told the
      shot was taken, not what it achieved.
    - ✅ **And what it does learn is a report, not a count** (confirmed with the
      author 2026-08-13: *the umpire has the entire picture, players are
      fuzzier — banding is good, it should be a learning tool*). A force is told
      how many of its own men fired and at what chance — its own business — and
      then what its fire appeared to do: `ללא נפגעים שנצפו`, `נפגעים בודדים`,
      `מספר נפגעים`, `אבידות כבדות`. An enemy force that goes down reads as
      `נראה מנוטרל` rather than as a fact. Own losses stay exact; the umpire's
      view is unchanged, which is where the tally lives. The **bands are ⚠️
      chosen** (0 / 1–2 / 3–5 / 6+) and are the thing to tune.

      Because the point is to teach, the per-side review is meant to be read
      **blind first**: the side's own picture, its own reports, and its own
      lessons — how many enemy forces it never found, how often it was fired on
      by one of them, how often it fired at ground it had no eyes on. Then
      **חשוף את תמונת המנחה** puts the truth beside it: the steps it never saw
      are added to the timeline, marked as such, and each report it was given
      gets the umpire's line under it.
    - **A stale contact carries the state it was last seen in**, not the force's
      current one — a squad neutralised after it dropped out of sight still
      reads as a live mark until somebody looks again.
    - **The turn structure is common to the table** — turns, phases and
      initiative are the umpire's bookkeeping, not intelligence.

    The umpire's view is unchanged and remains the default. A recording made
    without the knowledge model has no per-side picture to show, and the
    viewpoint buttons are disabled for it.

14. ✅ **A force can be told where to look, and pays for it elsewhere**
    (גזרת תצפית — confirmed with the author 2026-08-16, shape *and* figures).
    The document has **no sector rule at
    all**, so all of this is invented. What forced it: decision 12 makes a force
    better or worse at looking, but never makes looking a *choice*. Scouting in
    particular raises detection in every direction at once, which is not what a
    commander assigns — he gives a force a frontage and accepts that its flank
    is thinner. The reading:

    - **A sector is an arc, not a bearing** — a bearing and a width, because a
      squad watches a frontage. The hotseat offers **60° / 90° / 180°**, and 90°
      is the default.
    - **It cuts both ways**: a bonus inside the arc, **-20%** outside it,
      whatever its width.
    - ✅ **Attention is a fixed budget spread over the arc** (confirmed with the
      author 2026-08-16). The bonus inside a sector is **13.5 ÷ its width in
      degrees**, so:

      | גזרה | בתוכה | מחוצה לה |
      |---|---|---|
      | 60° | **+23%** | -20% |
      | 90° | **+15%** | -20% |
      | 180° | **+8%** | -20% |

      The first version of this rule paid a **flat** +15% at any width, which
      made width a trap: widening only ever converted a penalised direction into
      a bonused one, so 180° strictly dominated 60° and the control existed only
      to punish the player for touching it. Dividing the bonus by the width is
      what makes the three a real choice — a narrow arc is a sharp wager that
      you know the axis of advance, a wide one is cheap insurance against not
      knowing, and releasing the sector is the neutral bet that beats a wide arc
      pointed the wrong way. A sector is capped at **+30%** however thin it is
      drawn, and a **360° arc is worth nothing at all**: watching everything is
      not watching anything in particular, and it must not be a way to collect
      the bonus with no ground left outside to pay the penalty.
    - **A force with no sector watches all round** at exactly the plain figures,
      so a game that never assigns one plays as it did before. This is what
      makes the module additive rather than a rewrite of decision 12.
    - **The bearing is absolute, not relative to the force.** A squad told to
      watch the eastern approach is still watching east after it has displaced;
      re-pointing it is a fresh decision, taken deliberately.
    - **It raises the concealed-charge floor, and never lowers it.** The floor
      is the *observer's*, so a force watching the right sector beats it by its
      bonus, exactly as a scout does. A force facing the wrong way is **held at
      the plain floor** rather than pushed under it: the floor is the thing
      camouflage cannot take away, and where a force is looking is not
      camouflage's doing. Letting the penalty through would put a *running*
      observer's floor (5%) at a flat zero and make a camouflaged force literally
      impossible to find — which decision 12 forbids in so many words.
    - **A sector never changes how far a force sees.** The 300 m / 20 m bands
      are the document's and are untouched; a sector only says how well the
      force is attending to what is inside them.
    - **Where a force is looking is its own business.** The sector goes in the
      recording as a decision like any other, and the per-side debrief shows it
      to its owner only (decision 13) — an arc is not something the enemy can
      watch being drawn.

    Both the **shape** (bonus scaled by width, penalty flat) and the **sizes**
    (the 13.5 budget, the -20% penalty, the +30% cap) are the author's, settled
    2026-08-16. Unlike decision 12's figures, none of them is on the balance
    list awaiting a verdict — the reasoning is above and in
    [`data/concealment.ts`](src/engine/data/concealment.ts) so a future change
    is a decision to revisit rather than a number to discover.
    [`Game.setObservationSector` / `Game.watchTowards`](src/engine/game.ts),
    `sectorBonus` in [`data/concealment.ts`](src/engine/data/concealment.ts) and
    `sectorFocus` in [`combat/detection.ts`](src/engine/combat/detection.ts).

Still modelled by reasonable assumption (flag if you want them changed):

- **Small-arms band edges** (`299-100`, `400-300`) encoded as ≤100 / ≤299 / ≤400.
- **Target-movement modifiers** (`+30%` / `-20%` from the movement table) kept
  **additive**. This is the other half of decision 7 rather than a separate
  assumption: what the author confirmed on 2026-08-16 is that the partitive מ־
  is doing real work, and the movement table is phrased *without* it
  (`+30% סיכויי פגיעה`, bare). So cover is proportional and these are additive,
  and they stay in range read that way (30% → 60% against a walking target).
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
7. ✅ **Battle recording & debrief tool** — `game.toRecording()` captures the
   seed and action log, `replayGame()` reconstructs the game exactly (whole or
   to any prefix), `replayWithOutcomes()` also hands back what each action
   rolled, and the hotseat UI saves a recording to a file and loads one back
   into a step-through debrief.

   Because outcomes are derived rather than stored, the recording holds the
   **decisions** — so the same battle can be re-fought under other dice without
   anyone playing it again. **תוכנית או מזל?** in the debrief does exactly that:
   20 alternate histories from the same orders, shots and timing, reported as a
   spread ("BLUE נפגעים 0–1, חציון 0, בפועל 0 · נשבר ב-0 מתוך 20"). That is the
   question a debrief exists to answer.

   The alternate battles drift, so a decision one of them has made impossible —
   a bound now out of budget because the force was slowed, a shot at a force
   already gone — is **skipped rather than fatal**, and the count of skipped
   decisions is reported with the spread: a run that dropped half the plan is
   not the same plan, and the reader has to be able to see that
   ([`whatIf.ts`](src/app/whatIf.ts), `replayWithOutcomes({ seed, skipRejected })`).
   Seeds follow the recording's own, so the same battle always re-rolls the same
   way.

   The debrief reads through the umpire's eyes or either side's, and a side's
   view is banded rather than counted, so it can be read as a lesson before the
   truth is revealed (decisions 12 and 13).

   `sealRecording()` stamps a state fingerprint per action and
   `verifyRecording()` checks a replay against them, so a recording made under
   older rules is flagged rather than silently reinterpreted.
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

14. ✅ **Per-side debrief** — the debrief reads through the umpire's eyes or
    either side's. A side sees its own forces, the enemy only where it held a
    contact (drawn where it was last seen), and a timeline with the enemy's
    decisions and its own unobserved results taken out — rules decision 13
    draws that line, and [`debriefView.ts`](src/app/debriefView.ts) enforces it.

    The knowledge is **replayed, not stored**, exactly like every other outcome:
    one pass over the recording rebuilds the contact ledger per step (rules
    decision 12), so what a side is shown cannot disagree with what the engine
    gave it during the battle. What is still missing is a side's *own* estimate
    of what it achieved — it is told the casualties it caused to a force it can
    see, which is ground truth rather than a report from the field.

    Rules decision 12 is the start of this: the engine now keeps a contact
    ledger per side, so "what BLUE knew at action 40" is already replayable.
    What is missing is the rest of the picture — what a side learned from a
    shot it fired (how many casualties it actually caused), and a debrief view
    that reads the ledger instead of the truth.
