# Tactical Wargame — Rules Engine (משחק מלחמה לפו"ם)

A deterministic, fully-tested **TypeScript rules engine** implementing the
tabletop tactical wargame described in [`Tactical - Mechanics.docx`](Tactical%20-%20Mechanics.docx)
(Hebrew; readable as Markdown at
[`docs/mechanics.he.md`](docs/mechanics.he.md)). Stage 1 — the engine — is
complete; stage 2, the hotseat browser game on top of it, is in progress. The
browser is the **development shell**, not the destination: mobile, desktop and
networked/single-player modes sit on the same module later (stages 3 and 4).

Working on this repo with an AI assistant? Start with [AGENTS.md](AGENTS.md), then
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
npm run check        # lint + typecheck + suite (284 tests) — the one to run
npm test             # the suite alone
npm run typecheck    # strict type-check alone (engine + app)
npm run lint         # the architectural rules alone (eslint.config.js)
npm run build:engine # emit the engine as a standalone library -> dist/
npm run validate     # the game's numbers measured against the sources -> docs/validation.md
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
hostile/red, regardless of whose turn it is), **mission planning** before the
first turn — each side in turn, behind the handoff screen, registers targets,
puts out observation posts and prepares alternate positions, all drawn on its
own map only (rules decision 38) — and a **targeting phase**: a side whose
echelon may call mortars or artillery (decision 37) **calls for fire** — one
call and one smoke screen a side a turn (decision 8), and one mission in hand
a weapon — with its missions left, a fuze (impact or air burst) and a
**check fire** (decisions 31 and 34). The engine adjusts a mission onto the mark and fires it for
effect; a marked aim point is drawn only on its owner's map, with the turn it
will land, and the combat log reports the miss distance and every casualty. Smoke comes from any of
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

**More than one battle, and somewhere to choose between them.** The app opens
on a **scenario picker**: every battle by its Hebrew title, its brief and the
size of its ground, and `?scenario=<slug>` goes straight into one. Two are in:
**יקנעם עילית**, where the shoulder hides the attack's opening and the dead
ground is nearer than it looks, and **תל עזקה**, where the covered route up the
tel is the slow one and the comfortable ridge is in view of the summit for its
whole length. The brief says only who attacks and who holds, and where — both
players read it before either has taken a side, so what the ground teaches is
left for the ground to teach. Both are generated from specs, and each module
exports its own listing, so the card the player picks by and the title on the
header are one string. **החלף תרחיש** goes back to the picker, and once the
first turn has started it asks for a second click, because the battle in
progress is discarded — save it with **שמור הקלטה** first. A saved battle can
also be opened for review straight from the picker.

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
- **A force cannot be told to lay a charge as part of an order.** It can lay
  one — `layCharge`, rules decision 16, with a control in the movement panel —
  but the work is a decision taken force by force each time, not something a
  standing order can carry.
- **The reach is drawn, not the ring.** The selected force's movement range
  is the true shape of its bound over the ground (rules decision 15): the
  flat circle where the ground is flat, less where it climbs, and for a
  vehicle nothing past the grade it refuses. Advisory — the engine still
  judges each bound — so a click just outside it can still be refused with
  the cost in the log.
- **Roads are drawn, and nothing more.** The streets, Route 6 and the tracks
  are on the map from OpenStreetMap, as a line layer the recording carries and
  no rule reads: no height, no cover, no movement bonus. A road as *going* —
  faster along it, a vehicle confined to it — is a rules question the
  document does not raise; ask before building it.

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
  Root.tsx          Which battle: the scenario picker, or the game (?scenario=)
  scenario.ts       The battles the picker offers, and the demo by name
  scenarios/        Generated battles (tools/make-scenario.py), one per spec
  symbols.ts        APP-6/2525 SIDC per unit, rendered via milsymbol
  components/       MapView (SVG map + interaction), Handoff, LogPanel, ScenarioPicker

docs/mechanics.he.md    The rules document as Markdown (+ table → code map)
docs/handoff.md         State of play: what is waiting, what next (current only)
docs/review-checklist.md What to check before committing — any reviewer, any make
docs/driving-the-game.md Scripting the browser to verify a change for real
docs/handoff-archive.md What past sessions built, and why decisions went as they did
docs/balance.md         Every number that was chosen rather than transcribed
tools/dump-docx.py      Raw .docx extraction, to re-verify that transcription

AGENTS.md               Operating manual for any AI assistant (CLAUDE.md points here)
eslint.config.js        The architectural rules: determinism, layering, the barrel
src/invariants.test.ts  The rules a selector states badly, and the guards' guard
.nvmrc                  Node 24 — read by version managers and by CI
.github/workflows/ci.yml  Runs `npm run check` on every push and pull request
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
- Real ground: elevation from a public DTM and objects on it (buildings,
  walls, trees) — one line-of-sight test for seeing and shooting, eye height by
  posture, cover from the object a force stands in or against, and Naismith's
  climb cost on every bound
- Command & control order intervals by distance (פו"ש), gating *new* orders
- Standing orders: a force keeps to its last order until it is replaced
- Battle recording: a game replays exactly from its seed and action log

- Covering fire (חיפוי): a force holds its action to answer the first enemy it
  sees move, fire or assault (rules decision 18)
- Blast, the tank gun and rates of fire from published data, calibrated so
  explosives cause 75% of losses where fire support is used (rules decisions
  41–43), with the document's tables kept as a per-game option; a turn is 60 s
  (decision 40)
- Morale and suppression — **not from the document**, which has none: traits,
  a pool of will, leaders, tests, rallies, routs, surrender and a side that
  breaks (rules decision 19, a module like the others)

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
8. ✅ **Indirect fire is an off-map asset, one mission per side per turn — at
   this echelon** (ruled by the author 2026-08-16). The document gives rates of
   fire per barrel (3 bombs for a mortar, 2 shells for artillery) but the game
   has no battery piece to own them, so the hotseat UI allows each side one fire
   mission and one smoke screen per turn. This is a UI limit over an engine that
   already models `roundsPerTurn`.

   **This is scoped, not provisional.** The playable slice is the
   platoon-leader view, and a platoon commander does not own a battery — he
   *calls for* fire from something that is not on his map. So an off-map asset
   is the right model here, and it stops being right at **battalion and above**,
   where the artillery belongs to the force the player commands. The battery
   therefore becomes a real unit as part of **echelon scaling** (backlog 3) and
   not before: it is a consequence of the level of control, which is why it
   should not be built ahead of it.

   What that later unit inherits: the rates of fire are already in the data and
   already applied per barrel, so a battery is a piece to own them and a
   position to be counter-batteried at, rather than a new fire model.
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
10. ✅ **A charge is triggered by the path walked, within 10 m — and only a
    walking force searches that path** (radius assumed 2026-08-12, the whole
    rule **confirmed with the author 2026-08-16**). The document gives the
    trigger as `דריכה` — stepping on it — with a 50% activation roll, but no
    distance, and a token here is a squad spread over some frontage rather than
    one man. So:
    - the **whole bound** is tested, not just where it ends, or a 100 m rush
      would vault a minefield;
    - **10 m** is the trigger radius — half the 20 m at which a charge can be
      *spotted*, so there is ground where a charge is found without ever being
      trodden on ([`combat/mines.ts`](src/engine/combat/mines.ts));
    - **a walking force searches the ground it crossed**; a running one gets no
      look on the way, and its 5% applies only around where the bound ends
      (`sweepsGroundCrossed`);
    - a charge already **found is stepped around**;
    - a charge that fires is **spent**; one that fails its activation roll stays
      armed for the next force through;
    - **no force triggers its own side's charges.**

    **The sweep is the half that was missing, and it was a real bug.** Charges
    were triggered along the whole path while the search was rolled from the
    *endpoint alone*, so the two were measured off different geometry. A charge
    5 m off the route, halfway along a 50 m walk, was inside the trigger
    corridor and 25 m from where the bound ended: over 200 seeds it went off 200
    times and was found 0 times. The document's own 30%-walking / 5%-running
    split — which sits in the **movement** table, as an effect of moving — was
    therefore doing almost nothing on a mined approach, which is precisely the
    decision it exists to price. Sweeping the walked path at 30% makes the gait
    the gamble the document implies: walk and you may find what you are about to
    tread on, run and you will not.

    Until this, `activationChance` sat in the data and nothing read it — charges
    could be found but never went off.

    **The sweep covers a hidden enemy too, not only charges** (ruled 2026-08-16).
    The document names all three in one clause —
    `30% מציאת מטענים\פירים\אויב חבוי בטווח של עד 20 מ'` — so it is one rule.
    The same measurement applies: a stationary RED squad 15 m to the side of a
    50 m walk was found **0 times in 400** when the search came off the endpoint,
    against ~26% for the identical squad beside the halt. A force could walk
    within 15 m of a prepared position and never roll for it. The 300 m
    *visible* band never had the problem — it already dwarfs any bound — so the
    sweep barely touches it.

    **Only the range is swept.** The chance and the line of sight are still
    judged from where the bound finished, so a force's gait, its sector
    (decision 14) and what it can see through are all read off one position
    rather than varying along the path.

    **This does not undo the ambush** (decision 12), which is the thing to check
    when widening what an attacker may find. A defender that holds still
    observes *continuously* at **300 m** and picks the attacker up several
    bounds before the attacker is within 20 m to sweep it — and camouflage still
    holds the attacker's chance down to the concealed-charge floor. The sweep
    says *where* a force looks, not how well. There is a test for exactly this.
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
    - **A force that prepared its position before the battle starts dug in**
      (✅ author, 2026-09-16). `baseCover` is in effect from placement, not from
      the first upkeep, so a prepared defender is in its position for turn 1's
      exchange of fire rather than standing in the open through it. This is the
      other half of the camouflage rule below — a defender who prepared is
      already at the full -50% to be detected, and now has the protection to
      match it from the same moment.

      Latent until 2026-09-16: `addUnit` raised a force's cover from the
      ground's objects at once but left `baseCover` to `endTurnUnitUpkeep`,
      and nothing in the repo set `baseCover` at setup, so nothing noticed
      until the Tel Azeka scenario did.

      **…and leaves it behind when it walks away** (✅ author, 2026-09-16).
      Moving clears `baseCover` exactly as it clears the digging and the
      camouflage: a prepared position is ground a force made ready, not a
      property it carries. Before this a prepared defender that displaced took
      its cover with it and was safer on the move than a force that had never
      dug at all. What it does still get is whatever the *ground* offers where
      it stops — the object it now stands against is the map's, not its own
      work — which is what keeps "moving falls back to the ground, not to
      nothing" true.

      **Cover is read at the end of the turn, not on arrival** (✅ author,
      2026-09-16). A force that moves into a building is behind it from the
      next turn, not from the moment it arrives, and one that leaves is in the
      open from the next turn. Confirmed as correct rather than changed. It
      would need revisiting if **covering fire** (חיפוי) were ever built — see
      the gap list — since a force shot at mid-bound would be resolved against
      the cover it had where it started.

      **Dress a force for setup with `baseCover`, never with `cover`.**
      Placement *raises* `cover`; upkeep *recomputes* it from `baseCover`, the
      ground and the digging. A force handed a `cover` directly therefore holds
      it for turn 1 and loses it at the first upkeep — the same shape as the
      bug above, one field over.
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

13. ✅ **What a side may be told in its own debrief** (drawn 2026-08-13,
    **confirmed with the author 2026-08-16**). Reviewing a battle as one side
    saw it needs a line drawn that the document never discusses, because the
    engine returns ground truth and the review must not teach a player what they
    never observed. The line drawn is:

    - **Its own decisions, always** — orders, postures, fire missions, UAV
      sweeps. The enemy's never: an order is not something you can watch.
    - **The enemy's forces only where it held a contact**, from the same ledger
      the battle was played on (decision 12). A force never detected is absent
      from the review rather than merely unmentioned, and a stale contact is
      drawn where it was last seen.
    - **Being fired on is always known** — you know you are under fire, and
      firing puts the firer on your map anyway.
    - **Your own casualties are always known**; the enemy's only for a force
      you can currently see.
    - **The dividing line is observation, not ownership of the shot** (settled
      2026-08-16). A side fires on a stale mark and is told **how many of its
      own men fired and at what chance** — that is its own business, and the
      same clause that grants it for an observed shot grants it here — followed
      by `ללא תצפית על המטרה` and not one word about what it found. Previously
      the whole outcome line was suppressed, which contradicted the ✅ rule
      below: a force that ordered fire and watched its own men shoot knows that
      much. Only the *effect* was ever meant to depend on watching.
    - ✅ **And what it does learn is a report, not a count** (confirmed with the
      author 2026-08-13: *the umpire has the entire picture, players are
      fuzzier — banding is good, it should be a learning tool*). A force is told
      how many of its own men fired and at what chance — its own business — and
      then what its fire appeared to do: `ללא נפגעים שנצפו`, `נפגעים בודדים`,
      `מספר נפגעים`, `אבידות כבדות`. An enemy force that goes down reads as
      `נראה מנוטרל` rather than as a fact. Own losses stay exact; the umpire's
      view is unchanged, which is where the tally lives. The **cut-points are
      still ours** (0 / 1–2 / 3–5 / 6+) — the author confirmed that reports
      should be banded, not where the bands fall — so they sit on the balance
      list with the other chosen numbers rather than as an open rules question.

      Because the point is to teach, the per-side review is meant to be read
      **blind first**: the side's own picture, its own reports, and the lessons
      drawn from **what it actually experienced** — how often it was fired on by
      a force it had never found, how often it fired at ground it had no eyes
      on, and what those failures cost it. Then **חשוף את תמונת המנחה** puts the
      truth beside it: the steps it never saw are added to the timeline, marked
      as such, and each report it was given gets the umpire's line under it.

      **The לקחים panel holds that line too** (settled 2026-08-16). *How many
      enemy forces were never identified* now waits for the reveal, alongside
      their names and the casualties-inflicted tally. A bare count is still the
      umpire's knowledge: it answers the question the blind read exists to pose,
      and — since a side knows what it *did* detect — it hands over the enemy's
      order of battle for free. What survives the blind read is only what the
      side lived through.
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

15. ✅ **The map is real ground: elevation and objects, one line of sight**
    (settled with the author 2026-09-06 — shape ✅, every number tentative).
    The document has **no terrain table at all**: it plays on a real map
    (מפה, תצ"ל) and leaves the ground to the umpire. A first proposal of
    *terrain types* — wood, built-up, each with a cover grade, a sight rule and
    a movement cost — was withdrawn on his steer: the game is to scale from a
    squad to a brigade with metre-level resolution underneath, so the map
    carries **objects** (a building, a wall, a tree) rather than types, and the
    thing to resolve is **elevation**.

    - **One height function.** A heightfield of real ground elevations, plus
      objects as footprints with a height on top of it. Line of sight is one
      test over that: sample the profile from the observer's eye to the
      target's silhouette and block where ground or object rises above it.
      Smoke stays a second blocker on the same predicate. Scales as he wants —
      a brigade map is the same grid sampled coarser.
    - **Sight is binary and symmetric** (✅, to be tweaked at balance). A
      crest hides a force and blinds it equally, so reverse slope versus crest
      is the player's dial with no invented number behind it. No hull-down or
      partial-defilade state.
    - **Eye height follows posture** (✅ figures, tentative): infantry
      **1.5 m**, a vehicle **2.5 m**, a force in full cover **0.5 m**. The same
      figure serves both ends of a line, so digging in now has a cost it
      lacked: a lower silhouette is harder to see over a rise, and sees less
      over it.
    - **Cover comes from objects, not from height** (✅ grades, tentative): in
      or against a **building, full**; at a **wall or a tree, partial** — read
      within **3 m** of the footprint, ours. It goes in as the ground's own
      cover under the prepared position and the digging (rules decision 12),
      so a force in a building is where a force behind cover has always been.
    - **A force looks out of its own cover, not at it.** The faces of the
      object a force is in or against — within the same 3 m that gives it
      cover — are left off its sight lines for the first **6 m**: both faces of
      the wall it lies behind, never the far wall of the building it stands
      against, so a house still hides what is against it from the other side.
      Found the hard way: a squad lying behind a chest-high terrace wall on a
      forward slope was blinded by its own wall the moment it looked downhill;
      the first fix skipped the whole object and let a force be seen straight
      through a building. The two halves share one reach for that reason.
      Known gap: two forces both *inside* one large footprint — a wood from
      OpenStreetMap — see each other at any distance, since a line wholly
      inside a polygon crosses no face of it. A wood as a real terrain type
      is the terrain-types proposal the author withdrew; leave it until it
      matters in play.
    - **Cover and eye height are one posture.** A force that fired from full
      cover stood up to do it: it is partial to the shot back (decision 7) and
      stands 1.5 m on the sight line, from one function (`effectiveCover`).
    - **Climbing costs the bound — Naismith** (✅ author 2026-09-06, figures
      tentative). Every metre climbed costs **8 m** of the gait's budget,
      descent is free, and a **vehicle refuses a grade over 30°, up or
      down**. A standing
      order climbs as far as the budget reaches and carries on next turn. This
      is what makes the high ground cost what it is worth: a crest buys sight
      lines and is paid for in bounds, where before it was free to take. On
      flat ground the budget is the distance, exactly as before.
    - **No elevation bonus to hit or to detect** (✅ author 2026-09-06, "no
      hit modifier for now"). The document has none, and the sight lines
      already reward the high ground. To be looked at again at balance.
    - **The ground is real, and so is what stands on it.** The demo plays on
      the southern edge of Yokneam Illit on Ramat Menashe, 900 × 800 m centred
      on 32.645 N 35.085 E: the relief cut from public terrain tiles by
      `tools/fetch-dtm.py`, the town's 249 houses, its two woods and its
      roads from OpenStreetMap by `tools/fetch-osm.py`. Nothing on the map is
      invented. Roads are drawn only — decoration the recording carries and
      no rule reads.
      A recording carries the ground, and a game built without one plays flat
      and empty, exactly as before.

    Figures: [`data/terrain.ts`](src/engine/data/terrain.ts). Mechanism:
    [`terrain.ts`](src/engine/terrain.ts), `Game.hasLineOfSight` now taking
    the two forces. Drawn by [`Relief.tsx`](src/app/components/Relief.tsx).

16. ✅ **Charges are laid in setup, or laid in play at a cost in turns**
    (ruled by the author 2026-09-16). The document describes charges only as
    something already on the ground and never mentions engineering work during
    a battle. The ruling has two halves:

    - **The defender lays his minefields and IEDs during the setup phase.**
      That is what `addMine` now is — it refuses once the first turn has begun,
      so a charge cannot appear behind the enemy in mid-battle by a call the
      player was never charged for.
    - **An insurgent or a special force may lay a charge during play, and it
      takes 2 turns** (tentative, like every figure — on
      [balance.md](docs/balance.md)). `Game.layCharge(unitId, type)` sets the
      work going in the movement phase; the charge goes into the ground armed
      and undetected at the end of the second turn, where the work was begun.

    **Selection of force types is deliberately not built.** The author's word:
    it arrives with **echelon scaling** (backlog 3). Until then the capability
    is a flag on the force — `canLayCharges` — that a scenario sets, and only a
    force carrying it gets the control at all.

    ✅ **What the two turns cost** (confirmed by the author 2026-09-16, from
    our proposal). The force must spend them doing nothing else: a turn in which it moves, fires, **is hit**
    or is neutralised loses the work outright rather than banking it, and
    starting the work replaces the order the force was holding. That is the
    whole tradeoff — the charge is bought with two turns of a force that
    neither manoeuvres nor shoots, and an enemy who finds the layer can take it
    away by hitting him.

    Note **hit**, not *fired on*: nothing in the engine marks a force that was
    shot at and missed, so a force under ineffective fire goes on working. The
    alternative would need a new flag set on a miss, which would change what
    `underFire` means for movement as well.

    **Nothing limits how many charges a force lays — deliberately, for now.**
    There is no stock and no cooldown: a force that survives two quiet turns
    may start again the next. For a force that would sit still anyway — the
    demo's camouflaged hold-fire ambusher is exactly one — the two turns cost
    it nothing it was going to spend, so laying charges all battle is never
    worse than not. Put to the author 2026-09-16 and **deferred to
    logistics/ammunition (backlog 12)** at his word: a stock of charges per
    force is the same mechanism as rounds per force, and inventing a separate
    one here would be a limit to unpick later. Do not add one before then.

    **The live log now says where, too.** This decision originally left the
    charge's position off the live log line, because every entry in that log
    was readable from both sides of the table — a patch on one line rather than
    a fix. Decision 17 filtered the log by side, so the reason is gone and the
    line says what the debrief has always been allowed to say.

    ✅ **The charge is laid where the force stands** (confirmed 2026-09-16),
    not at a point it chooses within reach. Nothing in the document gives a
    reach, and the charge's own trigger radius (10 m, decision 10) already
    covers a squad's frontage.

    One rule, one owner: the work is judged at the end of the turn from the
    per-turn flags the force finished with (`progressChargeLaying` in
    [`game.ts`](src/engine/game.ts)), rather than being cancelled at each of
    the places a force might do something else — the two-halves trap this
    repo keeps paying for. Figures:
    [`data/engineering.ts`](src/engine/data/engineering.ts).

17. ✅ **What the live hotseat log may show each side** (drawn 2026-09-16,
    **confirmed with the author the same day**). The live combat log was the
    last place in the game that did not filter by side. Both players read one
    list on one screen across a handoff — the handoff screen covers the map,
    not the sidebar — and an entry's `side` was a colour chip, never a filter.
    So RED's detections, its postures, its orders and its fire plan were all
    readable on BLUE's screen, and were readable *before* the incoming player
    had even pressed "ready".

    The debrief had drawn this line properly since decision 13; the live log
    now draws the same one, in three cases that mirror
    [`debriefView.ts`](src/app/debriefView.ts):

    - **The umpire's bookkeeping goes to the table** — turn, phase, initiative,
      victory, and the operator's own recording controls. Turns and phases are
      not intelligence (decision 13), and so are the things on the map anybody
      can look at: a smoke screen coming down, a round landing.
    - **A decision taken behind one's own lines is that side's alone** — orders
      and the refusals that answer them, postures (camouflage, scouting, sector
      of observation), charge-laying work, fire missions and smoke *as marked*,
      what a force picked up (`איתר`, `גילוי`, charges found), and every engine
      error the player's own click produced. An order is not something the
      enemy can watch being given.
    - **An exchange both sides were in crosses, worded once per reader** —
      direct fire, an assault, an engagement fired under a standing order, a
      charge going off. Being fired on is always known (decision 13), and
      firing puts the firer on the target's map anyway (decision 12). The line
      still flies the *acting* side's colour on both screens.

      **But the two readers are told different things, not merely in tone.**
      How many men fired and at what chance is the firer's own business
      (decision 13) — and `shooters` is the force's *exact fit strength*, so
      printing it at the target would hand over, every turn it is shot at, the
      very state the casualty bands exist to hide. The target is told what
      landed on its own men instead. The same split governs an assault: grenades
      **thrown** are the attacker's ammunition state, grenades that **hit** are
      the defender's to count, and what a force did to itself with its own
      grenades is nobody else's business.

      **A shot has three readers, not two** — and the debrief was reading it
      with two. `exact` there means "the reader owns the target", which is true
      of the umpire *and* of the force being shot at, so one flag could not
      separate *entitled to the whole picture* from *entitled to count its own
      dead*: the side under fire was reading the firer's exact strength, its hit
      chance and the damage it took. `Lens.side` is now **required** (`null` is
      the umpire) so that a lens has to say which it is — a lens that could
      leave it out would default to the umpire, the omission-defaults-to-visible
      trap the `RecordedAction` switches exist to prevent. The same applies to
      `describeExecution`, which is the path **most** fire in this game takes: a
      hotseat battle journals *orders*, not shots.

    **Nobody owns the screen until a player claims it.** `viewingSide` follows
    the *incoming* activation, but the handoff screen exists precisely because
    the device is still in the **outgoing** player's hands — so filtering the
    log to `viewingSide` there would have shown him the next side's private
    log, the same hole mirrored. During a handoff and on the initiative panel
    the log shows only what belongs to the table.

    Three consequences worth stating, since each was a question in its own
    right:

    - ✅ **Movement lines are own-side only.** The map already draws a detected
      enemy **where it was last seen**; a log line would have given its current
      endpoint, quietly undoing the staleness the map is careful about. The map
      carries what the enemy may see of a move, and the log does not.
    - ✅ **A stale mark is not a sighting.** The live log asks for a contact
      reported *this turn* before it tells a side anything about an enemy force
      — the same `seenNow` test the map is drawn with. `knows` only says a
      contact record exists, and decision 13 already ruled that a stale contact
      carries the state it was last seen in: without this a side would read
      `נראה מנוטרל` off a three-turn-old mark that its own map still draws
      alive.
    - ✅ **How far a round fell from its aim point goes only to the gunner.**
      The deviation measures the shell against the *firer's* aim, which is not
      something the side underneath it is in a position to know. It is told
      that the round fell. Applied to the debrief as well, so the two cannot
      drift — `IndirectFireResult` now carries the side that called the mission
      for exactly this.
    - ✅ **A side is told what an engagement under a standing order did to
      it.** Chasing the live-log split turned up the matching hole in the
      debrief: `executeStandingOrders` was hidden from the enemy *wholesale*,
      so a force shot at under a standing order was never told, contradicting
      decision 13's "being fired on is always known". The step is now filtered
      execution by execution (`executionVisibleTo`) rather than whole.

      The **לקחים** panel had the same blind spot, and it mattered more there:
      a hotseat battle journals *orders*, not shots, so the ambush the panel
      exists to count usually arrives inside a standing-order step. Reading
      only the explicit `fire` / `assault` actions left `hitByUnseen` at nought
      for a side shot at under orders, and `suffered` short by those men.

    **Losses are worded per reader, not per viewer.** The old log baked
    exact-vs-banded from whoever happened to be at the screen when the line was
    written, and then showed that line to everybody — so a RED casualty count
    written during RED's activation was read by BLUE. A line both sides read is
    now written once per reader: the owner of the force that took the losses
    counts them, a side watching gets a report (decision 13's bands), and a
    side with no contact on the force is told nothing about it at all.

    ✅ **A force is told when a charge it laid goes off — if it can see it
    happen** (ruled by the author 2026-09-16). Not ownership, and not a
    telephone: **line of sight**. A layer watching the ground he mined sees the
    explosion; one who has pulled back behind a crest learns nothing until he
    goes and looks, and his charge's marker simply leaves his map.

    Sight is the weaker test on purpose — weaker than holding a contact, which
    is a detection roll (decision 12). So the two readings differ: a side
    *holding a contact* on the force that trod on it is told who; the layer who
    can merely see the ground is told that his charge fired and no more. The
    predicate is [`hasEyesOn`](src/app/hotseat.ts), and it asks the engine's own
    `canObserve` rather than a second opinion — a neutralised squad is still
    drawn on the map and is still not watching anything.

    **Enforced, not written down.** `pushLog`'s audience is a *required*
    argument, so a new log line cannot be added without saying who may read it
    — the same trick as the four exhaustive switches over `RecordedAction`, at
    the only chokepoint the live log has. `src/invariants.test.ts` also catches
    the shape a reader reaches for from memory (a bare `Side` where an
    `Audience` belongs) and pins the panel's filter.

18. ✅ **Covering fire (חיפוי)** — the document's third action of phase 6,
    built 2026-09-16. The document gives the resolution in one line —
    *פגיעה במקרה של פעולה על ידי האויב: כמו ירי*, "a hit in the case of an
    action by the enemy: like fire" — and nothing else. The author gave the
    four answers it does not, and they are the whole rule:

    - **It triggers on an enemy moving, firing or assaulting.** All three, not
      movement alone.
    - **It is declared in advance** (`setCovering`, in the fire phase), not
      chosen when the moment comes.
    - **It resolves immediately, and the force it caught carries on.** On a
      bound the shot is taken at the first point of the path the coverer could
      see *and* reach — not where the bound ended, which the force goes on to
      reach anyway. A bound is interrupted, never cancelled.
    - **It spends the force's action**: a force covers or attacks in a turn,
      never both, which is what makes it a choice. A force holding חיפוי is
      refused a deliberate shot (`HOLDING_COVERING_FIRE`), and standing it
      down does not hand the action back.

    Two riders follow from the four and are ours, though neither is much of a
    reading:

    - **A reaction is not an action**, so covering fire never triggers covering
      fire. Without that, two opposing covering forces answer each other until
      the stack gives out.
    - **Firing consumes the posture.** It answers once and must be declared
      again — the XCom rule, and the one that stops a single force covering a
      whole side's turn.

    ⚠️ **The shot is resolved on the ground the force was caught on**, not on
    the cover it is still carrying in the field. Cover is read at the end of
    the turn (decision 12) precisely because nothing used to shoot mid-bound,
    so a force that has broken out of a prepared position still holds that
    position's cover all turn — and a covering shot resolved against it would
    be halved for ground the force left two hundred metres back. Covering fire
    is the exception the end-of-turn ruling anticipated. Ours.

    ⚠️ **A force caught in a bound takes the movement modifier** — +30% against
    a walker, -20% against a runner, the document's own numbers from the
    movement table. They had no consumer in the engine until now, because
    nothing had ever fired at a force *during* its move. Without them, running
    under covering fire is never worse than walking, which would make the gait
    control a trap.

    ✅ **A shot and an assault are interrupted exactly as a bound is**
    (author, 2026-09-16). The covering force answers *before* the enemy's
    attack resolves, not after — so a coverer that is itself the target is not
    dead before it replies. The attack still goes in, interrupted and never
    cancelled, but with whatever the covering fire has left it: a force that
    has just lost men has fewer shooters.

    ✅ **A force answers only an enemy its side has detected** (author,
    2026-09-16) — the same standard `orderedTargetFor` holds an order to, where
    the engine refuses to aim a force at something nobody has seen.

    **What that costs, and it is meant.** The enemy's chance to pick a mover up
    is rolled on the way into the *fire* phase (`observeFromPositions`), which
    is after the movement phase — so **the first bound that breaks cover in
    front of a covering force is not answered**. The ambush fires on the next
    one. A force that was already on its side's map is answered the moment it
    moves, which is the common case once contact is made; a force coming out of
    dead ground gets one bound free. Pinned by a test, both halves.

    A standing order to **hold fire** still wins over the posture: decision 6
    enforces hold-fire even against the player's own click, so it is not to be
    got round by declaring חיפוי. Mechanism:
    [`combat/covering.ts`](src/engine/combat/covering.ts) for where along a
    bound the shot falls, `Game.answerWithCoveringFire` for who may take it —
    one owner, reached from all three triggers, rather than three copies of the
    rule at three call sites.

19. ✅ **Morale (מורל) and suppression (דיכוי)** — the shape given by the author
    on 2026-09-22, built the same day. **The document has no morale at all**:
    not מורל, not שבירה, not דיכוי, not a table. So the *shape* below is his
    (✅) and **every number is ours** (⚠️), all of them in one file,
    [`data/morale.ts`](src/engine/data/morale.ts), and on
    [balance.md](docs/balance.md). A module like the others: `morale: true`
    on `GameOptions` (and in a scenario spec). Without it a game plays exactly
    as before — no extra draws, no slower forces, no worse aim — and 432
    existing tests passed untouched to prove it.

    What he set:

    - ✅ **Six traits per soldier**, 1–10: strength, intelligence, wisdom,
      agility, charisma, luck. (Drawn as the rounded-up mean of two d10, so most
      men are average — ⚠️ ours.) Only wisdom, luck and a leader's intelligence
      and charisma do anything yet; the rest are ruled in decision 69, not yet built.
    - ✅ **Leadership = intelligence + wisdom + charisma**, for leaders only: a
      squad's first man is its squad leader, a command group's is its
      commander. A regular soldier has no leadership.
    - ✅ **A starting pool between the scenario's minimum and 100.** The minimum
      is the force's `motivation` (poor 40 · low 50 · normal 60 · high 70 ·
      fanatic 85 ⚠️), and the draw is the mean of two, so most men start
      mid-range.
    - ✅ **A live leader bonus, up to battalion.** Not added to the pool at the
      start: it is recomputed every time it is read, so it disappears the moment
      the leader is lost or out of reach. Each leader whose reach covers the man
      adds leadership ÷ 3, halved for each link already counted below him, capped
      at ±15 (⚠️). A squad leader covers his squad; a command group's commander
      covers every lower echelon of his side within the every-turn band of the
      פו"ש table (300 m platoon, 500 m company; 1000 m battalion ⚠️). **A broken
      leader counts against his men.**
    - ✅ **Out of every leader's reach, half the charisma** (1–5) of the most
      charismatic comrade within 50 m (⚠️ the radius), and never his own.
    - ✅ **Thresholds on effective morale** (pool + leader bonus − what
      suppression is doing to his nerve): **≤ 50 wavering**, tested every 3 turns
      (⚠️ the interval); **≤ 30 shaken**, tested every turn; **≤ 10, or a failed
      test: broken.** A broken soldier keeps his head down: he does not shoot.
    - ✅ **Losing a commander hits hard**: −15 when a man's own squad leader goes
      down, −10 when a commander whose reach covered him does, on top of the
      bonus that vanishes with him.
    - ✅ **Aggregation at higher echelons**: a force's morale is its men's. The
      same rule reads a squad or a company fielded as one force.
    - ✅ **A separate suppression layer.** A force-level count, added the moment
      fire arrives (a burst 10 + 5 per hit, ×1.5 from a sustained MG; shells 25,
      an RPG 15–30, a charge 20, an assault 30 ⚠️) and **halved at every end of
      turn**. ≥ 15 **suppressed**: half pace (the same slowing as the
      document's under-fire rule, never both), three-quarter accuracy, −5 to
      nerve. ≥ 40 **pinned**: moves only to withdraw, half accuracy, −10.
      Because it lands with the fire, **firing first matters**: a squad shot at
      early in the fire phase shoots worse later in it.
    - ✅ **States, not numbers, on screen**, and only one's own. The enemy is
      shown behaviour — a force running, or giving itself up — and only one it
      is **watching that turn**: a contact refreshed this turn with the
      knowledge model on, a line of sight without it. The engine decides that
      once, in the report's `seenBy`, and the live log and the debrief both
      read it — so a force the side never found cannot be named by its rout.
      Its men's traits and pools, its motivation, experience and suppression
      are stripped from the side's view of it (`outsideView`), and a stale mark
      shows no rout.
    - ✅ **Recovery is hard and capped: the pool of will.** Every loss takes the
      ceiling a man can recover to down by half of it (⚠️ the share), so at best
      half of what a fight takes ever comes back, and **a pool that reaches the
      bottom is dry — broken for good, never rallied.** A quiet turn gives back
      2, a turn well clear of the enemy 4, drawing blood 3, putting an enemy force
      out 6 — never past the ceiling.
    - ✅ **A broken man can be rallied by a leader, and it is hard.** Chance =
      2 × leadership + experience − 15 per earlier rally − 20 under fire (⚠️):
      about one in three at average leadership the first time, almost never the
      third. His own squad leader can try; a commander must **come to him**
      (within 50 m ⚠️). Nobody rallies a man with the enemy on top of him.

    What the author accepted from the comparison with other games (✅ that they
    are in; ⚠️ every number):

    - **Tests triggered by events** (Battle Brothers, XCOM) as well as by the
      clock: a turn that costs a man 12 or more (⚠️) tests him there and then.
      What costs what is in `LOSS` / `GAIN`: fired on, shelled, wounded, a
      comrade hit or down, a friend nearby down, flanked (fire from two
      directions 90° apart, or from outside the sector the force watches),
      outnumbered 2:1 by what it *knows of*, enemy armour in sight with none of
      its own, friends breaking. A light 1d4 hit is priced as the light wound
      it is (−6 him, −1 each comrade), which is what keeps morale from
      out-killing the dice — see *measured* below.
    - **Contagion** (Total War): a friendly force within 200 m routing or
      surrendering costs every man who saw it — a line of sight, not only the
      distance — 8, and each comrade who breaks
      costs his squad 4. Felt at once, tested next turn.
    - **Heroic response** (Close Combat, Darkest Dungeon): a failed test is
      heroism instead of a break on d100 ≤ 2 × luck — luck's only job here. The
      hero is untested for 3 turns, shoots ×1.25, and his squad draws +5.
    - **Morale changes performance** (Steel Division): each man shoots at his
      state's accuracy — wavering ×0.9, shaken ×0.75 — on top of suppression.
    - **Motivation and experience** per force (Combat Mission): experience
      (green · regular · veteran · elite) adds −10 / 0 / +10 / +15 to every test
      and rally, and scales suppression ×1.25 / 1 / 0.8 / 0.7.
    - **Forces break.** Broken men and casualties at half its strength, or its
      standing men averaging ≤ 10, and the force goes: it **routs** to its
      command group (or 200 m away from the nearest enemy if it has none), under
      an order the engine gives it — it takes no orders, fires at nothing, and
      loses 10 more — until enough of it is rallied, when it holds where it is.
    - **Cornered** (ASL's desperation morale): a force that breaks with an enemy
      within 50 m **surrenders** instead, and its broken men cannot be rallied.
      So the author's three outcomes are placed rather than rolled: a broken
      *man* stops responding; a broken *force* runs, or surrenders where it
      cannot.
    - **Voluntary withdrawal** (Company of Heroes): the `withdraw` standing
      order (נסיגה). The force falls back without firing, can move even when
      pinned, and its men skip the periodic tests — it costs no morale. The
      rout is what waiting too long buys. The command group, driven by hand
      rather than by orders, withdraws the same way: pinned, it may still be
      moved, but only further from the nearest enemy its side knows of.
    - **The side breaks** (Close Combat): two thirds of its fighting strength
      down, broken, routed, surrendered or neutralised (command groups do not
      count), and the battle is over for it — `sideDefeated` says so and the
      log says **נשבר** rather than נוטרל. ⚠️ Both sides can break in the same
      summary step; that is a **draw** (תיקו), ours until backlog 18 says what
      a result is.

    **Mechanism, one owner.** The slow layer is judged once per turn in the
    summary phase (סיכום והתארגנות — the document's turn already has a
    reorganisation step), by `resolveMorale` in
    [`morale.ts`](src/engine/morale.ts). It reads two ledgers kept as fire is
    resolved: which forces were shot at and from where, and every soldier as he
    stood when the turn began. **Casualties are found by comparing the two**,
    whatever caused them, so a new way of hurting a force cannot forget to tell
    morale; a new way of *shooting at* one must still call `noteFire` for the
    suppression and the flank (the bearing is fixed there, where the force
    was when it was shot — a force caught mid-bound is flanked or not by that
    shot, not by where it ended the turn). Every man's effective morale is read
    **before** anyone is tested, so the order forces and men are listed in
    cannot decide who breaks: a squad leader who breaks costs his men from the
    next turn, like any other breaking.

    **Determinism.** The men's traits and pools are drawn from **their own
    stream**, seeded by the game's seed and the force's id, not from the game's
    rng. A recording carries each force as it was added, so a replay does not
    draw them again, and drawn from the main stream every roll after setup
    would have diverged. Tests and rallies draw from the main stream, and only
    when one is actually taken.

    **Measured** (300 seeds, two squads trading rifle fire at 150 m, both
    command groups 200 m back): without morale the loser is neutralised at a
    median turn 12, 4.1 men down. With it, a median turn 11 — **273 of 300 end
    in a rout**, at 2.3 men down and 2.5 broken. The first cut, which charged
    every 1d4 hit as a serious wound, routed a squad at turn 7 with **0.9 men
    down**: morale was out-killing the dice, which is the thing to watch in any
    re-tune. Under a sustained MG at the same range: turn 4 either way, 124 of
    300 routing before the attrition rule gets there.

    Campaigns (✅ the author's word, not built): the pool carries between
    battles and **only rest refills it** — how, is the campaign discussion
    (backlog 16).

20. ✅ **Initiative ties are rolled again** (author, 2026-09-23). The document
    gives initiative as "1ק10 לכל שחקן, תורות בסדר יורד" and says nothing about
    a tie. The engine used to give it to the side listed first, which put RED
    first on 55% of turns (docs/balance.md, *The balance harness*). A tie is
    now rolled again until the sides differ. This changes the number of dice a
    turn draws when a tie comes up, so **a sealed recording made before this
    that crossed a tie fails `verifyRecording`** — the tool doing its job.
21. ✅ **A side with no fighting forces left has lost** (author, 2026-09-23 —
    "a now, we will get back to it later", i.e. until backlog 18 settles
    victory conditions properly). `sideDefeated` used to want *every* unit
    out, command groups included, and a command group with nobody to command
    sits still, is therefore hidden (decision 12), and can be found only
    inside 20 m — so a battle without morale could go silent for ever. It now
    judges the fighting forces, the same exclusion the morale rule's side
    break already made. A side fielding nothing but command groups is judged
    on those.

22. ✅ **The movement table's modifier applies to every direct shot, and
    proportionally** (author, 2026-09-23 — option c). The table gives
    "סיכויי פגיעה לאש אויב" +30% against a force that walked, −20% against one
    that ran. Until now only covering fire read it (decision 18), and read it
    as an addition. Now every direct shot at a force that moved this turn reads
    it, as **×1.3 and ×0.8** on the band — the document's own figures, only
    their application ruled, as decision 7 did for cover. This **overrides
    decision 7's rider** that the movement modifiers stay additive. Added, a
    runner beyond 100 m could not be hit at all (20% − 20%).
23. ✅ **Firing from full cover keeps −30%** (author, 2026-09-23 — option b).
    The document drops a force that fires from full cover to partial (−10%)
    for that turn. That left a defender who shoots back barely protected, so
    it now keeps −30% (`FIRING_FROM_COVER_MODIFIER`). Genuine partial cover — a
    wall, a tree, a position prepared before the battle — stays at the
    table's −10%.
24. ✅ **A prepared defender is steadier** (author, 2026-09-23; ⚠️ the size is
    ours). A force **in position** — it did not move this turn and is behind
    something: the ground, a building, a hole it dug or a position it prepared
    — adds **+15** to every morale test and feels **×0.75** of every loss
    (`PREPARED` in data/morale.ts). A force that gets up to attack leaves it
    behind.

    **Ruling 1 is still on trial.** The author ruled that a defender facing an
    assault returns fire (2026-09-23), with the rate to be settled by
    measurement. It is a switch, `assaultReplyChance` in
    [`data/variants.ts`](src/engine/data/variants.ts), off by default —
    because the rate made no measurable difference (docs/balance.md, *Second
    round*).

25. ✅ **ירי מקביל is the coaxial machine gun — a vehicle's weapon** (author,
    2026-09-23). The document's second direct-fire table (70 / 50 / 20% out to
    700 m) is the gun mounted beside an armoured vehicle's main armament
    (מקלע מקביל). The engine had read it as an infantry "sustained MG" since
    the first commit, and the hotseat offered it to every squad as "מקלע" — so
    a squad could fire at more than twice the rifle table's chance, and a tank
    could not fire its coax at all. Now:
    - infantry fire the נק"ל\מקלעים table only — its own heading already
      includes machine guns — and are refused the other (`NOT_A_COAXIAL_WEAPON`);
    - a vehicle may fire its coaxial gun (a shot, an order, or covering fire),
      or its main gun as before.

    ✅ **One roll a turn, by the gunner while he is fit** (proposed as ours,
    confirmed by the author 2026-09-23): one gun, one man firing it.
    The key stays `sustainedMg`, so recordings still load — but **a recording
    in which a squad fired the MG table now replays that shot as refused, and
    fails `verifyRecording`**.

26. ✅ **A small-arms hit rolls how bad it is** (author, 2026-09-23 — adopted
    after the harness's third round, docs/balance.md). Each hit by small arms,
    the coaxial gun or an assault's fire rolls a **d10 instead of the
    document's 1d4 of damage**:
    - **1–4, a light wound**: the man fights on, 2 points towards the
      document's 8;
    - **5–8, a serious wound**: out of the fight, and bleeding;
    - **9–10, killed**.

    It is one die either way, so the rng is asked as often as before. The
    document's 8-point threshold and its bleeding rule stand under it.
    Explosives kept the document's own dice until decision 27. **Why:** a 1d4 hit against an
    8-point threshold never takes a man out alone, and it scatters a small
    force's fire across a large one to no effect. Each hit is now worth the
    same on 36 men as on 9. At this split the squad fights met every balance
    target (`WOUND_SEVERITY` in data/casualties.ts). This changes every
    battle's outcome, so **any sealed recording made before it fails
    `verifyRecording`**.
27. ✅ **One wound rule for bullets and explosives** (author, 2026-09-23 —
    option A0, adopted after the harness's fifth round, docs/balance.md).
    Every hit that lands on a man rolls decision 26's d10 severity, whatever
    hit him. That covers small arms, the coaxial gun, an assault's fire, a
    grenade, a rifle grenade, a mortar bomb, a shell, a tank round, an RPG and
    a mine. The document's damage dice are no longer rolled against
    infantry. They stay in `data/explosives.ts`, and the vehicle rules still
    use them.
    - **Explosives still hit more men.** Their weight is in the blast table:
      how many men a round catches, and from how far.
    - **Why:** the author's principle is that explosives cause most of the
      casualties in modern war. The sources give 65–78% of wounds since WWII.
      They also show a fragment wound is *less* likely to kill than a bullet
      wound (about 10–20% against 33%). So explosives dominate by how many
      they hit, not by how bad each hit is.
    - **The numbers:** 10 of 12 balance targets. With one mortar bomb a turn
      on the objective, explosives put out 76% of the men in a company
      attack.
    - **Rejected:** a severity shift by die size (option A), and the
      document's dice with a man out at 5 (option B).
    - Every man put out records what did it (`Soldier.outBy`).
    - It changes the outcome of any battle with explosives, so a sealed
      recording of one made before it fails `verifyRecording`.

28. ✅ **One round is one shell** (author, 2026-09-23). An entry in the
    indirect-fire and blast tables is a single shell or bomb, not a
    battery's volley. A battery's mission is several rounds, each scattered
    and each with its own blast. This is how the engine already read it, so
    nothing changed.
29. ✅ **Cover counts against a shell** (author, 2026-09-23 — option a, after
    the harness's sixth round, docs/balance.md). A man's chance of being
    caught by a shell or mortar bomb is ×½ if his force is in partial cover
    and **×⅛** in full. The document's blast table ignores cover. The full-cover
    factor was ×¼ until the author moved it to ×⅛ the same day, to match the
    published lethal areas: a foxhole is ×0.10–0.13 against standing men.
    **The factors are ours**, from those sources, and so is the scope:
    indirect fire only. Grenades, rifle grenades, RPGs, tank rounds and mines
    are unchanged. *Since decision 75 rifle grenades, RPGs and tank rounds
    follow them too.* The figures are `SHELL_VS_MEN` in `data/explosives.ts`.
    - **Rejected:** option b, where only full cover counts.
30. ✅ **The first volley catches men on their feet** (author, 2026-09-23).
    A shell's blast chance is the document's against men standing. Once a
    force has been shelled, its men are down for the next rounds, ×0.36, until
    it moves (`Unit.downUnderShelling`). Everything that lands in the same
    turn, whatever mission or side fired it, lands together and finds the
    men as they were. That is why massing fire into one turn is worth more
    than the same rounds spread over several.
    - Partial cover takes the lower of its own ×½ and the men's posture:
      ×½ on their feet, ×0.36 once down. Under an air burst it counts for
      nothing (decision 31).
    - A mission can fire several rounds (`queueIndirectFire`'s `rounds`),
      each scattered on its own. The live UI calls missions (decision 34).
    - ⚠️ ×0.36 is ours: prone ÷ standing lethal area for a 105 or 155 mm round.
    - Source: the US Army's posture test of the 1970s. 58% of the men were
      standing at the first impact, 29% two seconds later, none after eight.
31. ✅ **Shells can be fuzed to burst in the air** (author, 2026-09-23). A
    mission is fuzed for impact, as the document has it, or for air burst.
    - An air burst is ×1.28 against standing men and ×0.97 against men down,
      because going to ground barely helps.
    - A wall or a fold gives nothing against it.
    - It finds an open hole, full cover with no roof: ×⅝ against impact's ×⅛.
      A dug or prepared position is an open hole.
    - A building is a roof, and stays ×⅛ (`underRoof` in `terrain.ts`). So
      is a position prepared before the battle in full cover (author,
      2026-09-23: prepared positions have overhead cover). A hole dug during
      the battle is open.
    - It does nothing to a vehicle's tracks.
    - ⚠️ Every factor is ours. They come from the lethal areas of a 155 mm
      round (standing 971 → 1,240 m², prone 346 → 939 m²) and from FM 7-90:
      a proximity fuze is five times as effective against open positions.
      The two sources disagree on open holes. We followed FM 7-90, which is
      what the author agreed to.
    - The engine and the harness take a fuze (`queueIndirectFire`'s `fuze`).
      The live UI offers the choice when a side calls for fire.

    Decisions 29–31 change the outcome of any battle in which a shell lands on
    men, so a sealed recording of one made before them fails
    `verifyRecording`.

32. ✅ **Accuracy is a CEP, walked onto the mark by adjusting fire** (author,
    2026-09-23; after the harness's ninth and tenth rounds, docs/balance.md).
    This is **in place of the document's dispersion table**, which stays
    transcribed in `data/artillery.ts` but is no longer rolled.
    - A round scatters as a circular normal. The CEP is the weapon's
      first-round figure, halved by each earlier *observed* round of the same
      side's same weapon within 100 m of the aim, down to the weapon's best
      (`INDIRECT_ACCURACY`, `cepAfter`).
    - Artillery is **270 m to 50 m** (the author's 50–270 m, from the sources
      for unguided 155 mm at range). A mortar is **100 m to 25 m** (a 120 mm
      bomb is 76–136 m unadjusted; the 25 m is ours).
    - Once a round is seen to land within **50 m** of its aim, the side is
      **on the mark** there (`Game.isOnTheMark`): anything it fires within
      100 m of that point fires at the weapon's best. It does not follow a
      moving aim beyond that.
    - **Registered targets** (`GameOptions.registeredTargets`, recorded) are
      points a side planned before the battle. Its guns start on the mark
      there: a defender's fires on its approaches.
    - ⚠️ The 50 m and the 100 m are ours, from the doctrinal "fire for effect
      within 50 m of the adjusting point".
33. ✅ **Adjusting needs an observer** (author, 2026-09-23). A round teaches
    the guns only if its side sees it land: one of its forces in the fight
    within 2,000 m with a clear sight line to the burst, smoke included, or a
    UAV over the target (`observes` in `game.ts`). A force that is out,
    routing or surrendered watches nothing for its side. Fire nobody sees stays at first-round
    accuracy. Killing or blinding the observer is how to stop it walking in.
    ⚠️ The 2,000 m and the 3 m burst height are ours.
34. ✅ **At company and below, fire support is assigned missions** (author,
    2026-09-23). A side is given so many fire missions of each weapon
    (`GameOptions.fireSupport`), each firing a set number of rounds for
    effect, by default **6 for artillery and 12 for a mortar** (decision 36,
    `DEFAULT_ROUNDS_FOR_EFFECT`). A mission called
    (`Game.callForFire`) runs itself:
    - one round to adjust, waiting to see where it lands before the next, until
      one is seen on the mark (decisions 32–33) — a mortar adjusts every
      second turn, artillery every third;
    - then its rounds for effect, all landing together; then it is spent.
    - It goes straight to effect on a registered target, when nobody of the
      side can see the target, or after 4 adjusting rounds (ours).
    - **Check fire** (`Game.checkFire`) stops a side's missions and its rounds
      not yet landed: an attacker lifting its fires. A mission stopped is
      spent.
    - A side on missions cannot fire outside them (`queueIndirectFire`
      refuses it). A side left out of `fireSupport` is not rationed.
    - **Ammunition** is the battalion's and above, set by the mission's
      parameters (backlog 12). It is not built.
    - The debrief narrates a call for fire, and the live UI calls one: one
      call a side a turn (decision 8's UI limit), and a weapon with a mission
      in hand takes no other call until it is done or checked (a section or a battery fires one mission at a time — the UI's
      rule and the harness's, not the engine's).
    - Why 6 was the first default: a 6-gun battery's single volley.
      Decision 36 split it by weapon.
35. ✅ **Counter-battery fire exists only for guns on the map** (author,
    2026-09-23). Mortars are on the map at **company and above**, artillery at
    **battalion and above**. On the map they are units, and can be found and
    fired on; that arrives with echelon scaling (backlog 3). Off the map there
    is no counter-battery fire. Today every game is off-map for both, so
    there is none.
36. ✅ **Rounds for effect by weapon: 6 for artillery, 12 for a mortar**
    (author, 2026-09-23, after the tenth round). Artillery's 6 is a 6-gun
    battery's single volley. A mortar's 12 is four bombs a tube from a 3-tube
    section, nearer doctrine's "seldom less than five rounds for each mortar"
    (FM 7-90). In balance, a company's 2:1 attack with mortars at 6 won 20%;
    at 12 it wins 47–56%, in the 30–70% target band (balance.md, *Tenth* and
    *Eleventh round*).
    - An allotment may still set its own (`FireAllotment.roundsForEffect`).
      The game writes the number into each allotment, so a recording carries
      what it was played with.
    - A call for fire journals its rounds for effect, so a replay fires what
      was fired whatever the default has become. A recording made before
      this decision carries no number, and replays at the 6 it was played
      with.
37. ✅ **Who may call fire: mortars at company and above, artillery at
    battalion and above** (author, 2026-09-23, after the eleventh round).
    Below that a fight has no indirect fire, and no smoke from the tubes: a
    grenade's smoke is the squad's own. It is who may *call* a weapon, not
    whether its guns are on the map (decision 35).
    - The echelon is the one the side's player commands
      (`GameOptions.commandEchelon`). Undeclared, it is the highest echelon
      of the side's forces on the map (`Game.commandEchelonOf`). A harness
      battle declares it, since a company's defending platoon may be the only
      one of its company on the map.
    - `callForFire`, `queueIndirectFire` and `deploySmoke` refuse a weapon
      the side may not call (`Game.mayCall`, `FIRE_SUPPORT_MIN_ECHELON`). So
      does an allotment or a registered target made for it: at once when the
      echelon is declared, and when the first turn begins when it is read off
      the forces. A force that is out still counts toward the echelon: losing
      the company's command group does not make its player a platoon
      commander.
    - **Why:** in the harness, any indirect fire swamps a squad or a platoon
      fight (two mortar missions take a prepared position at 1:1 82% of the
      time), and mortars alone balance a company attack.
    - **Both demo battles are platoon fights, so neither side has indirect
      fire there any more.** The live UI offers only what a side may call.
    - Recorded (`fireSupportByEchelon`). A recording made before the rule
      reads it as off, so the fire it called is still allowed on replay.
38. ✅ **Mission planning: registered targets, observation posts and
    alternate positions are the player's to set before the battle** (author,
    2026-09-23). They are command decisions, taken in mission planning, on
    turn 0 (`Game.planning`), and journalled like any other action.
    - **Registered targets** (`Game.registerTarget`). The attacker registers
      targets as the defender does. A player registers them for their own echelon
      and the one below. There is no artillery for platoon or squad
      (decision 37). A target is registered where the player expects the enemy
      and tells them nothing about whether it is there. At brigade and above a
      player registers for two echelons below, on the enemy's estimated
      positions, still without revealing the fog of war (not built: there is
      no brigade yet). The side's guns start on the mark there (decision 32).
      At most **6 a weapon** (`MAX_REGISTERED_TARGETS_PER_WEAPON`) is
      ours.
    - **Observation posts** (`Game.designateObservationPost`). A force set as
      an OP that stays put sees a force *on the move* out to **1,000 m**
      (`OBSERVATION_POST_RANGE_M`, ours), against the document's 300 m. A
      hidden force it looks for like anybody else, in the 20 m band. Moving
      or firing ends it at once (`watchingAsPost`). It is a force, not men detached from one. Not a
      vehicle. The squad drill leaves a command group that is an OP where it
      stands.
    - **Alternate positions** (`Game.prepareAlternatePosition`). One per
      force, prepared as its first position was (partial if it had
      none), and more than 25 m from where the force stands — a position
      prepared underfoot would be cover for nothing. Any force of the side
      within 25 m of it holds that cover, the turn it arrives; not a vehicle,
      and not the enemy. The drill's displacement goes there when there is
      one. **There is no upper bound yet**: an attacker may prepare one on the
      objective. A question for the author.
    - **The numbers** — 6 targets a weapon, 1,000 m, one alternate a force,
      25 m, partial for a force with none — were ours; **the author accepted
      them on 2026-09-23, to be tested when the artillery is balanced** at
      battalion (backlog 3), with the open questions: how far an alternate
      position may be, whether one mission in hand a weapon is a rule, and
      why displacing still hurts the defender.
    - **Binoculars and UAVs** are for a later stage (backlog 4).
    - **The live UI** has a planning stage before the first turn (see the
      Stage 2 section above). The company battle on Tel Azeka
      (`telAzekaCompany`) is the one where fire can be registered and called.
    - An OP needs the knowledge model (`trackIntel`): without it a side sees
      by a flat radius and the OP changes nothing. Every battle in the app
      plays with it.
39. ✅ **The caller chooses: adjust fire, or fire for effect at once**
    (author, 2026-09-23, after the twelfth round). `callForFire`'s `method`:
    - `adjust` (the default, and what decision 34 did alone): single rounds
      walked onto the mark while the side can see them land, then the rounds
      for effect;
    - `effect`: every round for effect at once, at whatever accuracy the guns
      have there — their best on a registered target or a mark earned,
      first-round otherwise.
    - A registered target goes straight to effect either way, and so does a
      call nobody of the side can see, as before.
    - **Why:** decision 34 let the engine choose, and it adjusted exactly when
      the side could see — against a moving attacker, the slower method. With
      observation posts the defender's missions were observed, adjusted, and
      were spent before the assault (company 2:1 attack 46% → 83%). With the
      choice, OPs and fire for effect meet all four company targets
      (balance.md, *Thirteenth round*).
    - The player chooses in the live UI (`שיטה`). For a simulated lower
      echelon, Jev will (backlog 15).
    - Journalled only when `effect`, so a call from before reads as the
      adjusting it was.
40. ✅ **A turn is 60 seconds** (author, 2026-09-28). The document never
    said. `TURN_SECONDS` in [`data/lethality.ts`](src/engine/data/lethality.ts).
    It is what lets a rate in the rules be read against a rate in the sources
    — rounds a minute, hits a minute, losses a minute — and it is the time
    basis of [docs/validation.md](docs/validation.md). The document's movement
    (50 m a turn walking, 100 m running) reads as tactical movement in bounds
    at this scale. Nothing else changed with it: no rate was rescaled.
41. ✅ **Blast and the tank gun from published data** (author, 2026-09-28:
    "adapt our table to what is acceptable in research"). The document's
    blast bands reached men 50–200 m from a round at 25–70% each; published
    lethal areas reach a few tens of metres. On a squad in the open, a round
    anywhere within 50 m put out **3.5×** (155 mm) to **20×** (40 mm grenade)
    the men its lethal area predicts. Now, with `GameOptions.lethality`
    `research` (the default):
    - **Each weapon's blast bands are derived from its lethal area** against
      standing men (`LETHAL_AREA_M2`): the share of a force's 25 m-radius
      footprint the lethal area covers, divided by the 0.6 of hits that put a
      man out, in 10 m rings. The bands give the lethal area back exactly —
      a test integrates them. Posture, cover and fuze scale them as before
      (decisions 29–31).
    - **Against men only.** A vehicle is reached, and a tank round or a
      charge connects with it, by the document's bands, under either setting.
    - Artillery **971 m²** (155 mm), mortar **476 m²** (81 mm, ours: scaled by
      the published casualty radii), tank HE **390 m²** (ours: a 105 mm
      shell's), rifle grenade **79 m²** (40 mm, 5 m radius), RPG against men
      **154 m²** (ours, unverified). A shell on the point is about as deadly
      as before; it stops reaching at about 40 m instead of 200.
    - **The tank gun hits 90% to 2,000 m, 50% to 3,000 m** (modern fire
      control; the 3,000 m band is ours), where the document stopped at
      1,500 m with 90% only to 300 m.
    - Unchanged, and why, on [docs/validation.md](docs/validation.md): small
      arms and the coaxial gun (no source gives a per-minute rate to set them
      by), the RPG against armour and the wound roll (they agree with the
      sources), the hand grenade and the charges (not researched).
    - The document's tables stay verbatim in `data/explosives.ts`;
      `lethality: "document"` plays them. A recording made before the
      decision carries no `lethality` and replays on them.
    - **What it moved:** without a fire plan, explosives now put out about 4%
      of the men in a company attack (was 23–31%); with the mortar plan, 13–31%
      (was 46–76%). The principle that explosives cause about 75% of losses
      now has to come from the **volume** of fire, not the reach of one round
      — a question for the balance pass (docs/validation.md, *Open*).
42. ✅ **Rates of fire: a range, drawn each turn, lower as a crew tires**
    (author, 2026-09-28). First cut the same day at the published rates, and
    revised: "these are firing range numbers — no tank fires 5 rounds a
    minute." Under `lethality: "research"` (`RATE_OF_FIRE` in
    [`data/lethality.ts`](src/engine/data/lethality.ts)):
    - **Each weapon has a low rate and a high one.** The low is the lowest
      figure there is (the document's where it gave one) and is the
      **likeliest**; the high is the highest published rate, the **outlier**:
      tank gun 1–7, rifle grenade 1–7, RPG 1–6, mortar 3–30 a tube,
      artillery 2–5 a gun (5 since 2026-10-03: the M777A2's maximum).
    - **What a crew fires in a turn is drawn**: a geometric tail above the
      low rate, each round above it 0.6 as likely as the one below for a fresh
      crew and 0.15 for a tired one (`TAIL_WEIGHT`, ours). A crew goes from
      fresh to tired over **10 turns of firing** (`FATIGUE_TURNS`, ours). A
      fresh tank crew averages 2.3 rounds a minute, a tired one 1.2.
    - A direct-fire launcher fires its drawn rate in one action, each round
      rolled to hit, and stops when its target is down. A fire unit (3 tubes,
      6 guns) lands its tubes × its drawn rate a turn, and a mission's rounds
      for effect beyond that land on the turns after; the fire unit tires with
      the turns it has fired.
    - Under `document` nothing changed: one round, no ceiling, the same rng
      draws. `turnsFiring` is kept only on the research figures.
    - Nothing counts ammunition (backlog 12).
43. ✅ **Calibrated to 75% of losses by explosives — a 60–80% range since
    decision 81** (author, 2026-09-28: "I
    want the numbers to reflect 75% HE casualties"; the sources give 72–78%,
    docs/validation.md). **The 75% is for battles on real ground** (author,
    2026-09-30): the tel meets it (73–77%); the flat harness, where a scouted
    attack closes to rifle range in the open, gives about 51% and is not held
    to it. Measured, not argued: with the rates of decision 42
    the share of explosives stayed at 13–31%, and the fire's **volume** and
    the rifle's **deadliness** were what moved it. Under
    `lethality: "research"`:
    - **Small arms hit a third as often** (`SMALL_ARMS_COMBAT_FACTOR`): men
      under fire hit 7–10 times less than in trials (Rowland 1987); ⅓ is the
      smallest factor that reaches the target, the table's figures not being
      trial figures either. The coaxial gun and the assault keep their tables.
    - **A mortar mission fires 24 bombs for effect** (`RESEARCH_ROUNDS_FOR_EFFECT`),
      8 a tube from a 3-tube section, where decision 36 gave 12 — doctrine
      asks "seldom less than five rounds for each mortar". Artillery stays 6.
    - **The fire it was calibrated on** is a company's mortar section on
      call all battle: twelve missions a side, fired for effect at once
      (`CALIBRATED_FIRE_PLAN`, `npm run balance -- --fires calibrated
      --defender-fires calibrated`). There explosives put out **82%** (3:1
      attack) and **77%** (2:1) of the men, and the 2:1 attacker wins
      **63%**, inside its 30–70% planning target.
    - **The company battle on Tel Azeka plays it**: twelve mortar missions a
      side (author, 2026-09-28; it had 4 and 3).
    - **Where it does not reach 75%**: a battle with little fire — the
      harness's default of one bomb a turn (19–21%) — and every platoon
      battle, which has no indirect fire (decision 37); its explosives are
      its squads' grenadiers (decision 44). The share follows the fire a
      battle is given, as it does in the sources.
44. ✅ **A side gives up at the historical breakpoints** (author,
    2026-09-28: "adapt the morale to historical rules of thumb"). An attack
    stops at about 20–25% losses and a defence cannot hold at about 40% (the
    Dupuy Institute; US doctrine calls a unit destroyed at 30%); ours broke at
    44–78%. On the research figures a side breaks when this share of its men
    are down, broken, or in a force that fled (`SIDE_BREAK_BY_POSTURE`):
    **30% attacking, 60% defending** (40% and 50% since decisions 66 and 49), where decision 19 gave two thirds to
    both. The shares sit above the losses they stand for because broken and
    fled men count too; measured, an attacker gives up at a median **16–25%
    casualties** and a defender at **42–50%**, and the 2:1 company attack
    with fire support still wins **61%**. 55% for the defender came closer to
    40% and let that attack win 78%.
    - **Who attacks is said, not guessed**: `GameOptions.attackers` (a side
      not named defends; both, in a meeting engagement), carried by the
      recording and set in each scenario spec (`"attackers": ["BLUE"]`).
    - Still morale, not a fixed casualty rule: broken and fled men count, and
      a force still breaks by its own pool (the peer-reviewed work warns
      against a fixed breakpoint — Helmbold 1971, Wainstein 1986).
    - The squad drill's **grenadiers** arrived with it (author, same day): one
      40 mm launcher for every four men still fighting, firing rifle grenades
      at the squad's target inside 100 m alongside its rifles
      ([`app/drill.ts`](src/app/drill.ts), ⚠️ ours). They are a platoon
      battle's own explosives: 22–36% of its losses, against 75–80% where a
      company's mortars are on call — most explosives come from higher
      echelons, as the author expected.
45. ✅ **A rout counts by its casualties, and a player's squads fire their
    grenadiers** (author, 2026-09-28, after a playtest of all three
    battles). In the demo one tank round put 3 men of a squad out and broke a
    fourth; the squad routed, a routed force counted **whole** against its
    side (decision 19), and BLUE's attack was over at 3 casualties of 24 —
    12%, where decision 44's rule of thumb is 20–25%. On the research
    figures:
    - **A routed force counts only its men down or broken** towards its
      side's breakpoint. A surrendered or neutralised force still counts
      whole. Replayed, the demo now fights on to turn 7 and ends at 8 of 24
      really lost; in the harness a losing attacker's casualties at the break
      rose from a median 19% (p10 14%) to 22% (p10 17%) in the platoon 2:1
      attack, and the calibrated 2:1 company attack wins 56% (was 61%).
    - **A player's squad fires its grenadiers with its rifles**, by the same
      rule as the drill (`fireGrenadiers`, `SQUAD_GRENADIERS` in
      [`app/drill.ts`](src/app/drill.ts)): one 40 mm launcher per four men
      still fighting, inside 100 m. Until now only the drill's squads had
      them. The log tells the firer rounds, hits and the chance, and the
      target what landed on it.
    - On the document's figures a rout still counts whole, as decision 19
      set it.
46. ✅ **Hand grenades: every man throws his, and each is an M67** (author,
    2026-09-28). They caused 1–3% of the losses: an assault threw two for
    the whole squad (the drill) or 0–3 (a player), each 30% to hit one man.
    On the research figures:
    - **An assault's grenades are counted a man**: every man still going in
      throws up to the two he carries (`GRENADES_CARRIED`). The drill throws
      one each; a player picks 0, 1 or 2 a man (`רימונים ללוחם`).
    - **Each grenade is a blast** on the defender's position, of the M67's
      lethal area — its 5 m killing radius, **79 m²**, the same criterion as
      the 40 mm's (`LETHAL_AREA_M2.grenade`). One grenade puts out 0.39 men
      of a squad in the open, as its lethal area predicts (0.36). A nine-man
      assault's grenades put out about 3.5 men, beside its fire's 3.8.
    - The self-hit was the document's 5% a grenade, so a squad's own
      grenades wounded it about four times as often — see decision 47.
    - **What it moved:** explosives' share in the platoon battles rose from
      22–37% to 30–40%; company battles moved a point; the calibrated
      company battles did not (83%, 78%; the 2:1 attack wins 56%).
    - On the document's figures a count is for the force and each grenade
      30% to hit one man, as before.
47. ✅ **A grenade wounds its own side 1.5% of the time**, on the research
    figures (author, 2026-09-28), where the document gives 5%
    (`RESEARCH_GRENADE_SELF_HIT`, ours: no published rate was found). With
    every man throwing (decision 46), 5% wounded a squad's own men four times
    as often as before; at 1.5%, over 60 battles, 16 → 5 in the platoon 3:1
    attack, 8 → 2 in the 2:1, 18 → 4 in the company 2:1 — about what it was
    when a squad threw two. The grenades still catching someone did not
    change (36, 24, 100).
48. ✅ **A prepared position is dug in with overhead cover, and a squad left
    at half strength is not a squad lost** (author, 2026-09-28).
    - **Prepared positions start in full cover**, not partial: the Tel Azeka
      specs set `baseCover: "full"`, and it is the harness's default
      (`--prepared-cover partial` for the old). A defender that stays put
      dug itself to full cover by turn 7 anyway, so small arms met the
      same cover; the difference was overhead cover against shells, and the
      first turns — until decision 50 slowed the digging.
    - **On the research figures, a force the attrition rule neutralised
      counts only its men down or broken** toward its side's breakpoint, as
      a routed one does (decision 45). A surrendered force still counts
      whole; on the document's figures, all three count whole.
    - **What it moved** (calibrated company battles, 100 a cell): the 3:1
      attack wins 87% (was 95%), 75% by explosives; the 2:1 attack wins 2%
      (was 56%), 69% by explosives. Full cover alone takes the 2:1 to 7%.
      The 2:1 attack's 30–70% target (decision 44) is lost; open for the
      author.
    - **Mortar ammunition**: a sweep of missions × rounds (validation.md)
      found that more than about 8 missions a side are never fired in a
      company battle, and rounds a mission matter more than missions. No
      bomb count was added; the mission allotment is the limit.
49. ✅ **A defender gives up at 50%, not 60%**, on the research figures
    (author, 2026-09-28; `SIDE_BREAK_BY_POSTURE.defending`). Swept from 60%
    down to 35% (validation.md): at 50% defenders break at a median 33–49%
    casualties, centred on the rule of thumb's 40%, and the calibrated 3:1
    company attack wins 95% at 75% explosives. The 2:1 attack on a dug-in
    position wins 8%, which is accepted — doctrine asks 3:1 — and decision
    44's 30–70% target for it is dropped. Lower settings bring the 2:1 back
    only by making the 3:1 a walkover (91–95% explosives) and defenders
    quit under 30%.
50. ✅ **Digging in takes minutes, not turns**, on the research figures
    (author, 2026-09-28: "research dig-in times and adapt them";
    `RESEARCH_DIG_IN`). After the 3 turns before the tools come out, a force
    that stays put reaches **partial cover in 30 minutes** (a hasty prone
    shelter, about ½ m deep — FM 21-75, FM 5-103; the time ours) and **full
    cover in 90** (a rifleman's foxhole: the US Army's FM 5-15, 1944). It
    never digs overhead cover — hours of work (FM 5-103) — which only a
    position prepared before the battle has (decision 48). The document's
    clock (full cover in 7 turns) stays for `lethality: "document"`.
    - **What it moved**: a 2:1 company attack without mortars now wins 59%
      against a hasty defence and 8% against a prepared one (both were 8%);
      with a mortar section, a hasty defender is lost (100%). Prepared
      defences and `npm run validate` did not move (validation.md).
51. ⚠️ **Neither side knows exactly where the other is** (author,
    2026-09-28: "the blue and red won't know exactly where the other side
    is and the pre-planned fires won't be accurate"). Two halves:
    - **A sighting carries location error** (`GameOptions.locationError`,
      [`data/locationError.ts`](src/engine/data/locationError.ts)). A contact
      is where its observer judged the force to be: off along the sight line
      by **20% of the range** and across it by **10 mils** (standard
      deviations), never under 5 m. An observation post's range card halves
      the range error, and a UAV is off by 15 m whatever the range. A force
      that stays put and is seen again is placed better, the estimates
      weighted by how good each is — each observer adding to it at most once
      a turn, since the same eye seconds later makes the same mistake. One
      that has made a bound since is placed afresh, even back where it stood.
      The debrief tells an enemy's bound without where it went. The
      side's map draws every enemy at its report, even one in sight this
      turn. Fire still resolves on the truth, so a mission called on a report
      lands around where the force was judged to be. The error is drawn
      from its own seeded stream, so it moves no other roll. It is on in
      every scenario (the spec's `locationError`, default on), off in a
      game that does not ask for it, and read as off in a recording made
      before it.
    - **The test players plan their fires on an estimate.** The harness's
      attacker used to register its fires on the exact centre of each
      defending position, and the smart attacker built its fire plan
      around it. Now both use where the attacker's start line would judge
      the position to be, by the same figures (`--planning-error`,
      `PLANNING_ERROR`). The harness's defender registers its approach
      points off the line the attacker really takes, by the same share of
      the distance.
    - **Why the figures:** troops' range estimates by eye err by 20% or
      more (Armored Medical Research Laboratory, 1945), and a compass by
      10–17 mils. Doctrine's target location error categories put an
      observer with map and compass at CAT IV–V (31–305 m). The 5 m floor,
      the post's halving and the UAV's 15 m are ours. The fusion of
      repeated sightings is ours too, and optimistic: one observer's
      errors are not independent from minute to minute. Sources in
      [docs/validation.md](docs/validation.md), *Where the enemy is*.
    - **What it moved** (calibrated company battles, 300 a cell,
      [balance.md](docs/balance.md), *Fourteenth round*): the 3:1 attack
      falls from **95% to 20%**, and the 2:1 from 7% to 0%. It is almost all
      the fire plan: location error alone moves neither attack more than
      2 points. An attacker firing on a plan off by 5% of the range already
      wins only 66%. Adjusting fire does not bring it back, because an
      adjusted mission walks its rounds onto the point it was given, and
      the dug-in defender is not seen in time to give it a better one.
    - ⚠️ **What still gives the true range away:** fire resolves on the
      truth, so a firer's hit chance (in its log line) and an "out of range"
      refusal read off the true range band, not the estimate. Accepted for
      now — the shooter's own sight picture is not what this rule is about.
    - **Open for the author:** with this, 3:1 no longer wins against a
      prepared platoon under the plain drill, which breaks the design
      principle. What should give the attacker the defender's location
      before the assault? Reconnaissance, observation posts for the
      attacker (decision 38 gave them only to the defender in the harness),
      UAVs (backlog 4), or more fire. The 20% itself is also open: a
      position that has been reconnoitred is known better.
52. ⚠️ **Reconnaissance before the attack** (author, 2026-09-29: "let's see
    how sending recon affects this — the use of recon is a lesson worth
    teaching"). Nothing new in the rules: a player already has scouting
    (decision 12), hold fire (decision 6) and standing orders. What is new is
    that the test players use them, so the lesson can be measured:
    - **The drill** (`SquadDrill.recon`, `--recon N` in the harness): the N
      squads nearest the objective go ahead scouting, on hold-fire, while the
      rest of the attack waits at its start line. It is released when the
      side has found something, when the scouts reach the objective, or when
      none of them is left. The scouts then lie up and watch without firing,
      so what they found stays on the map and the guns have eyes.
    - **The fire plan waits for them** (`--fires calibrated-wait`, or
      `wait=on`): the attacker's mortars fire only on what the side has
      seen, never on the planned estimate. The fires lift on the main body's
      approach, not a scout's.
    - **The smart attacker** does the same through the UI (`RECON=1`).
    - **What it moved** (balance.md, *Fifteenth round*; fires planned on an
      estimate, location error on): against the plain drill's defender,
      which opens fire at 400 m, one scout squad with the guns waiting takes
      the 3:1 attack from **20% to 59%**. Two scouts give 33%, three 12%:
      more men out in front is more men under the defender's fire, and they
      count toward the attacker's breakpoint. Waiting while firing on the
      estimate anyway gives 37%. The 2:1 attack stays lost (0–6%).
    - **In the browser it did not pay** (validation.md): the smart attacker
      with `RECON=1` won the 3:1 scenario 1 of 8 (2 of 8 without), and the
      2:1 1 of 8 (2 of 8). Its scout found the defence every time and lost
      6–8 of its 8 men doing it, but the mortars firing on its reports hurt
      the dug-in defence no more than fire on the estimate had. Why the
      harness and the browser differ is not yet traced.
    - **Against a defender with fire discipline it does not work** (the
      Western drill, which holds fire to 200 m): 7% without recon, 1% with.
      The scout walks to 250 m and never sees the dug-in position, because
      a force holding still is found only inside the document's 20 m band.
      The defender's mortars see the scout and destroy it without giving
      anything away, and the main body then goes in blind.
    - **Open for the author:** recon here works only by drawing fire. A
      real patrol finds a position by watching it, with optics, from
      hundreds of metres. The 20 m band is the document's (the movement
      table's hidden-enemy row), and binoculars are backlog 4. Should a
      force that stops and watches, or has binoculars, find a still force
      further out than 20 m? That is the rule that decides whether ground
      reconnaissance can be taught.
53. ⚠️ **A force in position finds a still enemy beyond 20 m** (author,
    2026-09-29: "let observers find a still enemy further than 20 m";
    `GameOptions.stillDetection`, `STILL_DETECTION` in
    [`data/concealment.ts`](src/engine/data/concealment.ts)). The
    document's 20 m band is in its **movement** table: what a force turns up
    as it goes. A force that has not moved this turn now finds a still enemy
    out to **300 m** (the table's visible band), **600 m** from an
    observation post. Its chance is the one it has inside 20 m (cover,
    camouflage, scouting and sector as before), falling off in a straight
    line to nothing at the edge. A force on the move keeps the 20 m.
    - **Why these figures:** the US Army's camouflage trials (Natick, 2009,
      913 observers) put the range at which half the observers pick out a
      camouflaged soldier at a few hundred metres. The 300 m, the 600 m and
      the straight line are ours.
    - It rolls for more pairs of forces, so it is a recorded option: on in
      every scenario (the spec's `stillDetection`, default on),
      `--still-detection` in the harness, and read as off in a recording
      made before it.
    - The drill's scouts can now **bound and observe**: halt `watchTurns`
      turns after each 50 m bound (`--watch N`, `WATCH` in the smart
      attacker).
    - **What it moved: almost nothing** (balance.md, *Sixteenth round*).
      The rule is symmetric, and the defender has more eyes and the mortars.
      A scout halted 300 m out is seen by five defending forces as easily as
      it sees them, and is shelled before it finds anything. Against the
      Western drill the 3:1 attack stays at 1%.
    - **What would move it: optics.** As an experiment only (not in the
      code), a halted scout that sees as far as an observation post (600 m)
      takes that 3:1 attack from **1% to 42%**. Against the plain drill,
      which gives itself away at 400 m anyway, the same change lowers it
      (64% → 35%): the scout finds the position sooner but from twice as far,
      so its report is twice as far off. So the lesson "recon observes
      before it is observed" needs the scout to out-see the defender:
      binoculars (backlog 4). **Open for the author**: should a scout (or any
      force told to scout) carry binoculars that give it an observation
      post's 600 m against a still force, and should that come with a longer
      look (more turns halted) to sharpen the report?
54. ⚠️ **Scouts carry binoculars, and a longer look sharpens a report**
    (author, 2026-09-29: "yes, give scouts binoculars and let a longer look
    sharpen it"). Two recorded options, on in every scenario:
    - **`GameOptions.binoculars`**: a scouting force that has halted (not
      moved, not fired this turn) watches as an observation post does: a
      still enemy to 600 m, a moving one to 1,000 m, and half the eye's
      range error (`lookingThroughBinoculars`).
    - **`GameOptions.keepEyesOn`**: a force in position keeps its eyes on a
      still enemy its side holds fresh (seen this turn or last), within its
      reach and sight, without rolling to find it again. Each turn's look
      is one more estimate, one per observer per turn (decision 51), so a
      report watched for n turns is √n times sharper. A force that moves
      is placed afresh.
    - **The map rings each enemy mark** with the circle it is inside half
      the time (1.18 standard deviations), in play and in the side's
      debrief. The player sees the look sharpen.
    - **The drill** (decision 52) now finds, fixes, then assaults. The
      scouts bound and observe, look for the position at the objective (an
      enemy within 250 m of it), halt while they hold it in sight, and the
      main body waits `lookTurns` consecutive turns of that (`--look N`,
      `LOOK`). A contact lost starts the count again. The guns can wait for
      a sharp report (`aim=N` in `--fires`, `AIM`).
    - **What it moved** (balance.md, *Seventeenth round*; company, fires
      planned on an estimate, location error on, one scout, guns waiting
      for its report): with binoculars and a 4-turn look the 3:1 attack
      wins **86%** against a defender with fire discipline (was 1%) and
      **95%** against one that opens up at 400 m (was 66%). That is what
      perfect intelligence gave before decision 51. The 2:1 attack stays
      lost (1%), and an 8-turn look lifts it to 21%. Binoculars without
      the look do worse (21–26%): the scout finds the enemy at 600 m, the
      company goes at once, and the guns fire on a rough report.
    - The 600 m and 1,000 m are the observation post's (decision 38), the
      halving its range card's (decision 51). All ⚠️ ours.
    - **A look sharpens a report only down to CAT IV's best, 31 m** (author,
      2026-09-29: "95% is a bit high; 85% should be the higher bound";
      `BEST_VISUAL_FIX_CE_M`). Doctrine grades an observer without a laser
      rangefinder CAT IV at best (31–91 m circular error), so looking longer
      stops paying there: the map, compass and eye have errors of their own
      that averaging does not remove. A single close look better than that
      stands. With it the 3:1 attack wins **82–83%** against the Western
      drill (was 85–86%) and 91–92% against the plain script (was 92–95%),
      and the 2:1 attack 0–2% (the 8-turn look's 21% was the unlimited
      sharpening). The plain script's defender opens fire at 400 m and so
      gives itself away; against the Western drill's fire discipline the
      3:1 attack is inside the author's 85%.
    - **Research behind the 85%:** in the Dupuy Institute's 752 division-level
      engagements (1904–1991) attackers at 2.5–2.99:1 won 83%. In 42 French
      engagements of 1944, every attack at 2.71:1 or better advanced. Read
      through search results.
    - **In the browser it has not paid yet** (validation.md): the smart
      attacker's company waits at its start line in the open, below the
      defender's observation posts on the tel, and is shelled while its
      scout looks (1 win in 32). The company has to wait out of sight. That
      is a decision for the company commander, which in the game is Jev's
      (backlog 15), and a dead-ground finder for it is the next thing to
      build.

55. ⚠️ **Losing a command group has effect** (author, 2026-09-29:
    "destroying the command group should have effect";
    `GameOptions.commandSuccession`, `SUCCESSION_TURNS` in
    [`data/c2.ts`](src/engine/data/c2.ts)). Before, a command group out of
    action still passed orders (the order interval was measured from it
    wherever it lay) and the side still called its guns; only morale felt
    it.
    - When a command group goes out of action (its men down, routing or
      surrendered), the forces it commanded (lower echelons within its
      command reach, the morale rules' 300 m for a platoon, 500 m for a
      company) take **no new orders for 2 turns** while someone takes
      over. Their standing orders go on.
    - When it is the side's senior command group, command passes to the
      next in line after the same 2 turns, and meanwhile **the side calls
      no fire**. With none left, it gives no new orders and calls no fire
      at all.
    - Doctrine prescribes a succession of command at every level; no time
      for it was found. The 2 turns are ours.
    - On in every scenario (the spec's `commandSuccession`),
      `--command-succession` in the harness, recorded, and read as off in
      an older recording.
    - **What it moved**: little for an attacker firing on a dug-in
      defender (balance.md, *Nineteenth round*). A defender holds its
      ground on standing orders and hardly needs new ones, and its senior
      command post, which calls its mortars, sits behind the summit where
      it is rarely seen. The scripted commander firing command groups first
      wins the tel's 3:1 attack 25%, squads first 59%.

56. ✅ **Smoke from the tubes costs a fire mission** (author, 2026-09-29:
    "yes, smoke should cost a mission"; `GameOptions.smokeCostsMission`).
    Before, mortar and artillery smoke was free and unlimited once a side
    could call the weapon. Now a screen is drawn from the side's allotment
    (decision 34) like a mission of HE, and is refused when none are left.
    A grenade's smoke is the squad's own and stays free. On by default; a
    recording made before it reads it as off and replays with free smoke.
    The live UI says "no missions left" for smoke as it does for HE.
57. ✅ **A mark stays where the enemy was last seen, drawn as stale**
    (author, 2026-09-29: "keep marks on last seen, mark them with broken
    lines so the player knows they are stale"; `GameOptions.keepStaleMarks`).
    Before, a contact nobody had seen for `contactExpiryTurns` turns was
    dropped from the side's picture, so a force that went to ground simply
    vanished off the map. Now the mark stays at its last-seen position until
    the side sees it again or learns it is gone, and a mark not in sight this
    turn or last is drawn with a broken frame (APP-6 status "anticipated",
    the dashed outline) so the player reads it as where the enemy *was*.
    On by default; a recording made before it reads it as off and replays
    with marks that expire.
58. ✅ **A mission has a deadline, stated in its briefing** (author,
    2026-09-29: "mission will have time limit in briefing (must achieve
    objectives by turn x)"; `GameOptions.timeLimit`). An attack that has not
    won by the end of turn X has failed and the defender wins; a win on the
    last turn stands. The briefing gains "יש להשלים את המשימה עד תור X." (the
    generator writes it from the spec's `timeLimit`), and the turn line reads
    "תור T / X". ⚠️ The deadlines are ours: 45 turns for the Tel Azeka
    battles, 40 for Yokneam. A company attack that scouts first wins in a
    median 32–34 turns (p90 37–45) on the headless runner, so 45 leaves room
    for a patient attack and cuts off one that waits too long; it costs the
    scripted company about 5 points at 3:1 and 2 at 2:1 (docs/balance.md,
    twentieth round). No deadline unless the scenario sets one; a recording
    made before it has none.
59. ⚠️ **The company commander controls the assault by platoon** (author,
    2026-09-29: "do 1 and 2", item 2 from the agent round, which lost 10–14
    men in a turn to an uncontrolled piecemeal assault). Once the company
    goes, each platoon is given a task: assault, base of fire (close to
    small-arms reach and fire from there), or reserve; later it can be
    halted (to ground), pulled back to the start line, or committed. The
    assaulting platoons can bound in turn, one moving while the others halt
    and fire. The assault can wait for the fires to lift: squads stop 200 m
    from the enemy (outside the mortar's 150 m danger close) until the
    commander lifts the fires, which then shift to depth (nothing within
    300 m of the company's squads); with no missions left the fires have
    lifted by themselves. The commander's picture says which of its forces
    is under fire and from what: the firer's mark if the side holds one,
    otherwise only the direction ("an enemy it cannot see, to its east"),
    and "shelled". A platoon is read from the force's name (`BLUE-2-1` is
    the second platoon's first squad). All of it is ours: the 200 m and 300 m
    figures, what a squad can tell of who is firing at it, and the tasks
    offered. These are the company's orders (`CompanyOrders`), not rules
    of the engine; the drill carries them out, and a scripted company gives
    none, so the harness and headless figures are unchanged.
60. ✅ **A defending platoon holds a squad in reserve, and counterattacks
    by drill** (author, 2026-09-30: "a squad in reserve; platoon
    counterattacks by drill", after we found every attack so far had been
    against a defender that never left its holes). The reserve is one of
    the platoon's own squads, held back behind its forward positions
    (`"reserve": true` in a scenario spec, `Scenario.reserves`). It holds
    its position until one of the platoon's forward positions is lost, then
    retakes it without an order: it goes at a run for the nearest enemy
    known on the position, assaults it by the drill's assault rule, and once
    no enemy is known there it takes the position and holds it
    (`SquadDrill.counterattack`, `DrillTask.reserves`). It goes **at once,
    before the attacker consolidates** (author, 2026-09-30): committed in
    the first movement phase after the position is lost, without weighing
    the odds or waiting for fire on the position. It is the platoon's
    drill, so it is scripted, as squads and platoons are; which squad is
    the reserve, and where it stands, are the scenario's. ⚠️ Ours: a
    position counts as lost when its squad is out of the fight or more than
    25 m from it (a squad that moved to its alternate position on purpose
    does not count) and an enemy seen this turn or last is within 50 m of
    it — an older mark, which may be where the enemy no longer is, does not
    start or aim a counterattack; and the Tel Azeka layout, where
    RED-A-1 (whose post saw no ground the other two did not) is pulled back
    to 100–112 m behind the other two, beside the platoon command group.
    The live game plays no drill for a player's side, so there the reserve
    is the defending player's to commit. The balance harness's flat-ground
    battles have no reserve yet, so their tables are unchanged.
    Measured (docs/balance.md, *Twenty-second round*): on the tel with the
    mortars no attacker ever comes within about 150 m of a forward position,
    so no counterattack ever goes in; without them, the reserve goes in half
    the battles, usually once the platoon is already at its breakpoint, and
    helps the attacker. The author kept it at once all the same: when it
    goes is the drill's, and whether a counterattack pays is for play and
    for attacks that reach the position to show.
61. ✅ **A metre climbed costs five metres of a bound, not eight** (author,
    2026-09-30: "set climb cost to 5"). Decision 15 took Naismith's eight,
    the figure for a long hill walk. For a one-minute bound on the 10–25%
    grades of the maps the sources give less: Tobler's hiking function 4–6,
    running studies 3–4; no source has a figure for loaded soldiers
    (docs/validation.md, *Infantry pace under fire*). `SLOPE.climbCostPerMetre`
    is 5 and a game carries its own (`GameOptions.climbCostPerMetre`); the
    reach fan the map draws uses the game's. A recording made before it
    replays at 8. Descent stays free. What it moves is on docs/balance.md,
    *Twenty-third round*.
62. ✅ **Full cover against a shell, by the sources** (author, 2026-09-30:
    "adopt the factors"). Decision 31's hole was several times too
    dangerous and its roof no safer than a hole. From FM 7-90 (men in open
    holes take "only 10 percent" of an air burst's effect; under overhead
    cover "few, if any" casualties) and the WWII British trench figures
    (1/15–1/100 of a standing man's risk): impact, open hole **0.03**, roof
    **0.02**; air burst, open hole **0.13**, roof **0.005** (`SHELL_VS_MEN`;
    were 0.125 / 0.125 / 0.625 / 0.125). Posture in the open is unchanged.
    `GameOptions.shellCover`; a recording made before it replays on decision
    31's (`SHELL_VS_MEN_BEFORE_62`). docs/validation.md, *Mortars against
    men dug in*; what it moves, docs/balance.md, *Twenty-fourth round*.
63. ✅ **Suppression: fire that pins, and an assault that arrives in time**
    (author, 2026-09-30: "shape approved; danger close as risk, roll between
    surrender and rout"). The design and its sources are in
    docs/suppression-design.md; it extends decision 19's layer. Five parts,
    each a `GameOptions` switch, on for a new game and off for a recording
    made before:
    - **S1, reach** (`suppressionReach`): a shell or a bomb suppresses every
      force whose nearest man is within its suppression reach — for the 81 mm
      the whole 25 inside 30 m, half out to 75 m (FM 7-90, B-7) — other
      weapons by the square root of their lethal areas. Before, only the
      forces its lethal blast reached (about 37 m from a force's point).
    - **S2, heads down** (`headsDown`): a pinned force makes and keeps no
      sighting beyond 50 m, is no observer for a fire mission, and fires at
      nothing beyond 100 m; a suppressed force keeps each sighting at even
      odds.
    - **S3, roofs** (`roofsDampSuppression`): a force under a roof takes half
      a shell's suppression (FM 7-90: "harder to suppress").
    - **S4, danger close is a risk**: the engine already rolls every bomb
      against everyone in reach; the 150 m refusal in the headless runner and
      the browser tool is gone. Jev is offered a mark within 150 m of his
      squads flagged DANGER CLOSE; the scripted company keeps its fire on
      until its squads are 100 m from the mark; the live log says "סכנה
      קרובה".
    - **S5, assaulted while pinned** (`assaultNerve`): before an assault is
      resolved each man of a pinned (−20) or suppressed (−10) defender tests
      his nerve; a force that breaks surrenders or runs on an even roll.
    ⚠️ Ours: the half at 75 m, the scaling by lethal area, the roof's half,
    50 m and 100 m for heads down, the even odds for a suppressed look, 100 m
    for the lift, −20 / −10 and the even roll. **As built, a force within a
    round's suppression reach also counts as bombarded**, and loses decision
    19's nerve for it (5 a turn) — which widens that loss with the reach;
    the author has not ruled on it (docs/balance.md, *Twenty-fifth round*).
    He answered with decision 64.
64. ✅ **Nerve lost to fire depends on cover** (author, 2026-09-30: "nerve
    lost for a force in the open should be far more severe than for a dug
    in force"). The nerve the enemy's fire itself costs a man each turn —
    decision 19's `firedOn` (1) and `bombarded` (5) — is multiplied by his
    force's cover: **×2 in the open, ×1 behind partial cover, ×0.3 in a
    hole, ×0.15 under a roof** (a position prepared before the battle); the
    prepared defender's 0.75 still applies on top. ⚠️ The four factors are
    ours — the open about thirteen times a prepared position. Losses to
    casualties, leaders and the rest are unchanged. `GameOptions.nerveByCover`
    (`NERVE_BY_COVER`, `fireNerveFactor`); a recording made before it reads
    it as off. What it moved: docs/balance.md, *Twenty-sixth round*.
    **The open is ×1 since decision 66.**
65. ✅ **A pinned force still fires within rifle range, at a penalty**
    (author, 2026-09-30: "try pinned firing within rifle range at a
    penalty"; it replaces decision 63's 100 m limit on a pinned force's
    fire). A pinned force fires out to the small-arms table's last band
    (400 m) and, beyond 100 m, at half its chance again — over the parapet,
    with little aim — on top of the pinned half accuracy (`HEADS_DOWN`,
    `aimFactor` on direct fire). ⚠️ The 100 m and the half are ours. Its
    sight is unchanged (nothing beyond 50 m). `GameOptions.pinnedFiresAtRange`;
    a recording made before it plays decision 63's 100 m. What it moved:
    docs/balance.md, *Twenty-seventh round* — little.
66. ✅ **The balance targets, the open at ×1, an attacker's breakpoint at
    40%** (author, 2026-09-30: "adopt all three: 55–70% target, open ×1, 40%
    breakpoint"). After the command-post fix a 3:1 attack on the tel won
    about 22%, and no single lever brought it near the 85% ceiling
    (docs/balance.md, twenty-eighth to thirtieth rounds). Research put what
    an attack at 3:1 on a prepared position should win at about 55–70%
    (docs/validation.md, *What an attack at 3:1 should win*). Three parts:
    - **The targets** (the design principles, below): 3:1 on a prepared
      position 55–70%, 75–85% only with surprise or strong suppression; 2:1
      30–45%.
    - **Nerve in the open ×1** (decision 64 had ×2): still about seven times
      a prepared position. `GameOptions.nerveInOpen`; a recording made before
      replays at 2 (`NERVE_IN_OPEN_BEFORE_66`).
    - **An attacking side gives up at 40%** of its men down, broken or fled
      (decision 44 had 30%, from the historical breakpoints; this departs from
      that source to meet the target). `GameOptions.attackerBreakpoint`; a
      recording made before replays at 0.3 (`ATTACKER_BREAK_BEFORE_66`). A
      defence still gives up at 50%.
    The scripted company the balance is measured with now sends **three
    scouts** (ours, `--recon 3`). What it gives: docs/balance.md,
    *Thirty-first round*.
67. ✅ **An attacking side gives up at 30% again** (author, 2026-10-01). The
    reference plans (docs/balance.md, thirty-seventh to fortieth rounds) put
    a failed attack's cost to the attacker at 19–28% killed and wounded under
    decision 66's 40%, at or over the top of the sources' 10–25%
    (docs/validation.md, *Loss exchange in attacks*); at 30% it is 16–22%.
    Closeness to real-life outcomes is the guideline (author), so the
    breakpoint returns to decision 44's figure, and the win targets are to be
    set for small-unit attacks separately (pending). `SIDE_BREAK_BY_POSTURE`;
    a recording carries its own breakpoint. Question set `2026-10-01.2` (the
    commander's picture states it).
68. ✅ **Win targets for small-unit attacks** (author, 2026-10-01: "I
    accept the new bands"). Squad-to-company attacks on a prepared position:
    3:1 **40–55%** (Rowland: 54% at 3:1 without surprise, all positions; a
    prepared position ×1.65 puts 3:1 at about 1.8:1 in effect, about 46%),
    **70–75%** with surprise or strong suppression (Rowland's 76%); 2:1
    **20–35%** (no small-unit source; the division-level bands' 25-point
    step below 3:1 kept, as doctrine's "below 3:1 usually fails" — a
    judgement). Judged on the reasonable plans' median, with losses against
    the sources (docs/validation.md, *Loss exchange in attacks*). Where it
    stands at decision 67: the standard measurement 49% and 27%, the
    reasonable plans' median 42% and 24% (docs/balance.md, fortieth round).
    `TARGETS` in `src/sim/balance.ts`.
69. ✅ **What the traits do beyond morale** (author, 2026-10-02 — the
    traits session decision 19 left open). **Built 2026-10-03 (decision 82).** Each
    effect applies **per soldier**, to his own actions, and is worth up to
    **±20%** at a trait of 1 or 10 against the average (5–6):
    - **Strength**: pace under load (climbing, long rushes) and pace while
      carrying the wounded.
    - **Agility**: harder to hit on a rush, quicker to cover under fire,
      and pace.
    - **Wisdom**: spotting the enemy, and noticing mines and traps.
    - **Intelligence**: accuracy.
    - **Luck**: when he is hit, a chance it misses after all, and a shift
      from a kill towards a wound.
    - **Charisma**: unchanged (leadership, and steadying comrades out of a
      leader's reach).
    - **A force moves at its slowest man's pace** — on a rush only, as
      built (author, 2026-10-03, decision 82).

    ⚠️ Ours, to settle when it is built: the ±20% scaled linearly from 5.5
    to the extremes; luck's shift applied to decision 26's d10 (no new
    die); where a roll is made once for the force (detection), the trait of
    the man it belongs to (the best observer) rather than a roll per man —
    a new draw per man would reorder the rng; a `GameOptions` flag, needing
    `morale` (the traits are drawn only with it). **As built (decision
    82):** on for a new game and off for a recording made before it, like
    every switch since decision 75; it did move the balance (the slowest man
    at every gait cost the 3:1 attack 14 points), and the author ruled it
    to a rush. The traits are drawn as ⌈2d10 ÷ 2⌉, whose mean is 5.75, not
    5.5: an average force leans about 1% up on each effect.
70. ✅ **Fire support is set per scenario, not by the odds** (author,
    2026-10-02, answering the question of 2026-09-28). An attacker at 3:1
    brings what its scenario spec gives it; no rule scales missions or
    tubes with the force ratio.
71. ✅ **Fatigue, by strength** (author, 2026-10-02, after a survey of
    Combat Mission, Close Combat and Battle Brothers). **Built 2026-10-03 (decision 82).**
    Each man keeps a fatigue count that rises with running, climbing and
    being under fire and falls each quiet turn; his strength sets how much
    he takes before it tells. A tired man moves slower and shoots worse.
    ⚠️ Ours, to settle when built: the costs, the recovery, the thresholds
    and the penalties — measured, with the sources where they exist. One
    counter per man, updated at end of turn: no sight lines, no new draws.
72. ✅ **Who fires first, by agility** (author, 2026-10-02; Battle
    Brothers' initiative, Jagged Alliance 2's interrupts). **Built
    2026-10-03 (decision 82).** Suppression lands with the fire (decision 63), so the order of
    the fire phase matters; forces fire in order of their men's agility.
    ⚠️ Ours: posture still comes first (a force already aiming beats one on
    the move), and how a force's agility is read (its men's mean). One sort
    of the forces a turn.
73. ✅ **Every soldier has an MOS, with his kit and his skill** (author,
    2026-10-02). **Ruled, not built.**
    - **The MOS list and each squad's makeup come from doctrine** — the
      manuals' squad and platoon organisation, cited (doctrine-handoff.md).
    - **Kit**: his **weapon** (each man fires his own weapon's table, so a
      squad's fire changes as its gunner falls), the **weight** he carries
      (read by decisions 69 and 71), his **ammunition**, used up as he
      fires (this settles backlog 12 at the man), and **equipment** —
      binoculars, radio, night sights, medical kit, demolitions — which is
      what makes a skill possible.
    - **A comrade takes up a fallen specialist's weapon** after a turn, at
      his own skill.
    - **A skill level per man in his MOS**, drawn like the traits and grown
      by learning (decision 74). Among the skills: the **medic** (slows a
      serious wound's bleeding, returns a light wound to the fight), the
      **sapper** (lays a charge faster than decision 16's two turns, clears
      mines more safely), the **marksman and MG gunner** (accuracy with his
      own weapon, apart from intelligence).

    ⚠️ Ours: every number. Weapons move from the force to the man, which
    changes how fire is resolved; the per-man hit roll is already there
    ("hit% × fit soldiers", rolled per soldier), so the draws stay one a
    man. Ammunition is one counter a man.
74. ✅ **Campaign traits: learning, quirks, relationships** (author,
    2026-10-02). **Ruled, not built; they matter with campaigns (backlog
    16).** Men who survive a battle **learn** — their MOS skill grows, at a
    rate set by **wisdom** (Jagged Alliance 2). A few rare **named quirks**
    with a fixed effect (Battle Brothers: Fearless, Iron Lungs, Night
    Blind). **Relationships** — liking and disliking — **within a squad
    only**, felt in morale when a friend falls. ⚠️ The squad bound is a
    cost rule: relationships grow with the square of the men, so never
    company- or campaign-wide.

    **Cost as the game scales (2026-10-02, measured: ten company battles
    in 1.5 s).** What makes a turn expensive is sight lines between pairs
    of forces. Decisions 69–74 add none: each reads a man's values once an
    action or once a turn, which stays trivial at a brigade's 3,000 men.
    Keep it so: a force's summaries (slowest pace, best observer, fire
    order) computed in upkeep from its men's current values, never cached on
    the unit; **no sight lines per soldier** (Combat Mission's relative
    spotting multiplies them by 50–100 at battalion); **no new die per man**
    where the force rolls once today (cost, and it reorders the rng). The
    first is checked: `src/engine/scaling.test.ts` fails when squads five
    times larger ask for half as many sight lines again.

75. ✅ **Direct-fire HE follows the shell's rules** (author, 2026-10-03:
    "put it on the same rule set as indirect fires with respect to logic").
    Until now decisions 29–31, 62 and 63 applied to indirect fire only, so
    a tank round, an RPG or a rifle grenade ignored cover, posture and
    roofs, caught only the force it was aimed at, and suppressed no one
    beside it. With `GameOptions.directHeAsShell` (on for a new game; a
    recording made before it reads it as off), a round that hits:
    - **Counts posture and cover against men** as an impact-fuzed shell
      does (`shellFactor`): ×½ behind partial cover, ×0.36 once down, a
      hole ×0.03 and a roof ×0.02 (decision 62's figures, or decision 31's
      under `shellCover: "before62"`).
    - **Catches whoever is in its blast**, the firer's own side too,
      measured from the target. An anti-armour round (`usesArmorTable`)
      connects only with the vehicle it was aimed at; plain HE rolls for
      any vehicle's tracks in its blast, as decision 3 has a shell do.
    - **Puts the men it came down on to ground** (`downUnderShelling`,
      decision 30) until they move. Direct fire is taken shot by shot, so
      the next shot that turn finds them down; a shell's rounds that land
      in one turn find them as they were.
    - **Suppresses within its reach** (decision 63, S1, under
      `suppressionReach`): forces its blast reached take a direct round's
      15, and those beyond it but within the weapon's suppression reach
      take `roundSuppression` scaled from a shell's 25 to a direct round's
      15. A roof halves all of it, the target's too (S3, under
      `roofsDampSuppression`). A miss suppresses the target as before; an
      RPG against armour has no lethal area against men and suppresses
      only the forces in its blast.
    - **Unchanged:** the to-hit roll, the target's own suppression figures
      (15, 15 more on a hit), and the nerve. Direct HE costs decision 19's
      `firedOn`, not `bombarded`.
    - ⚠️ **The factors are a shell's.** They come from lethal areas and
      trench figures for 105–155 mm rounds falling from above, applied
      as they stand to a flat-trajectory round. A round that goes in
      through a window or a firing slit is decision 77.

76. ✅ **Buildings take damage: intact, damaged, rubble** (author,
    2026-10-03, option "3 states"). The document says nothing of
    structures; until now a building was cover and a sight-line block that
    nothing could touch. With `GameOptions.structuresTakeDamage` (on for a
    new game, off for a recording made before it):
    - A round that hits a force in a building, or a shell that lands on
      one, wears it down in damage points (`STRUCTURE_DAMAGE`): artillery
      15, tank round 10, mortar 4, RPG 3, and the 40 mm grenade nothing.
      Small arms do nothing, and an air burst goes off above the roof
      and does not touch it. A round aimed at a vehicle beside a house
      does not strike the house.
    - The damage is done after the fire that caused it: everything due
      in a turn lands on the roofs as they were, and a direct round's
      blast and suppression find the men under the roof as it was.
    - **Damaged** at 10 points, **rubble** at 100, for a 100 m² house;
      a larger building takes proportionally more (never under half).
    - A damaged building is still full cover, but its roof is holed: a
      shell finds the men as in an open hole. Rubble is **full cover with
      no roof**, 2 m high for sight lines. FM 3-06.11: a town reduced to
      rubble is "a stronger position for defending troops than it was
      before".
    - The map the battle was set on is never changed: the game keeps a
      live view (`game.terrain`) with the damage on it, and a recording
      carries the original and replays the damage. The map draws a
      damaged building dashed and rubble pale; both sides see it.
    - The log and the debrief say "המבנה נפגע" / "המבנה קרס להריסות".
    - ⚠️ One tank round damaging a house is sourced: FM 3-06.11, "one
      MPAT round normally creates a breach hole in all but the thickest
      masonry". **How many rounds bring a house down is ours**: no source
      gives it ("large expenditures of ammunition are required").
    - **A tank round breaches the wall** of the building its target is
      in. The men inside are then behind partial cover (×0.5, or their
      posture if lower), not under a roof (×0.02). FM 3-06.11: tank HEAT
      is "large enough to displace enough spall to inflict casualties
      inside a building" (`SPALLS_INSIDE`; ⚠️ the 0.5 is ours).
    - **A building brought down kills a quarter of the men inside it**
      (`COLLAPSE_KILLS`). Arnold et al. 2004, 29 bombings: immediate
      mortality was 25% where the structure collapsed, and 4% in the
      open. The log says "נקבר בהריסות", to whoever may know of the force.
    - Not built: rubble slowing movement, walls breached, charges against
      buildings.
77. ✅ **Critical hits: through the window, the slit or the roof**
    (author, 2026-10-03: "a shell going directly through a window and
    doing full damage to people inside"; scope: tank rounds, RPGs and
    rifle grenades, firing slits too, and indirect fire through a roof;
    effect: amplified). With `GameOptions.criticalHits` (on for a new
    game, off for a recording made before it):
    - **Direct fire:** each round that hits a force in a building may have
      gone in through a window; one that hits a force in a position
      prepared before the battle, through its firing slit. The chance is
      by weapon and range (`CRITICAL_CHANCE`), a slit about a third of a
      window: tank round 85% / 40% to 500 m, 50% / 15% to 1,000 m; rifle
      grenade 35% / 10% to 50 m, 15% / 5% to 150 m. **Not the RPG**: FM
      3-06.11, read on the page, says a shaped charge "passing through a
      window wastes much of its energy on the back wall", and aims it
      beside the window instead.
    - **Indirect fire:** an impact-fuzed round that lands on a building
      goes through its roof at 2% for a mortar bomb and 30% for a 155 mm
      shell (`ROOF_PENETRATION`). An air burst never does. FM 3-06.11:
      even with a delay fuze the 60 mm "cannot penetrate most rooftops",
      and the 81 mm gets through only "the roofs of light buildings".
    - **What it does:** the burst is among the men inside. Each man's
      blast chance is the open ground's ×**2.5**, capped at 1
      (`ENCLOSED_BLAST_FACTOR`). Cover and roof count for nothing against
      it. The sources put a room at ×2 to ×6 the open air: ×2 from 29
      bombings pooled (Arnold et al. 2004), ×6 from bus bombings
      (Leibovici et al. 1996). Other forces in the blast are resolved as before. Only infantry
      takes one: a command group has no blast roll to amplify.
    - The log and the debrief say "חדר דרך חלון או חרך" / "חדר דרך הגג".
    - ⚠️ **Every figure is ours.** No source gives the chance a round goes
      in through a window, or through a roof by fuze. They come from
      dispersion: a tank gun's 0.2–0.3 mil; FM 3-22.31 on the M203, which
      can put a grenade through a window at about 125 m but whose gunners
      "cannot consistently hit windows at 50 m when forced to aim and fire
      quickly"; an RPG-7 hits a tank-sized target about half the time at
      200 m. The ×2.5 is anchored on bombs that killed 7.8% of their
      casualties in the open and 49% in buses (Leibovici et al., J Trauma
      1996). A room with windows is less enclosed than a bus, so the
      factor was set at 2.5, inside a ×2–3 range, rather than ×6.
78. ✅ **Armour by weapon, by vehicle class and by the side struck**
    (author, 2026-10-03, option "+ vehicle types"). The document's table
    gives every weapon a 20% penetration from any side. With
    `GameOptions.armour` `research` (the default; `document` plays the
    table, and a recording made before it reads `document`):
    - **Vehicle classes:** `mbt` (Merkava 4, T-72), `heavyApc` (Namer,
      Achzarit), `lightApc` (M113), `soft` (a truck). `makeVehicle`'s
      sixth argument and a scenario spec's `vehicleClass`; absent, a tank.
    - **The side struck** is read from the hull's heading and where the
      round came from: front within 45°, rear within 45° of behind, side
      otherwise. A vehicle's hull now turns to face the way it drives,
      except when it withdraws or routs: armour reverses out of contact,
      keeping its front to the enemy it leaves (⚠️ ours).
    - **Penetration** (`PENETRATION`), front / side / rear against a tank:
      tank round 40% / 100% / 100%, RPG 2% / 40% / 90%; a light APC or a
      truck is penetrated every time. An anti-tank mine strikes the belly:
      20% against a tank, 90% against an M113. A track keeps the table's
      70% whatever the weapon. Where it hits and what a penetration does
      stay the table's.
    - **A penetration kills crews:** each crewman is put out at 35%
      (`CREW_OUT_ON_PENETRATION`), which is 1.4 of a crew of four. This
      applies to every penetration but the track's, and replaces the
      table's crew rows. 2006 Lebanon, read on the page: 22 Merkavas
      penetrated and 23 tankers killed. The table had given about 0.2
      crew hits a penetration. ⚠️ The 35% is ours.
    - **A thin-skinned vehicle burns:** a penetration destroys an M113
      outright at 30% and a truck at 70% (`CATASTROPHIC_ON_PENETRATION`),
      on top of the table's own 5% on the ammunition.
    - **Plain HE** (mortar, artillery, rifle grenade) within its blast of an
      M113 sends fragments in at 50%, and of a truck at 80%
      (`HE_FRAGMENTS_IN`); a tank and a heavy APC keep the document's
      track roll.
    - ⚠️ **The armour of a Merkava 4 or a Namer is classified**, so their
      columns are estimates. The penetrations are published figures (PG-7VL
      500 mm, Kornet 1,000 mm, 120 mm APFSDS 700–850 mm), but they were read
      through search summaries and not checked against the pages. They are
      turned into a chance by a logistic curve whose spread, a tenth of the
      armour, is ours. 2006 Lebanon agrees: about 40–45% of Merkavas hit by
      ATGMs were penetrated, and 11 of 14 APCs.
    - Not built: an ATGM (Kornet) as a weapon, heavy machine guns against
      light vehicles, a direct artillery hit on a vehicle, active
      protection (Trophy), passengers in an APC.

79. ✅ **The research figures, checked against the sources** (author,
    2026-10-03, each item chosen after the third pass on
    docs/validation.md). With `GameOptions.checkedFigures` (on for a new
    game; a recording made before it reads it as off):
    - **Tank HE: 280 m²**, the 105 mm round's lethal area on impact. The
      390 m² used before was its air-burst figure in the same source.
    - **The RPG against armour, by the 1976 US Army trial** against a
      moving tank-sized panel: 100% to 50 m, 96% to 100 m, 51% to 200 m,
      22% to 300 m, 9% to 400 m, 4% to 500 m, and nothing beyond.
    - **An anti-personnel charge is a Claymore**: a 60° fan facing the
      way the enemy came, 30% to 50 m and 10% to 100 m. The force that set
      it off is always in the fan.
    - **An anti-tank charge is a 155 mm shell IED**: 971 m² against men,
      and only the vehicle within 20 m of it. The document's charges
      reached 200 m, all round.
    - **A mortar bomb finds men down at ×0.5**, not ×0.36. FM 7-90:
      "almost twice as effective" against standing men as prone. The 0.36
      stays for the 155 mm.
    - **Suppression by FM 7-90's table**:
      - 81 mm: 30 m probable, 75 m even, a quarter to 125 m;
      - 155 mm: the heavy mortar's row, 65 m / 125 m / 200 m;
      - other weapons: scaled from the 81 mm's row as before.
    - **Plain HE reaches a vehicle's tracks only within its blast against
      men**, not the document's 100–200 m. On the urban test bed this cut
      BLUE's vehicles lost to mortars from 53% to 25%.
    - ⚠️ Ours:
      - the quarter out to "little";
      - the heavy mortar's row standing for the 155 mm;
      - the 20 m reach of a charge against a vehicle;
      - the fan facing the way the enemy came.

      The lethal areas themselves rest on one 2025 forum post that derives
      them from BRL 530, since JMEM is classified (docs/validation.md).
    - **What it moved** (balance.md, *Fifty-first round*):
      - the 3:1 tel attack 43% → 49%;
      - the 2:1 tel attack 29% → 39%, **above decision 68's 20–35%**;
      - the urban attack 38% → 17%.

80. ✅ **ARES Special Report No. 3's indirect-fire figures** (author,
    2026-10-03: "check it out", then all three chosen). The report is
    Dullum, Jenzen-Jones et al., *Indirect Fire*, Armament Research
    Services, 2017; docs/validation.md has what was read in it. With
    `GameOptions.aresFigures` (on for a new game; a recording made before
    it reads it as off), on top of decision 79:
    - **Lethal areas from ARES**, Tables 1.1–1.2: **155 mm 665 m²**
      (was 971) and **81 mm 250 m²** (was 476). A shell IED is 665 m².
      Tank HE stays at decision 79's **280 m²**. ARES gives 495 m² for a
      105 mm artillery round, but GICHD's *Explosive Weapon Effects*
      (2017) found "tank munitions … a more limited lethal area than
      others" (author, 2026-10-03, after reading it). The report is
      citable, where the old figures were a forum post; but it calls these
      "fragmentation" areas and never defines them.
    - **A gun's first-round CEP by its range**, Table 3.1: 95 m at 15 km,
      115 m at 20 km, 140 m at 25 km, 275 m at 30 km. Until a scenario
      says otherwise, the guns are 20 km back (⚠️ ours), so the first
      round is **115 m**, not 270 m. Adjusting still halves it to 50 m.
    - **An air burst ×1.15** against standing men, not ×1.28. ARES's
      rocket table puts the air burst's lethal area at 1.08–1.22× the
      impact's. Partial cover still gives nothing against it, and an open
      hole takes a tenth (×0.115).
    - Suppression reach still follows FM 7-90's table for the mortar and
      the 155 mm. For other weapons it scales with the square root of these
      lethal areas, against the 81 mm's 250 m².
    - **What it moved** (balance.md, *Fifty-second round*):
      - the tel attacks: 3:1 49% → 41%, 2:1 39% → 36%;
      - **explosives' share of losses: 70% → 64%, below decision 43's
        75%**;
      - the urban attack: 36% with tank HE at 495 m², and **18%** at the
        280 m² kept after GICHD.

81. ✅ **Rulings of 2026-10-03, after decisions 75–80** (the author,
    answering the open questions one at a time):
    - **Explosives' share of losses: a 60–80% range**, not 75% (amends
      decision 43). The tel's 64% is inside it.
    - **The 2:1 attack at 36% is accepted**, one point over decision 68's
      20–35%.
    - **Direct HE costs a bombardment's nerve**, as a shell does.
      `GameOptions.directHeBombards` is on for a new game, and a recording
      made before it reads it as off. A tank round, RPG or rifle grenade
      now counts as decision 19's `bombarded` (5 a turn, scaled by cover
      under decision 64), not only `firedOn` (1).
    - **Several types of house**, each with its own strength. To be
      defined with the urban combat work. Until then a house of 208 m²
      takes about 20 tank rounds, and none comes down in the urban battle.
    - **Force quality as a matrix.** Ruled; built as decision 83. Three levels of
      force type (irregular, regular, elite) against three of experience
      (inexperienced, experienced, very experienced). Morale is affected
      by both, as well as by the other factors already described. Today's
      breakpoints (30% attacker, 50% defender; decisions 44, 49, 67) are
      **a trained, regular, experienced force's**, and the other eight
      cells are measured against it. The literature's warning stays
      recorded: no study establishes fixed breakpoints, and McQuie found
      most forces quit under 10% (docs/validation.md, *third pass*). The
      game already carries `experience` (green, regular, veteran, elite)
      and `motivation` per force; the matrix replaces or maps them.
    - **The traits** (decisions 69, 71, 72): **go-ahead to build**, after
      this branch is merged and discussed.
82. ✅ **The traits, built** (2026-10-03: decisions 69, 71 and 72;
    `src/engine/traits.ts`, `data/traits.ts`). Three `GameOptions`
    switches, each on for a new game and off for a recording made before
    it: `traitEffects` (69), `fatigue` (71) and `agilityFireOrder` (72).
    All three act only with `morale`, which draws the traits. The game marks
    each force's men at `addUnit` (`Unit.traitRules`), so the combat
    functions read the switch off the force. No rule here draws from the
    rng.
    - **Pace (69), ruled by the author on the measurement:** on a rush (a
      run), agility × strength set each man's pace, and **a force rushes at
      its slowest man's**. Walking is the gait's own. The slowest man at
      every gait cost the tel's 3:1 attack 41% → 27% and the 2:1 36% →
      22%, with battles running out of time (balance.md, fifty-third
      round); at a run only, 41% and 34%. ⚠️ Ours: strength's "climbing"
      is left to fatigue (a metre climbed tires a man) rather than pace;
      carrying the wounded waits for a casualty-evacuation rule.
    - **Agility (69):** a force that ran is hit at ×0.8–1.2 by its men's
      mean (the hit is rolled before the man it lands on is chosen). Under
      a shell, men on their feet are moved toward the "down" figure by up
      to a fifth (and the least agile away from it). ⚠️ Ours: both on the
      mean.
    - **Wisdom (69):** the force's best observer's, on every detection
      chance and on finding charges.
    - **Intelligence (69):** each man's own aim (small arms and the
      assault's fire).
    - **Luck (69):** read off decision 26's d10 taken as one continuous
      draw (the same draw `rng.die(10)` makes): a lucky man is missed after
      all on the bottom 2 × his luck's share of the faces (up to 20% of
      the hits on him), and the kill band shrinks or grows by up to a fifth
      of itself. Without the switch the faces are exactly the d10's.
    - **Fatigue (71):** a run 3 points, a metre climbed 0.1, a turn under
      fire 1, a quiet turn −3; tired at 6 and exhausted at 12, ×0.8–1.2 by
      strength; tired ×0.9 and exhausted ×0.75 on pace and aim, at any
      gait. After Ito et al. 1999 (hits −26% after running, back within
      1.5 minutes) and Hunt 2016 / Billing 2015 (repeated sprints under
      load). ⚠️ The points and thresholds are ours (docs/validation.md,
      *Traits and fatigue*).
    - **Fire order (72), within a side** (author, 2026-10-03): initiative
      still picks the side; inside it, still forces first, then by their
      men's mean agility (`Game.firingOrder`). The engine's fire under
      standing orders and the scripted drill follow it. ⚠️ In the hotseat
      the player still fires his forces in the order he chooses.
83. ✅ **The force-quality matrix, built** (2026-10-04: decision 81's
    matrix; the author: "the new matrix maps into experience /
    motivation"). `FORCE_QUALITY` in `data/morale.ts` reads each cell of
    force type (irregular, regular, elite) × combat experience
    (inexperienced, experienced, very experienced) onto the two dials
    decision 19 already had. `forceQuality({ type, experience })` returns
    them, and a force is dressed with them **before** `addUnit`, which
    draws its pools and records it. The regular, experienced cell is
    `normal` / `regular`, today's force, so a game that names no quality
    plays and replays exactly as before. The breakpoints (decisions 44, 49,
    67) stay that cell's. No new rule, no new draw, no recording change. A
    scenario spec takes `"quality": {"type": …, "experience": …}`
    (`make-scenario.py`), with a `motivation` beside it overriding the
    cell's (a fanatical irregular). The harness takes `--quality
    SIDE=type/experience` (`scenario-sim`).
    - ⚠️ **The mapping is ours.** Type sets the motivation floor
      (irregular `low`, regular `normal`, elite `high`). Combat experience
      sets `experience` a step a level (green, regular, veteran), and an
      elite force's training is worth a step more (regular, veteran,
      elite). No two cells map alike, and a step up on either axis never
      costs a force nerve (`morale.test.ts` pins both).
    - **Measured** (docs/balance.md, fifty-eighth round; tel 3:1, 400
      battles a cell): the attacker's cells give 32–53% wins, and the
      defender's cells give the attacker 14.5–65.5%, with every row and
      column ordered (pooled; ±2.5 one standard error). The losses hardly move: quality decides when a side
      gives up. For the author: is the spread right? (Answered by decision
      84.)
84. ✅ **The quality gap** (2026-10-04, the author, after the sources
    were checked: "given the majority of casualties are from HE, personal
    quality matters little in most things other than morale. It should be
    on a regular distribution, where the middle, which represents a clash
    of equal forces, has zero effect and the extreme (elite against
    irregular) a very large effect, especially in special operations where
    artillery and other support weapons aren't involved"). The cell now
    travels on the force (`Unit.quality`, set with the rest by
    `forceQuality`). `GameOptions.qualityGap` is on for a new game and off
    for a recording made before it.
    - **Where it acts:** a force's small-arms chance against another, in
      fire, covering fire, the assault's fire and the assault's reply,
      multiplied by `qualityGapFactor`. Shells, mortar bombs, tank rounds,
      RPGs, rifle grenades and hand grenades are untouched. Nerve stays
      decision 83's.
    - **Its shape:** each force scores −2 to +2 (type step plus experience
      step; regular and experienced, or no quality given, is 0). The
      factor is ×3 ^ (sign(gap) × bell(gap) / bell(4)), with
      bell(g) = 1 − exp(−g² / 8): the normal curve turned over. A gap of 0
      is exactly ×1, 1 step ×1.16, 2 ×1.65, 3 ×2.36, 4 ×3, and the inverse
      the other way. σ = 2, the ×3 at the widest, and type and experience
      counting one for one were ours, and **the author accepted them on the
      measurement** (2026-10-04: "looks good").
    - **Measured** (docs/balance.md, fifty-ninth round; tel 3:1, 400
      battles a row). Elite, very experienced against irregular,
      inexperienced: the attack wins **85%** with mortars and **100%**
      without. The other way round it wins **4%** and **0%**, and without
      mortars the irregular attacker loses **10.75** men for each elite
      man. That is close to Mogadishu 1993 (18 US dead and 73 wounded
      against roughly 900–1,700 Somali casualties). Mortars damp the gap,
      as the ruling expects. The full 9-cell grid on each side, against a
      regular, experienced enemy, is in balance.md.
    - **Accepted with it:** between equals the gap is zero, but nerve is
      not. Two elite forces give the 3:1 attack 24.5% with mortars and 45%
      without; two irregular ones give 60% and 33.5% (baseline 40%).
      Decision 83's morale mapping is absolute, so a steady defender
      outlasts the shelling.

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
  so replays, networked play, and recordings stay reproducible. An AI player
  (backlog 15) is not an exception to this: it chooses *decisions*, in the same
  places a human chooses them, and every outcome is still rolled by the engine.
- **The battle teaches the lessons leaders should learn** (author,
  2026-09-28). The outcomes a force ratio and a preparation give should come
  out of the rules the way doctrine and history say, so a player learns them
  by playing:
  - **A prepared position is what gives the defender its superiority**, and
    what makes an attack need **3:1**. Attacked below it, a prepared defender
    should hold; at 3:1 the attack should succeed more often than not, and
    only just. **The targets for small-unit attacks** (author, 2026-10-01,
    rules decision 68, from Rowland's small-unit data in validation.md, *What
    an attack at 3:1 should win*): a 3:1 attack on a prepared position wins
    **40–55%** — 70–75% with surprise or strong suppression, the 85% of
    decision 54 a ceiling — and a 2:1 attack **20–35%**. They are judged on
    **reasonable plans**, not one plan (docs/balance.md, thirty-seventh
    round), and against real-life losses as well as wins. Decision 66's
    55–70% and 30–45% were read from division-level tables, and stand for
    battles of that size.
  - **In a meeting engagement nobody has prepared anything**, so nobody has a
    defender's bonus: the larger force should win. What the ground offers —
    a building, a crest — still favours whoever reaches it first.
  - **Fortifying during the battle belongs to the higher echelons**, whose
    battles last hours. A squad-to-company fight is over before anyone digs
    (rules decision 50: 30 minutes to a prone shelter, 90 to a foxhole).
  - **The scenarios so far are test beds**, not the battles the game will
    ship; real ones come later (backlog 17).

  Measured against these in validation.md, *The design principles, measured*.

## Roadmap

### Near-term

- **Stage 2 — browser UI (hotseat).** Interactive map, NATO-symbol tokens,
  fog-of-war, turn/phase panel, driving this engine.
- **Stage 3 — networked multiplayer** (per-side fog-of-war) and
  **single-player vs AI**. Both already supported by the seed-driven design.
  The AI opponent and backlog item 13 (OPORD mode) are the same engine seam
  seen from two directions: something other than a human emitting the actions.
  The opponent itself is specified in **backlog 15** — which also covers the
  simulated subordinates under *every* player once echelons scale, and names
  what neither is allowed to touch.

  **Single-player, first cut (2026-10-05):** the picker offers *מול המחשב*
  (`?vs=computer`). The player attacks; the computer takes the side that is
  not attacking and holds it as the headless harness's defender does
  ([`computerSide.ts`](src/app/computerSide.ts)): its mortars planned on the
  dead ground in front of it before the battle and called on what it has
  seen, its squads fighting by the plain drill, holding fire to the drill's
  range, covering when idle, the reserve retaking a lost position. It reads
  only its own side's picture, as the drill always has. Its activations play
  out at once with no handoff, and what it does reaches the player's log
  through the same wording as a player's own fire (`DrillReport` in
  `drill.ts`). Not yet: the computer as the attacker, and a choice of side.

  **Save and resume (2026-10-05):** a battle in progress is kept in the
  browser after every change ([`session.ts`](src/app/session.ts)): its
  recording, where play stands in the turn, the live log, and the
  computer's drill memory. The picker offers it as *המשך קרב שמור*, and a
  reload comes back to it; a hotseat battle resumes behind the handoff
  screen for the side to act. Resumed mid-turn, a battle goes on exactly as
  if it had never stopped — `computerSide.test.ts` pins it, and it was driven
  in the browser to the same 102 actions both ways. The save carries the
  game's state fingerprint (`stateDigest`): one that no longer replays to it
  — the rules have changed since — is refused with a reason on the picker
  and set aside, never resumed as another battle. A reload resumes only a
  battle that has been saved (`&saved=1`); a fresh pick stays fresh. One
  battle is kept; it is cleared when the battle ends. Not yet: several saves, or a save file to
  carry to another device (backlog: user-generated content).
- **Stage 4 — the app proper: mobile and desktop.** The browser build is the
  development shell. What ports for free is the part that matters: the engine
  has **no runtime dependencies**, no DOM and no node globals — `build:engine`
  emits it standalone with `"types": []` precisely so it cannot acquire any —
  so every platform runs the same rules and the same seeded rng, and a
  networked game can send decisions rather than state.

  What does **not** port is the app layer, and it is worth being honest about
  which parts:

  - **The map is SVG.** One window already carries over 200 OpenStreetMap
    footprints (`src/app/scenario.test.ts` pins that), redrawn through
    milsymbol on every state change — which is already the reason a browser
    driving script cannot click more than about eight times in one go. A phone
    wants canvas or WebGL, and that is a rewrite of `MapView`, not a port.
  - **Hotseat is the mode that ports best**, not the worst: one device passed
    between two players is a phone's natural shape, and the handoff overlay
    that hides the board already exists.
  - **Ground becomes a service.** `fetch-dtm.py` and `fetch-osm.py` are Python
    dev tools run deliberately; an app that lets a player choose their own
    ground has to fetch, cache and hold tiles at runtime, and decide what
    happens with no signal. See backlog 17.
  - **The data licences travel with it.** The OpenStreetMap and SRTM carve-out
    in [`LICENSE`](LICENSE) covers map data by source wherever it is found —
    the source tree, the runtime cache, and every exported file (generalised
    2026-09-24; it used to name files). What remains is keeping the promise it
    makes: the attribution the map already draws has to survive into the
    native UI, and has to be written into every exported file.

### Later development iterations (unordered backlog)

Each is intended to be an independent, toggleable module:

1. ✅ **Troop morale** — built 2026-09-22 as rules decision 19: traits, the
   pool of will, the live leader bonus, suppression, tests, rallies, routs,
   surrender and the side's breaking point. Every number is ours and awaits
   the balance pass. Campaign carry-over (the pool refilled only by rest)
   waits for backlog 16.
2. **Individual soldier generator** — named soldiers with attributes/roles.
3. **Echelon scaling** — platoons, companies, battalions, brigade (ties into the
   level-of-control selector and the C2 model). **Carries the artillery battery
   with it**: indirect fire is an off-map asset only because a platoon commander
   calls for fire rather than owning it. At battalion and above the battery is a
   unit on the map, with the rates of fire the data already holds and a position
   that can be counter-batteried (rules decision 8). **Mortars come on the map
   one echelon lower, at company and above** (decision 35).

   **It also carries the simulated subordinates** (backlog 15). Above company
   the levels below the player's pieces stop being a strength number and start
   having to decide how to execute what they were told; the model supplies the
   decisions and the engine resolves them, on both sides, including under the
   human. There is nothing to simulate until this item exists, and this item is
   not finished without it.

   **The artillery is balanced here** (author, 2026-09-23). Artillery is
   battalion's (decision 37), and the harness stops at company, so its
   numbers — 6 rounds for effect, 270 m to 50 m, the missions — have never
   been measured. When battalion arrives: balance the artillery, test the
   mission-planning numbers the author accepted (decision 38), and settle
   the open questions — how far an alternate position may be, whether one
   mission in hand a weapon is a rule, and why displacing to an alternate
   still hurts the defender (balance.md, *Twelfth round*).
4. **UAVs, quadcopters and binoculars: seeing further** — expand the current
   fixed-wing/drone assets into a fuller aerial-asset system, and give an
   observer optics. The author, 2026-09-23: observation posts come first, set
   in mission planning; **binoculars and UAVs at a later stage**. Both answer
   the same gap: nobody sees anybody before about 300 m (decision 12's
   detection), so fire decides a battle before small arms get a say
   (balance.md, *Tenth* and *Eleventh round*).
5. **Underground infrastructure** — tunnels, bunkers, subterranean movement & detection.
6. ✅ **Map generation** — *real ground*: elevation from a public DTM and
   object footprints from OpenStreetMap, with line of sight and cover derived
   from them (rules decision 15), Naismith's climb cost in movement, the true
   reach drawn on the map, and roads drawn from OpenStreetMap.

   A battle is laid out on a window by describing it, not by editing
   TypeScript: `tools/make-scenario.py` takes a JSON spec — the window, the
   forces, the charges and the prose — and writes the scenario module. What it
   refuses is everything that would otherwise compile and play differently from
   what the spec says: a force off the map, a duplicate id, a misspelt key, a
   key given to the wrong kind of force, a fractional soldier count, a seed
   that would not survive being written out, and a window that is not the one
   the relief was cut to. Positions may be given in map metres or as latitude
   and longitude — converted by the same projection `fetch-osm.py` used to
   place the ground, borrowed from it rather than rewritten. The demo itself is its
   output ([`scenarios/yokneamIllit.ts`](src/app/scenarios/yokneamIllit.ts)
   from [`yokneam-illit.json`](tools/scenarios/yokneam-illit.json)), which is
   what keeps the tool honest: the suite plays the generated battle.

   The app opens on a **scenario picker**: every spec under `tools/scenarios/`
   is a card with its title, its `brief` and the size of its ground, and
   `?scenario=<slug>` opens one directly; `טען לתחקיר` is on the picker too,
   so a saved battle is reviewed without opening one first. The brief is generated from the spec
   like everything else, and it is read by both players before either has taken
   a side — so it is a tasking, never an order of battle. A spec that is not
   offered fails `scenarioCatalogue.test.ts`.
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
10. **Air support** — fixed/rotary CAS missions. The figures to start from
    (Mk 82: 89 kg of explosive, most buildings collapse within 31 m,
    100% lethality across about 32 m; CEP 94.5 m unguided, 5 m GPS, 1.1 m
    laser) are in [docs/sources.md](docs/sources.md), *Air-delivered
    munitions*, from GICHD's *Explosive Weapon Effects* (2017).
11. **Electronic warfare** — jamming, comms degradation (interacts with C2 & UAV).
12. **Logistics** — ammunition, fuel, resupply, sustainment. For indirect fire,
    ammunition is the battalion's and above, set by the mission's parameters;
    below that, fire is assigned as missions (decision 34).
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

15. **An AI commander — the opponent in single-player, and the simulated
    subordinates under every player.** Decisions come from a model at the
    action seam; outcomes stay deterministic mechanics throughout. Decided
    2026-09-21.

    Single-player has been a Stage 3 line since the beginning; what was missing
    was a way to have something other than a human emit actions without putting
    a coin-flip inside the rules. The intended vehicle is **Jev** from TypeSafe
    AI — a *System One* model, in early access since 2026-09-15: typed questions
    in (`noul` yes/no, `choice` among named options, `score` on a rubric), typed
    decisions with calibrated confidence out, and **no string generation at all**.

    **Two jobs, not one — and the second is the larger.** In single-player the
    model is the opponent. But the **level of control** principle above says a
    player commands one echelon and directly moves the one below it, with
    everything further down *abstracted* — and today "abstracted" means
    "absent": a squad is an atom with a strength number and no judgement inside
    it. That holds only while the playable slice is the platoon. **Above
    company, the subordinate levels have to be simulated** (author,
    2026-09-21): a company commander moves platoons, and each platoon commander
    still has to decide how to carry out the order it was given — which squad
    leads, where the base of fire goes, whether to break contact. Those
    decisions are the model's too, on **both sides, including underneath the
    human player**.

    That is what this is actually for, and it reframes the rest of the item:

    - **It settles the latency question above rather than merely surviving
      it.** A brigade's worth of subordinates each reasoning every turn is
      affordable at 70–500 ms and a fraction of a cent a call; the same thing
      through a frontier chat model is not.
    - **The deterministic line does not move, because it is the same line.** A
      subordinate *decides*; the engine *resolves*. Its decision enters the
      recording exactly as a player's order does, and every outcome still comes
      from `Rng` and the document's tables. This is also what turns the
      never-during-a-replay rule below from a nicety into the thing protecting
      **every** recording rather than only single-player ones: two humans
      fighting a company action would each have simulated subordinates under
      them.
    - **The fog-of-war rule tightens rather than loosens.** A subordinate gets
      neither `game.units` nor, arguably, the whole of `sideView(game, side)`:
      it should reason from what *it* can see, which is stricter than the
      opponent case and has nothing behind it yet (⚠️).
    - **C2 is where the judgement earns its keep.** Rules decision 6 already
      says a force out of contact goes on with the order it holds — precisely
      the gap a simulated commander fills, and the existing rule gives it the
      room without anything new being invented.

    **It arrives with echelon scaling (backlog 3), not before** — the same
    dependency the artillery battery carries (rules decision 8), and for the
    same reason: there are no subordinate levels to simulate until there are
    echelons to command.

    **Why this shape rather than a chat model.** Three of backlog 13's five open
    questions answer themselves:

    - **Adjudication** is forced to the option that item already calls safest.
      Jev can only pick among alternatives it is handed, so it cannot argue for
      an outcome the tables do not cover — the engine stays the referee because
      nothing else is on offer.
    - **Latency** is 70–500 ms a call rather than seconds, which is what makes
      "every subordinate reasons" affordable instead of a budget question.
    - **Parsing** disappears. The answer is already typed, so a `choice` over
      objectives *is* a `setStandingOrder`; nothing is read out of prose, and
      there is no layer that can misread it.

    The mapping onto what a force can be told is close enough to be suspicious
    of: a standing order is an objective, a gait, a task (advance, advance and
    engage, hold and engage, hold fire) and an optional engagement range —
    three `choice`s and a `score`. "Spring the ambush now?" is a `noul`.

    **Where it lives, and where it must never.** The app layer. Not
    `src/engine/`, which is already closed to it three ways: eslint refuses node
    globals and app imports inside the engine,
    [`tsconfig.engine.json`](tsconfig.engine.json) sets `"types": []` so the
    standalone build cannot acquire them, and the engine has to replay
    bit-for-bit from a seed. The AI emits the same actions a player clicks.

    **What "the mechanics stay deterministic" means precisely.** No rule ever
    consults the model. Every roll still comes from `Rng`; hit resolution,
    detection, casualty bands and dispersion are the document's numbers and are
    not on offer to it. The model chooses decisions exactly where a human
    chooses them, and the recording holds decisions rather than outcomes
    (backlog 7), so an AI-fought battle replays like any other — and
    **תוכנית או מזל?** still works on one, because it re-rolls the dice over
    fixed decisions.

    That last point is also a hard rule: **the model is never called during a
    replay, a `verifyRecording`, or a what-if run.** Jev exports no seed and no
    temperature — checked against the SDK's own types, 2026-09-21 — so re-asking
    it the same question may decide differently. Harmless in play, fatal in a
    replay. This wants a test rather than this paragraph, the moment there is
    code to point one at. A recording of an AI game carries the **model id and
    the question-set version**, which is what backlog 13 already asks for.

    **The trap, written down before it is sprung.** The AI is fed
    `sideView(game, side)` — the contact ledger that side is entitled to — and
    **never `game.units`**. An opponent reading the umpire's map is an
    omniscient cheat that would quietly undo rules decisions 12 and 13, and not
    one existing test would fail. It is this repo's worst bug shape (one rule
    read off two different states) at the largest scale it could occur at, so it
    gets its own test and not a comment.

    **Toggleable, like everything else** — a flag on `GameOptions` in the
    `enforceC2` mould. With it off the hotseat plays exactly as it does today,
    and the game stays fully playable with no network and no API key.

    **Open, deliberately** (⚠️):

    - **It returns no explanation, and this is a teaching instrument.** The
      debrief exists to tell a plan apart from its luck; an opponent that cannot
      say why it chose the eastern axis teaches less than a scripted one that
      can. Simulated subordinates sharpen this considerably: a debrief that
      cannot say why *your own* platoon did what it did is a harder gap to
      accept than one about the enemy. What a subordinate **decided** is
      narratable through the existing Hebrew layer
      ([`debriefText.ts`](src/app/debriefText.ts)) with no rationale at all —
      whether that is enough is unsettled, as is what would produce a rationale,
      since Jev structurally cannot.
    - **Which decisions it gets.** The first slice is standing orders, once per
      side per turn. Whether it also marks indirect fire, sites smoke, sets
      observation sectors and lays charges is open.
    - **How it is held to C2.** A human is gated by rules decision 6 on how
      often a force may receive new orders. The AI has to be gated identically,
      or it is not playing the same game as the player.
    - **Dependency risk.** Hosted API only, no published weights, no
      self-hosting, and a fortnight old. The toggle is also the fallback.

    **First slice to build**: one call per side per turn, fed only that side's
    contact ledger, emitting `setStandingOrder` per force — measurable against
    the demo scenario's scripted RED, which is the comparison that says whether
    any of this is worth keeping.

    **What carries an order out is built** (2026-09-23): the **squad drill**
    ([`app/drill.ts`](src/app/drill.ts)). A subordinate's order from the model
    — or from a player — is executed by a `SquadDrill`, data read by one small
    executor that sees only its side's view. The balance harness plays it, and
    the Western drill meets 11 of the 12 balance targets (docs/balance.md).
    The measured scaling that settles where the model sits: **Jev decides for
    commanders, platoon and up; squads execute the drill; a squad leader asks
    the model only at a moment of decision** — spring the ambush, fall back —
    rather than every turn. At brigade size that is about 74 calls a turn
    against about 216 if every squad reasoned (docs/balance.md, *How the
    engine scales*).

    **A simulated echelon's calls for fire are Jev's to decide** (author,
    2026-09-23): whether to adjust or fire for effect at once (decision 39),
    and so the rest of a call. The player decides for their own echelon.

    **The first Jev decider is built** (2026-09-30, `src/sim/jev.ts`): Jev
    answers the attacking company commander's typed questions in the
    headless runner (`npm run jev-sim -- --jev`), through
    `@typesafe-ai/sdk`. Each question becomes one `systemOne` call — the
    commander's picture (drawn from `sideView` only) as the state, the
    question as a `noul` or a `choice` over its options. A battle is replayed
    to each question and driven on by the answer, so the answers are all Jev
    contributes and a replay never calls it (tested). Every call is logged
    with its answer, confidence, model and `QUESTION_SET_VERSION`. The live
    game does not call it.

    **First run against Jev** (2026-09-30, docs/balance.md, thirty-fourth
    round): Jev is steady (the same question gets the same answer), judges
    rather than plans, and leans to an option whose words the state
    repeats, so how a question is framed decides much of what it answers.
    Each question now goes with the commander's role and mission (naming no
    option), each option says what it does to the attack, and the picture
    says what the company has been ordered. `npm run jev-probe` measures a
    framing on Jev's own recorded questions before it is adopted; `jev-sim
    --rule` puts the scripted commander's choices through the same questions
    (it wins what the scripted commander wins). Jev wins 10% at 3:1 and 15%
    at 2:1: it bounds by platoon and holds short under its fires, as
    doctrine teaches, and both cost the attack heavily in this game — a
    question for the author.

16. **Campaigns — battles that remember the last one.** A pre-built series
    rather than a single engagement: the same force fights again on the next
    piece of ground, and what happened to it carries over.

    **The engine has no concept of state between battles.** Every `Game` is
    built from nothing by a scenario, which is why a campaign is a genuinely
    new idea here rather than a menu over existing ones. The carrier is
    already built, though: a recording reconstructs a battle exactly from its
    seed and decisions (backlog 7), so a campaign is a chain of recordings
    plus a statement of what the next scenario inherits from the last.

    **What carries is the whole design, and it is mostly a balance question**
    (⚠️): casualties and which forces still exist; ammunition, once backlog 12
    exists to track it; ground gained, if the next battle is on the same
    window; and whether a force that broke is the same force next time, which
    is backlog 1's business — and the author has answered part of that
    (2026-09-22): a man's pool of will carries into the next battle and
    **only rest refills it** (rules decision 19). Attrition carried between battles is the single
    most balance-sensitive decision in this whole direction — a campaign that
    carries losses forward can be lost by turn three of battle one.

    It also needs an **outcome worth carrying**, which is backlog 18.

17. **The mission builder — pick real ground, set the mission, get a battle.**
    The other half of the pre-built library: rather than playing what someone
    laid out, the player chooses a piece of the real world and the terms of the
    fight, and the scenario is generated on it.

    **The tooling half is nearly built.** `tools/fetch-dtm.py` and
    `tools/fetch-osm.py` already cut any window from public elevation and
    OpenStreetMap data; `tools/make-scenario.py` already refuses everything a
    builder would have to enforce — a force off the map, a duplicate id, a key
    given to the wrong kind of force, a window that is not the one the relief
    was cut to; and the battle picker already opens whatever comes out. Three
    things stand between that and a feature: they are Python dev tools rather
    than a runtime service (see Stage 4), the **spec** is the truth so a
    builder must write one rather than a module, and refetching a window moves
    the data under any layout already placed on it.

    **The interesting half is constraint satisfaction, and the engine can
    already answer it.** `hasLineOfSight` takes two forces over real relief,
    `boundCost` prices a climb, `coverAgainst` reads what a force is behind —
    so "put the defender where it holds the ridge, give the attacker one
    covered approach, and make that approach the slow one" is a search over
    placements *scored by the rules themselves* rather than a set of invented
    heuristics. Draw the search from `Rng` and a generated battle is a seed
    plus a template: reproducible, and replayable like every other game.

    **What it cannot invent** (⚠️): force ratios, and what counts as a fair or
    an instructive start. Those are balance decisions the document does not
    make, and they are the part to put to the author rather than to tune.

    Two of the mission parameters this is meant to take — the **objective** and
    the **mission type** — do not exist in the engine yet (backlog 18), and a
    third, **the conditions**, does not exist either (backlog 19). Starting
    positions are the only one of the four that is already scenario layout.

18. **Mission and victory conditions — something to win other than a
    massacre.** Today a side is beaten when **every one of its forces is
    neutralised or gone** (`sideDefeated`) or, played with morale, when it
    **breaks** (rules decision 19) — and nothing else ends a battle: no
    objective, no time limit, no ground to take or hold. Morale also has a
    gain waiting for this item: taking an objective is the one positive event
    the author named that has nothing to read yet.

    **The document is silent on all of it** (⚠️ — checked, not assumed: it
    names no משימה, no victory condition and no objective; its only use of
    מטרה is "target"). So seize / hold / delay / screen / raid, an objective
    on the ground, a turn limit, a withdrawal condition and what a draw is are
    all ours, and they want the author's shape before they are built — the way
    decision 15 was got, and for the same reason.

    This is the blocker under both items above: a campaign needs a result to
    carry forward, and a mission builder that takes "objectives" as a
    parameter needs objectives to mean something. It is also what the debrief
    would measure a plan against instead of a body count.

19. **Weather, light and visibility.** Night, rain, fog, low cloud, wind —
    conditions as a parameter of the battle rather than a permanent noon.

    **The document has no weather and no light at all** (⚠️ — its only
    visibility rule is smoke: `אין ירי לתוך\דרך עשן`). Every number would be
    ours, which puts this beside morale (backlog 1) rather than beside a rule
    waiting to be implemented: get the shape from the author first.

    The smoke rule is the **precedent worth copying** when it is built: the
    engine derives sight from the screens on the map rather than the app
    asserting a modifier, so conditions should reach the rules through
    `hasLineOfSight` and the detection bands, not as a flat penalty bolted on
    at a call site. Everything they would touch is already in one place — the
    300 m visible band and the 20 m hidden one, the eye heights of rules
    decision 15, camouflage and cover, and smoke's own duration, which wind
    would presumably move.

20. **A TTP editor — squad tactics a player or instructor can rewrite.**
    (Author, 2026-09-23.) The simulated subordinates of backlog 15 carry out
    their orders with a **squad drill**: how far a bound goes and at what
    gait, whether squads bound in overwatch pairs, which sector each squad
    shoots into, when to open fire, when to assault, when to break contact.
    That drill is tactics, techniques and procedures (TTP), and **it is
    doctrine, not rules**: two armies, or two instructors, run a platoon
    attack differently, and the game should be able to show both. The editor
    lets a player or an instructor adapt the squad-level tactics to actual
    doctrine and save them as a named drill, to be played or measured.

    **What makes it cheap later is how the drill is built now.** It is **data**
    (a `SquadDrill`, [`src/app/drill.ts`](src/app/drill.ts)) interpreted by one
    small executor, not logic spread through the code. The editor is therefore
    a form over that data, not a programming tool. Three rules keep it that way:
    - **A drill decides; the engine resolves.** Drills emit the same actions a
      player clicks — standing orders, fire, assaults, postures — so no drill,
      however written, can change a rule or an outcome's odds.
    - **A drill sees what its side sees.** It reads the side's contact ledger,
      never the umpire's map (backlog 15's trap).
    - **A drill is measurable.** The balance harness plays any drill (backlog
      item on balance, docs/balance.md), so "does our doctrine work under these
      rules?" is a question with a number for an answer. That is the
      instructor's use as much as the player's.

    Open (⚠️): which parameters are exposed (the first drill's are the
    obvious start); whether a drill can branch on events ("if pinned, call
    smoke") or only set numbers; where drills are stored and shared; and
    whether a scenario can require a drill, as an exercise would.
21. **A doctrine engine — the drills taken from the manuals, not tuned by us.**
    (Author, 2026-10-01.) The rules are tuned against real outcomes; the drills
    that carry out orders should not be tuned at all, or a quirk in one hides a
    fault in the other (docs/balance.md, forty-fourth round: the third scout
    "won" by keeping a squad off a killing ground). So the layers divide:
    **rules** are set from research and tuned to real outcomes; **drills** are
    transcribed from doctrine and fixed; **plans** are the players' (or the
    AI's). If doctrinal drills do not give real outcomes, the rules are wrong.
    - **Civilian edition: US doctrine from open sources** (Distribution A):
      ATP 3-21.8 *Infantry Platoon and Squad* (the battle drills), ATP 3-21.10
      *Infantry Rifle Company*, FM 3-90 *Tactics* (forms of manoeuvre, hasty
      and deliberate attack, the defence). Each drill parameter records *the
      manual says X, our value Y* — manuals give procedures, not distances.
    - **Institutional edition: the doctrine engine adapted to the customer's
      doctrine and material**, as part of tailoring (docs/business-plan.md,
      *Editions*).
    - **Where the work is done:** on a local computer, not a cloud session —
      the manuals are long, the military sites were refused by the cloud
      proxy, and the author has doctrinal material to embed.
    - **First step:** an inventory of every drill the game plays (scouting,
      waiting, the approach, bounding overwatch, base of fire, holding short
      and lifting fires, the assault, consolidation; the defender's fire
      discipline, displacement, counterattack, fire plan), each mapped to its
      manual paragraph as *matches*, *ours and differs*, or *ours, doctrine
      silent*. Then the drills rewritten to doctrine, and the reference plans
      (balance.md, thirty-seventh to forty-fifth rounds) measured again.
    - **The base of fire, after the doctrine** (author, 2026-10-03). A
      platoon or company commander can pull some of his machine guns out to
      form a base of fire; today a base-of-fire platoon fires its riflemen
      only, which costs the deliberate plan about ten points (docs/balance.md,
      fifty-sixth round). Who forms it, with which weapons, from where and
      for how long is to be taken from the manuals, with the soldiers'
      weapons (decision 73), not tuned here.
    Relation to backlog 20: the TTP editor is how an instructor changes a
    drill; this is where the default drills come from.
    The brief for that session: [docs/doctrine-handoff.md](docs/doctrine-handoff.md).
22. **An AI commander in three parts: plan once, compute, execute cheaply.**
    (Discussed 2026-10-01.) An expensive model writes several candidate plans
    once a battle, as structured parameters (the `--rule` vocabulary: scouts,
    posts, axis, tasks, when to go, bound, hold short, fire policy); the engine
    estimates each one's chance of success by playing it many times; a cheap
    executor (Jev, or a small model) chooses among options with those numbers
    and the plan's bounds, and explains its choices in the debrief. Measured
    reasons (balance.md, thirty-fifth, thirty-sixth and forty-sixth rounds):
    the models' plans failed where the questions could not express them, and
    they judge odds badly; numbers judge them well.
    - **The trap: the engine knows the truth.** Played from the real state,
      the estimates know where the enemy is. They must start from the side's
      belief — worlds sampled to fit what the side knows (the plan's estimate,
      marks with their error, the order's intelligence).
    - **The estimates inherit the drill's quirks**, so they want backlog 21's
      doctrinal drills first; meanwhile the same machinery finds dominant
      plans, which is a balance tool.
    - **Stages:** (1) plan once and evaluate once at turn 0, the best plan
      executed by rule; (2) estimates for the two or three decisions that
      matter (going in, lifting the fires); (3) the full loop, the executor
      narrating.
