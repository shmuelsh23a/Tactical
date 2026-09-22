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
      and charisma do anything yet; the rest wait for the next session's rules.
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
      has eyes on. Its men's traits and pools, and its suppression, are
      stripped from the side's view of it (`outsideView`), and a stale mark
      shows neither.
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
      surrendering costs every man who saw it 8, and each comrade who breaks
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
      rout is what waiting too long buys.
    - **The side breaks** (Close Combat): two thirds of its fighting strength
      down, broken, routed, surrendered or neutralised (command groups do not
      count), and the battle is over for it — `sideDefeated` says so and the
      log says **נשבר** rather than נוטרל.

    **Mechanism, one owner.** The slow layer is judged once per turn in the
    summary phase (סיכום והתארגנות — the document's turn already has a
    reorganisation step), by `resolveMorale` in
    [`morale.ts`](src/engine/morale.ts). It reads two ledgers kept as fire is
    resolved: which forces were shot at and from where, and every soldier as he
    stood when the turn began. **Casualties are found by comparing the two**,
    whatever caused them, so a new way of hurting a force cannot forget to tell
    morale; a new way of *shooting at* one must still call `noteFire` for the
    suppression and the flank.

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
    in [`LICENSE`](LICENSE) is written per file. Ground fetched at runtime
    cannot be listed per file, so that clause needs generalising before any
    such build ships, and the attribution the map already draws has to survive
    into the native UI.

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
   that can be counter-batteried (rules decision 8).

   **It also carries the simulated subordinates** (backlog 15). Above company
   the levels below the player's pieces stop being a strength number and start
   having to decide how to execute what they were told; the model supplies the
   decisions and the engine resolves them, on both sides, including under the
   human. There is nothing to simulate until this item exists, and this item is
   not finished without it.
4. **UAVs & quadcopters** — expand the current fixed-wing/drone assets into a
   fuller aerial-asset system.
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
