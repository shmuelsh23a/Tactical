# Balance sheet — every number that was chosen

The document's own figures are transcribed verbatim in
[`src/engine/data/`](../src/engine/data) and are **not** on this list: they are
not ours to tune. This is everything the game needs that the document does not
give, gathered in one place because the author has twice said *tentatively —
until we work on balance*.

Each row says who chose it and where it lives. "Author" means he gave the
figure; "ours" means the code needed one and the README records the reasoning.

## Detection and concealment (rules decision 12)

[`src/engine/data/concealment.ts`](../src/engine/data/concealment.ts)

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `OBSERVATION.stationaryBonus` | **+10%** | author | A force in position observes continuously and is not distracted by its own movement. Makes a defender see an attack coming. |
| `OBSERVATION.runningExposure` | **+10%** | ours | How much easier a running force is to find. The author gave the direction only. |
| `OBSERVATION.contactExpiryTurns` | **3 turns** | author | A contact nobody refreshes falls off the map. |
| `COVER_CONCEALMENT.partial` / `.full` | **-10% / -20%** | ours | How much harder cover makes a force to find. The author gave the direction only. |
| `DIG_IN.startsAfterTurns` | **3 turns** | author | Stationary turns before a force in the open starts digging. |
| `DIG_IN.turnsPerLevel` | **2 turns** | author | Work per level of protection, capped at "behind cover". |
| `CAMOUFLAGE.perStep` / `.turnsPerStep` / `.max` | **-10% / 2 turns / -50%** | author | Camouflage accrues while the force stays put, and is lost the moment it moves. |
| `CAMOUFLAGE.floorIsConcealedChargeChance` | **on** | author | A camouflaged force is never harder to find than a buried charge (30% walking, 5% running, inside 20 m). Without it, full camouflage made a force literally unfindable. |
| Scout beats the floor | **by its own bonus** | author | So looking properly stays the answer to a camouflaged position. |
| `SCOUTING.detectionBonus` | **+10%** | ours | What scouting is worth. The author gave the direction only. |
| `SCOUTING.maxGait` | **normal** | author | A scouting force walks. |

**Interactions worth knowing before tuning any of these.**

- The hidden band's base is **30%**, and the camouflage floor is that same
  figure — so at full camouflage, cover and camouflage cancel an observer's
  bonuses and no more. Lower the floor and a camouflaged position becomes very
  hard to find again; raise the scouting bonus and scouts become the only way to
  find one.
- Hidden means *stationary*, so a defender that never moves is only findable
  inside **20 m**, by fire, or by a UAV. That is the single biggest lever on how
  an attack plays: it is why the demo's BLUE advances blind.
- Digging in reaches full cover at **7 stationary turns**. A demo battle runs
  4–6 turns, so in practice only a force that started in cover ever has it.

## Sectors of observation (rules decision 14) — settled, not open

[`src/engine/data/concealment.ts`](../src/engine/data/concealment.ts)

Listed for completeness rather than for tuning: the document has no sector rule
at all, so every figure here was invented — but the author settled the shape
*and* the sizes on 2026-08-16, so none of it is awaiting a verdict the way
decision 12's `tentative` figures are.

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `OBSERVATION_SECTOR.attentionBudget` | **13.5 %·°** | author | Divided by the arc's width: **+23% at 60°, +15% at 90°, +8% at 180°**. |
| `OBSERVATION_SECTOR.outsidePenalty` | **-20%** | author | Flat, whatever the width — the cost of looking elsewhere. |
| `OBSERVATION_SECTOR.maxBonus` | **+30%** | author | However thin the arc is drawn, watching it is never a certainty. |
| `OBSERVATION_SECTOR.defaultWidth` | **90°** | author | The frontage a sector covers unless narrowed or widened. |

**The one interaction to preserve if any of these ever moves.** The bonus is
divided by the width and the penalty is not, which is the only thing making the
width a decision. An earlier cut paid a **flat** bonus at every width, and the
widest arc then dominated every narrower one outright — widening only converted
a penalised direction into a bonused one, so the control existed solely to
punish a player for using it. Any change that decouples the bonus from the width
brings that back. Two guards are already in the data: a **360° arc is worth
zero** (otherwise it collects the bonus everywhere with no ground outside to pay
the penalty) and the sector **raises the camouflage floor but never lowers it**
(otherwise a running observer facing away has a floor of exactly zero, and
decision 12 says a camouflaged force can never be impossible to find).

## What a player is told (rules decision 13)

[`src/app/debriefText.ts`](../src/app/debriefText.ts) — `casualtyReport`

| Figure | Value | Whose |
|---|---|---|
| Casualty bands | **0 / 1–2 / 3–5 / 6+** → `ללא נפגעים שנצפו` / `נפגעים בודדים` / `מספר נפגעים` / `אבידות כבדות` | ours (that reports are banded is ✅; where the bands fall is not) |
| "No observation" line | `N יורים ב-X% — ללא תצפית על המטרה` | ✅ author, decision 13 | Fire at a force the side held no contact on: its own shooters and chance, no effect. The wording, not a number — but it is the one place the disclosure line is visible to a player, so keep it saying nothing about the target. |

Two properties to keep in mind if these move: the bands are **honest** (a player
is told less, never told something false), and they apply to the live combat log
during play as well as to a per-side debrief. The umpire's view is exact and is
where the tally belongs.

## Elevation and objects (rules decision 15)

[`src/engine/data/terrain.ts`](../src/engine/data/terrain.ts)

The author settled the shape on 2026-09-06 and said of every figure "we will
tweak later when we get to balancing — write it down". So: written down.

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `EYE_HEIGHT.infantry` | **1.5 m** | author (tentative) | Where a standing force sees from, and how tall it stands to be seen. |
| `EYE_HEIGHT.vehicle` | **2.5 m** | author (tentative) | A tank looks out of its hatches, and is that much easier to see over a rise. |
| `EYE_HEIGHT.fullCover` | **0.5 m** | author (tentative) | A force in full cover keeps its head down: harder to see over a crest, sees less over it. The cost digging in never had. |
| Sight is binary and symmetric | **on** | author (tentative) | No hull-down or partial-defilade state; whoever can see can be seen. |
| `OBJECT_COVER` | **building full / wall partial / tree partial** | author (tentative) | The cover a force takes from what it stands in or against. |
| `OBJECT_COVER_REACH_M` | **3 m** | ours | How near counts as "against" — the reach that gives a force an object's cover, and that marks the object as its own on a sight line. |
| `OWN_OBJECT_SIGHT_M` | **6 m** (twice the reach) | ours | How far along its line a force ignores its own object's faces: both faces of the wall it lies behind, never the far wall of the building it stands against. A force deep inside a large building therefore cannot see out past a wall more than 6 m off — a windowless reading, his to change. |
| `OBJECT_HEIGHT_M` | **building 6 / wall 1.5 / tree 4 m** | ours | What an object blocks when the map gives it no height of its own. |
| `LOS_SAMPLE_STEP_M` | **5 m** | ours | How finely the ground is sampled along a line; objects are tested exactly. |

**Settled 2026-09-06 (he picked from our suggestions; figures tentative):**

| Figure | Value | Whose | What it does |
|---|---|---|---|
| `SLOPE.climbCostPerMetre` | **8 m** of the bound per metre climbed (Naismith); descent free | author (tentative) | Makes the high ground cost what it is worth. A 10% slope costs 1.8 m of budget per metre, so a walking bound uphill is ~28 m, not 50. |
| `SLOPE.vehicleMaxGradeDeg` | **30°**, up or down | author (tentative) | A vehicle refuses a steeper bound, descending as well as climbing; a standing order across such a patch reports `grade too steep` every turn until replaced, since an order stands until it is. Infantry takes anything. On the demo map about one 50 m bound in 500 exceeds it. |
| Height and hit chance | **none, for now** | author | The sight lines already reward height; the alternative kept on file is +10% additive for a shooter ≥ 10 m above its target. Revisit at balance. |

**Interactions to keep in mind.**

- Eye height and cover are one rule read twice: full cover *lowers* the eye.
  Change `EYE_HEIGHT.fullCover` and both the protection and the blindness of a
  dug-in force move together — which is the point.
- The demo's dead ground is measured: BLUE-2 running straight at RED-1's
  position from the northern low ground was seen by nobody on turn 1 at 176 m
  (**0/200 seeds**, inside the 300 m band) and by someone on turn 2 at 76 m
  (**200/200**, RED-1 itself in 185). Change the eye heights and re-measure.
- Object cover is taken at placement and at upkeep, and **outlives the object
  until upkeep**: a force that leaves a building and runs keeps the building's
  full cover — and its 0.5 m eye — for that turn's fire phase. That is the
  dig-in shape (decision 12 clears at upkeep) applied to a thing more
  conspicuous than a scrape; worth revisiting with the eye heights.
- A recording carries its ground. Replaying an older, groundless recording on a
  map with ground is not a thing the code does — it replays flat, as played.

## Rules the document is silent on

| Figure | Value | Whose | Where |
|---|---|---|---|
| Smoke screen radii | **25 / 50 / 100 m** (grenade / mortar / artillery) | ours, decision 9 | [`data/smoke.ts`](../src/engine/data/smoke.ts) |
| Charge trigger radius | **10 m** of the path walked | ✅ author, decision 10 | [`combat/mines.ts`](../src/engine/combat/mines.ts). Keep it **below** the 20 m search band: the gap between the two is the ground where a walking force finds a charge without treading on it, which is the only thing its 30% roll buys. Raise it to 20 m and the search stops being a hedge and becomes the sole guard. |
| Assault reach | **25 m** | ✅ author, decision 11 | [`combat/assault.ts`](../src/engine/combat/assault.ts) |
| Grenades per assault | **0–3, no ammunition tracked** | ours, decision 11 | UI |
| Indirect fire | **one mission + one screen per side per turn** | ✅ author, decision 8 | UI limit over an engine that models `roundsPerTurn`. Correct *for the platoon-leader slice* — a platoon commander calls for fire, he does not own a battery. Replaced by a real battery unit at battalion and above (backlog 3), so retune this only within the current echelon. |
| Laying a charge in play | **2 turns** of work | ✅ author, decision 16 | [`data/engineering.ts`](../src/engine/data/engineering.ts). "Tentatively 2 turns" — his word, 2026-09-16. What the turns *cost* was ours and is now his (confirmed 2026-09-16): a turn in which it moves, fires, **is hit** or is neutralised loses the work outright rather than banking it, and starting the work replaces the force's standing order. Shorten the work and a charge becomes a routine move; let the work be banked across interruptions and the cost stops being two quiet turns at all. **Unbounded**: no stock, no cooldown — a force that keeps surviving may keep laying, and for a force that was going to sit still anyway the two turns are free. Raised with the author 2026-09-16 and **deferred to ammunition (backlog 12)** at his word — the limit belongs there, not here. |
| Who may lay one in play | **an insurgent or special force** | ✅ author, decision 16 | A `canLayCharges` flag the scenario sets, until force *types* arrive with echelon scaling (backlog 3). The demo gives it to RED-1 so the rule can be played — ⚠️ ours, and one line to delete when types land. |
| Covering-fire sampling step | **5 m** along the bound | ours, decision 18 | [`combat/covering.ts`](../src/engine/combat/covering.ts). How finely a bound is walked looking for the first place a covering force could shoot. It is an occlusion question, not a cover one: a gap between two objects narrower than 5 m can be stepped over by the sampler, so a mover can cross a narrow slot unshot. Smaller is more faithful and costs a sight test per step. |
| Fog-of-war fallback radius | **300 m** (`SPOT_RANGE_M`) | ours | [`app/hotseat.ts`](../src/app/hotseat.ts) — only used when `trackIntel` is off |
| What-if runs | **20** | ours | [`app/whatIf.ts`](../src/app/whatIf.ts) — a UI choice, not a rule |

## Morale and suppression (rules decision 19)

**The whole section is ours.** The document has no morale; the author gave the
shape on 2026-09-22 — six traits of 1–10, leadership as INT + WIS + CHA, a
starting pool between the scenario's minimum and 100, a live leader bonus up
to battalion, the 50 / 30 / 10 thresholds, a separate suppression layer, states
on screen, hard and capped recovery, charisma ÷ 2 as the fallback — and every
magnitude below filled it in. All of it lives in
[`data/morale.ts`](../src/engine/data/morale.ts).

| Figure | Value | Whose | What it does |
|---|---|---|---|
| Thresholds | **50 / 30 / 10** | author | Wavering (tested every few turns) / shaken (every turn) / broken. |
| Fallback bonus | **charisma ÷ 2** | author | Out of every leader's reach. |
| Leadership | **INT + WIS + CHA** | author | Leaders only. |
| `TRAIT_DICE` | **⌈(d10 + d10) ÷ 2⌉** | ours | Traits 1–10, mostly average. |
| `MOTIVATION_FLOOR` | **40 / 50 / 60 / 70 / 85** | ours | The scenario's minimum, by motivation (poor → fanatic); the pool is the mean of two draws from there to 100. |
| `EXPERIENCE` | **−10 / 0 / +10 / +15** to tests; suppression **×1.25 / 1 / 0.8 / 0.7** | ours | Green → elite. |
| `WAVERING_TEST_INTERVAL` | **3 turns** | ours | The author's "every few turns". |
| `TEST` | pass on d100 ≤ **E + 30 + 2 × WIS** + experience | ours | ~90% at 50, ~70% at 30 for an average man. |
| `EVENT_TEST_LOSS` | **12** | ours | A turn that costs a man this much tests him at once. |
| `HEROIC` | d100 ≤ **2 × luck**; **3 turns**; +10 pool; squad +5; aim ×1.25 | ours | A failed test turned to heroism. |
| `LEADER_BONUS` | leadership **÷ 3**, halved per link, **±15** cap | ours | The live chain-of-command bonus. |
| `LEADER_REACH_M` | **300 / 500 / 1000 m** | platoon and company from the פו"ש table; battalion ours | How far a commander's bonus carries. |
| `FALLBACK_RADIUS_M` | **50 m** | ours | Who counts as "closest" for the fallback. |
| `LOSS` | fired on **1**, shelled **5**, hit **6**, comrade hit **1**, comrade down **6**, friend nearby down **2**, squad leader down **15**, commander down **10**, flanked **8**, outnumbered **3**, enemy armour **4**, friends broke **8**, comrade broke **4**, rout **10**; cap **30**/turn | ours | What a turn takes from a man. |
| `GAIN` | drew blood **3**, put a force out **6**, quiet **2**, rest **4**, own armour beside **1** | ours | Never past the ceiling. |
| `PERMANENT_LOSS_SHARE` | **½** | ours | Share of every loss that lowers the ceiling for good. At ceiling ≤ 10 a man is dry. |
| `RALLY` | **2 × leadership** + experience − **15** per earlier rally − **20** under fire; commander within **50 m**; back to **20 + leadership ÷ 2** | ours | "Hard", the author's word. ~33% for an average leader, once. |
| `CORNERED_M` | **50 m** | ours | Twice the assault range: break here and surrender. |
| `ROUT_DISTANCE_M` | **200 m** | ours | How far a force with no commander runs. |
| `FORCE_BREAK_SHARE` | **½** | ours | Broken + down; the document's own attrition fraction. |
| `SIDE_BREAK_SHARE` | **⅔** | ours | The side's breaking point. |
| `SUPPRESSION` | burst **10 + 5/hit**, MG **×1.5**, RPG **15 (+15 hit)**, shells **25**, charge **20**, assault **30**; max **100**; suppressed **15**, pinned **40**; halved every turn | ours | The fast layer. |
| `SUPPRESSION_EFFECT` | suppressed aim **×0.75**, nerve **−5**; pinned **×0.5**, **−10** | ours | |
| `STATE_ACCURACY` | wavering **×0.9**, shaken **×0.75** | ours | Morale changes performance. |

**Measured, 2026-09-22** (300 seeds, two squads trading rifle fire at 150 m,
command groups 200 m back): without morale the loser is neutralised at a median
turn 12 (p10 9, p90 16), 4.1 men down; with it, median turn 11 (p10 7, p90 14),
**273/300 routs**, 2.3 down and 2.5 broken. A sustained MG at 150 m: turn 4
either way, 124/300 routs. **The first cut priced every 1d4 hit as a serious
wound and routed squads at turn 7 with 0.9 men down** — morale out-killing the
dice. That ratio is the thing to re-measure after any change to `LOSS`.

## The balance harness: 2,400 battles, 2026-09-22

`npm run balance` plays headless battles between **Western (NATO-organised)
forces** and prints the table below. The harness is
[`src/sim/balance.ts`](../src/sim/balance.ts) (checked by the suite), and the
runner is [`tools/balance-sim.ts`](../tools/balance-sim.ts). Its options are
listed at the top of the runner. **Rerun it after any change to a number on this
page.**

**The forces.**
- Squad: 9 men.
- Platoon: 3 squads, a 6-man weapons squad and a 3-man HQ, 36 men.
- Company: 3 platoons, a 5-man HQ and one 60 mm mortar mission a turn, 113 men.

The weapons squad fires small arms, because the document's table is
נק"ל\מקלעים.

**The doctrine** is a script, not a player:
- Out of contact, everyone advances.
- In contact, half the force bounds while the other half is the base of fire.
- Every force fires at the nearest enemy its side knows of, and assaults inside
  25 m.
- Command groups follow 80 m behind their forces.
- A defender holds a prepared position (partial cover, digging in from there)
  and covers its front (חיפוי) when nothing is in reach.

Fog of war and C2 are both on. The ground is **flat and open**, so what is being
measured is the rules alone, played plainly: no smoke, no flanking, no use of
ground.

**The fights.**
- `meeting`: mirror forces advance on each other.
- `attack3`: about 3–4:1 on a prepared position — a squad on a fire team (9 v 4),
  a platoon on a squad (36 v 9), a company on a platoon (113 v 36).
- `attack2`: about 2:1 — 9 v 5, 36 v 18, 113 v 72.
- `attack1`: 1:1.

Each cell is 100 battles, seeds 1000–1099.

**How a battle ends.**
- `broke`: the loser's side broke.
- `wiped`: every one of its units is out, the game's own rule.
- `fightersGone`: every fighting force is out but a command group lives — see
  finding 4.
- `both`: both sides went in the same step, a draw.

| Kind | Echelon | Morale | Men (B v R) | BLUE / RED / draw | Endings | Turns, median (p10–p90) | Loser down | Winner down | Routs | Surrenders | Heroes | Rallied | Pinned share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| meeting | squad | on | 9 v 9 | 49% / 43% / 8% | broke 92, both 8 | 11 (8–13) | 35% | 11% | 0.51 | 0.44 | 0.64 | 0.21 | 27% |
| meeting | squad | off | 9 v 9 | 56% / 43% / 1% | wiped 99, both 1 | 12 (9–15) | 61% | 25% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| meeting | platoon | on | 36 v 36 | 30% / 67% / 3% | broke 97, both 3 | 10 (9–11) | 36% | 20% | 0.11 | 1.59 | 1.20 | 0.09 | 62% |
| meeting | platoon | off | 36 v 36 | 40% / 59% / 1% | fightersGone 98, wiped 1, both 1 | 11 (10–14) | 59% | 35% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| meeting | company | on | 113 v 113 | 53% / 35% / 12% | both 12, broke 88 | 10 (10–11) | 32% | 24% | 4.83 | 2.55 | 3.29 | 1.93 | 71% |
| meeting | company | off | 113 v 113 | 55% / 42% / 3% | both 3, fightersGone 97 | 17 (15–20) | 73% | 64% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack3 | squad | on | 9 v 4 | 96% / 4% / 0% | broke 100 | 15 (13–18) | 35% | 2% | 0.46 | 0.15 | 0.23 | 0.09 | 5% |
| attack3 | squad | off | 9 v 4 | 100% / 0% / 0% | wiped 100 | 15 (12–19) | 65% | 4% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack3 | platoon | on | 36 v 9 | 100% / 0% / 0% | broke 100 | 12 (11–13) | 36% | 0% | 0.53 | 0.23 | 0.31 | 0.20 | 55% |
| attack3 | platoon | off | 36 v 9 | 100% / 0% / 0% | wiped 100 | 13 (12–14) | 65% | 1% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack3 | company | on | 113 v 36 | 100% / 0% / 0% | broke 100 | 11 (11–12) | 34% | 8% | 2.59 | 0.01 | 1.30 | 0.88 | 64% |
| attack3 | company | off | 113 v 36 | 100% / 0% / 0% | fightersGone 62, wiped 38 | 13 (12–14) | 60% | 13% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack2 | squad | on | 9 v 5 | 86% / 11% / 3% | broke 97, both 3 | 17 (14–21) | 44% | 6% | 0.59 | 0.12 | 0.23 | 0.17 | 6% |
| attack2 | squad | off | 9 v 5 | 97% / 3% / 0% | wiped 100 | 17 (15–21) | 69% | 10% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack2 | platoon | on | 36 v 18 | 100% / 0% / 0% | broke 100 | 15 (14–16) | 41% | 4% | 0.75 | 0.21 | 0.74 | 0.47 | 37% |
| attack2 | platoon | off | 36 v 18 | 100% / 0% / 0% | wiped 100 | 16 (15–17) | 66% | 10% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack2 | company | on | 113 v 72 | 21% / 74% / 5% | broke 95, both 5 | 15 (14–16) | 27% | 22% | 8.80 | 0.03 | 3.96 | 3.83 | 55% |
| attack2 | company | off | 113 v 72 | 53% / 43% / 4% | fightersGone 75, both 4, wiped 21 | 21 (19–23) | 71% | 57% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack1 | squad | on | 9 v 9 | 15% / 81% / 4% | broke 96, both 4 | 18 (15–22) | 27% | 8% | 0.93 | 0.09 | 0.38 | 0.49 | 8% |
| attack1 | squad | off | 9 v 9 | 19% / 80% / 1% | wiped 99, both 1 | 22 (18–25) | 58% | 21% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack1 | platoon | on | 36 v 36 | 1% / 99% / 0% | broke 100 | 17 (15–18) | 26% | 15% | 1.85 | 1.20 | 1.45 | 1.26 | 60% |
| attack1 | platoon | off | 36 v 36 | 7% / 93% / 0% | fightersGone 98, wiped 2 | 20 (19–23) | 59% | 29% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |
| attack1 | company | on | 113 v 113 | 0% / 99% / 1% | broke 99, both 1 | 14 (13–15) | 26% | 16% | 9.83 | 0.04 | 4.19 | 3.75 | 65% |
| attack1 | company | off | 113 v 113 | 0% / 100% / 0% | fightersGone 100 | 19 (17–21) | 63% | 34% | 0.00 | 0.00 | 0.00 | 0.00 | 0% |

**What it says.**

1. **Morale does what it was built for.** Without it:
   - The loser of an even fight is destroyed to 59–73% of his men, and at
     company scale the winner loses 64% as well, over 17 turns.
   - With it, the loser breaks at **32–36%** at every echelon. The winner loses
     11–24%, and battles last about 10 turns.

   Breaking at about a third is the right order of magnitude for real units.
2. **No side is favoured.** The mirror fights split within chance at 300
   battles a cell (`--n 300 --kinds meeting --morale on`):

   | | squad | platoon | company |
   |---|---|---|---|
   | as played | 43 / 49 / 8 | 41 / 53 / 5 | 46 / 42 / 12 |
   | `--swap` | 43 / 49 / 8 | 43 / 52 / 5 | 44 / 41 / 15 |
   | `--fair-ties` | 41 / 53 / 6 | 48 / 47 / 5 | 51 / 41 / 8 |
   | `--fair-ties --swap` | 41 / 53 / 6 | 47 / 46 / 8 | 50 / 36 / 13 |

   BLUE / RED / draw, in percent. The standard error on a share is about 3
   points, and no lean survives both the swap and the fair ties. **The
   initiative tie-break does favour RED**: `rollInitiative` gives a tie to the
   side listed first, so RED moves and fires first on **55%** of turns. But
   what that is worth in wins is below what 300 battles can detect (under ~5
   points). It is still a bias with no reason behind it, and is ⚠️ open: the
   document says 1d10 a side and nothing about ties.
3. **An attack is close to a switch, and the attacker who wins barely
   bleeds.**
   - A dug-in defender holds 81–99% of the time at 1:1.
   - At 2:1 the attack succeeds 86–100% at squad and platoon.
   - At company level, 1.6:1 fails (21%) and 3:1 succeeds (100%). That is the
     textbook 3:1 rule, but the platoon and squad fights tip at about 2:1.
   - Worse, a successful attacker at 3–4:1 loses **0–8%** of his men against a
     defender's 34–36%. Three rules combine to do it:
     - **An assault is one-sided** (`resolveAssault`): only the attacker fires.
       The defender does not reply unless it happened to be covering.
     - **Ordinary fire never applies the document's movement modifier** (+30%
       against a walker, −20% against a runner). Only covering fire does
       (rules decision 18), so a bounding attacker is no easier to hit than a
       stationary one.
     - **Cover is lost the moment a defender fires**: the document's own rule
       drops full cover to partial, −10%. A defender that shoots back is barely
       protected.

   All three are rules questions — ask the author, do not tune around them.
4. **A battle without morale cannot end while a command group lives.**
   `sideDefeated` ([`app/hotseat.ts`](../src/app/hotseat.ts)) wants **every**
   unit neutralised, command groups included, and a hidden HQ with nobody left
   to command is never found. **62–100%** of the platoon and company battles
   without morale ended that way (`fightersGone`); the game itself would have
   played on for ever. With morale on, `sideBroken` leaves command groups out
   and catches it — and both scenarios play with morale — so this bites only a
   game built without it. The fix is the same exclusion. ⚠️ Not made: it
   changes a victory condition, which is backlog 18's and the author's.
5. **Suppression piles up with numbers.** Every force shoots at the nearest
   enemy, so several bursts land on the same one. In platoon and company
   fights **55–71%** of the force-turns spent under suppression were pinned,
   against 5–27% in squad fights. If that feels wrong in play, the lever is
   `SUPPRESSION` (a cap per turn, or diminishing returns per extra firer), not
   the thresholds.
6. **Surrender is common where forces break at close range**: 1.6 squads in
   an average platoon meeting engagement, against 0.1 routs, because the
   bounding closes inside the 50 m `CORNERED_M` before the break comes. In
   attacks the defender routs instead. Whether that is the feel wanted is the
   author's call.
7. **The rare events are rare**, as asked:
   - Heroes: 0.2–4 per battle, rising with the number of men.
   - Rallies: 0.1–3.8 men per battle, and mostly at company scale, where a
     command group is near enough to get to them.

## Rulings 1–3 on trial: the sweep, 2026-09-23

The author asked for three of the harness's questions to be settled by
measurement. Each candidate answer is a switch in
[`engine/data/variants.ts`](../src/engine/data/variants.ts), off by default:

- **Ruling 1, the assault.** Does the defender fire back?
  - 1a: yes, at the assault's 70%.
  - 1b: yes, at its ordinary 30% inside 100 m.
  - Both are simultaneous: the defender replies with the men it had before the
    assault landed.
- **Ruling 2, the movement table's +30% / −20% in ordinary fire.**
  - 2b: added, with a 5% floor so a runner cannot become unhittable.
  - 2c: multiplied instead, ×1.3 walking and ×0.8 running.
- **Ruling 3, firing from full cover.**
  - 3b: it keeps −30% instead of dropping to −10%.
  - 3a: the document's "previous turn", read literally.

`npm run balance -- --sweep` plays every combination against the rules as they
stand. It uses morale on, the three attack sizes, 100 battles a cell, and the
ruling-4 tie rerolls. The **targets were written down before the run** (`TARGETS`
in [`sim/balance.ts`](../src/sim/balance.ts), ⚠️ ours, standard planning
figures):
- at 1:1 the attacker wins **≤ 30%**;
- at ~2:1, **30–70%**;
- at 3–4:1, **≥ 70%**, losing **10–30%** of his men.

| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| as it stands | squad | 11% | 89% | 96% | 3% | 2/4 |
| as it stands | platoon | 1% | 100% | 100% | 0% | 2/4 |
| as it stands | company | 0% | 21% | 100% | 8% | 2/4 |
| **as it stands** | **all** | | | | | **6/12** |
| 1a 2b 3b | squad | 4% | 78% | 98% | 4% | 2/4 |
| 1a 2b 3b | platoon | 16% | 100% | 100% | 1% | 2/4 |
| 1a 2b 3b | company | 1% | 4% | 100% | 10% | 2/4 |
| **1a 2b 3b** | **all** | | | | | **6/12** |
| 1a 2b 3a | squad | 17% | 91% | 98% | 3% | 2/4 |
| 1a 2b 3a | platoon | 52% | 100% | 100% | 0% | 1/4 |
| 1a 2b 3a | company | 0% | 12% | 100% | 9% | 2/4 |
| **1a 2b 3a** | **all** | | | | | **5/12** |
| 1a 2c 3b | squad | 15% | 85% | 94% | 4% | 2/4 |
| 1a 2c 3b | platoon | 3% | 100% | 100% | 0% | 2/4 |
| 1a 2c 3b | company | 0% | 17% | 99% | 8% | 2/4 |
| **1a 2c 3b** | **all** | | | | | **6/12** |
| 1a 2c 3a | squad | 28% | 90% | 98% | 2% | 2/4 |
| 1a 2c 3a | platoon | 22% | 100% | 100% | 0% | 2/4 |
| 1a 2c 3a | company | 0% | 30% | 100% | 7% | 3/4 |
| **1a 2c 3a** | **all** | | | | | **7/12** |
| 1b 2b 3b | squad | 4% | 79% | 98% | 4% | 2/4 |
| 1b 2b 3b | platoon | 27% | 100% | 100% | 1% | 2/4 |
| 1b 2b 3b | company | 0% | 5% | 100% | 10% | 2/4 |
| **1b 2b 3b** | **all** | | | | | **6/12** |
| 1b 2b 3a | squad | 18% | 91% | 98% | 2% | 2/4 |
| 1b 2b 3a | platoon | 48% | 100% | 100% | 0% | 1/4 |
| 1b 2b 3a | company | 0% | 11% | 100% | 9% | 2/4 |
| **1b 2b 3a** | **all** | | | | | **5/12** |
| 1b 2c 3b | squad | 15% | 85% | 94% | 4% | 2/4 |
| 1b 2c 3b | platoon | 2% | 100% | 100% | 0% | 2/4 |
| 1b 2c 3b | company | 0% | 18% | 99% | 8% | 2/4 |
| **1b 2c 3b** | **all** | | | | | **6/12** |
| 1b 2c 3a | squad | 27% | 90% | 98% | 2% | 2/4 |
| 1b 2c 3a | platoon | 17% | 100% | 100% | 0% | 2/4 |
| 1b 2c 3a | company | 0% | 30% | 100% | 7% | 3/4 |
| **1b 2c 3a** | **all** | | | | | **7/12** |

**None of them works.** Every configuration scores 5–7 of 12 against 6 for the
rules as they stand, and in every one a winning attacker at 3–4:1 still loses
0–10%. Instrumenting the platoon attack (36 v 9, per battle) shows why the three
rulings barely touch the problem:

- **The assault almost never happens: 0.2–0.3 per battle.** The defender breaks
  before the attacker is within 25 m, so ruling 1 has almost nothing to act on.
- **The defender fires at a running target 70–79% of the time.** The doctrine
  rushes in contact, so ruling 2 — which punishes walking and rewards running —
  makes the defender's fire *worse*.
- **56–59% of the defender's shots are fired pinned**, at half accuracy: four
  times the shooters pile four times the suppression on it.
- **Damage spreads thin over the bigger force.** The attacker lands 18.5 hits on
  9 men and puts 3.2 of them down. The defender lands 4.8 hits across 36 men,
  and at 1d4 a hit against the 8 points a man takes to go down, that is 0.1–0.2
  men. This is the document's own casualty model working as written: it rewards
  concentration, like Lanchester's square law.

A lever of ours was tried the same way and did not fix it either. Making
dug-in troops harder to suppress (×½ in full cover, ×¾ in partial) still left
the attacker at 0–10% (**6–8 of 12**). It was measured and reverted, not kept.

**What is left is the author's.**
- **The casualty model (1d4 a hit, 8 points to go down)** is transcribed, not
  chosen.
- **What `ירי מקביל` is.** The engine reads it as a sustained machine gun (the
  70 / 50 / 20% table) and the hotseat offers it as "מקלע". The harness fires
  every weapon on the small-arms table, so a Western defence's machine guns
  have not been measured at all. If a defender's gun teams fire on that table,
  the picture may change entirely.
- **Whether a prepared defender should be steadier under morale**, which is
  ours to propose.
- **What the ground adds.** All of this is flat and open. Dead ground, and
  buildings that give full cover, are what the real maps have.

## Second round: the defender's reply, and steadiness, 2026-09-23

The author ruled 2c (the movement modifier as a factor, decision 22) and 3b
(firing from full cover keeps −30%, decision 23). He also ruled that a
prepared defender is steadier (decision 24) and that a defender facing an
assault returns fire (ruling 1), with the rate to be measured. This sweep plays
the new rules with every reply rate (none, 30%, 50%, 70%) against three sizes
of steadiness:
- off;
- the default, +15 to tests and ×0.75 on losses;
- strong, +25 and ×0.5.

It uses the same targets as before.

| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| reply none · steady off | squad | 15% | 83% | 94% | 4% | 2/4 |
| reply none · steady off | platoon | 4% | 100% | 100% | 0% | 2/4 |
| reply none · steady off | company | 0% | 17% | 99% | 8% | 2/4 |
| **reply none · steady off** | **all** | | | | | **6/12** |
| reply none · steady +15 ×0.75 | squad | 8% | 84% | 95% | 5% | 2/4 |
| reply none · steady +15 ×0.75 | platoon | 5% | 100% | 100% | 0% | 2/4 |
| reply none · steady +15 ×0.75 | company | 0% | 5% | 100% | 11% | 3/4 |
| **reply none · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply none · steady +25 ×0.5 | squad | 2% | 80% | 93% | 5% | 2/4 |
| reply none · steady +25 ×0.5 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply none · steady +25 ×0.5 | company | 0% | 4% | 96% | 12% | 3/4 |
| **reply none · steady +25 ×0.5** | **all** | | | | | **7/12** |
| reply 30% · steady off | squad | 15% | 85% | 94% | 4% | 2/4 |
| reply 30% · steady off | platoon | 2% | 100% | 100% | 0% | 2/4 |
| reply 30% · steady off | company | 0% | 18% | 99% | 8% | 2/4 |
| **reply 30% · steady off** | **all** | | | | | **6/12** |
| reply 30% · steady +15 ×0.75 | squad | 6% | 86% | 95% | 5% | 2/4 |
| reply 30% · steady +15 ×0.75 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 30% · steady +15 ×0.75 | company | 0% | 5% | 100% | 10% | 3/4 |
| **reply 30% · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply 30% · steady +25 ×0.5 | squad | 3% | 83% | 93% | 5% | 2/4 |
| reply 30% · steady +25 ×0.5 | platoon | 1% | 100% | 100% | 1% | 2/4 |
| reply 30% · steady +25 ×0.5 | company | 0% | 4% | 95% | 12% | 3/4 |
| **reply 30% · steady +25 ×0.5** | **all** | | | | | **7/12** |
| reply 50% · steady off | squad | 14% | 84% | 94% | 4% | 2/4 |
| reply 50% · steady off | platoon | 6% | 100% | 100% | 0% | 2/4 |
| reply 50% · steady off | company | 0% | 17% | 99% | 8% | 2/4 |
| **reply 50% · steady off** | **all** | | | | | **6/12** |
| reply 50% · steady +15 ×0.75 | squad | 6% | 86% | 95% | 5% | 2/4 |
| reply 50% · steady +15 ×0.75 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 50% · steady +15 ×0.75 | company | 0% | 5% | 100% | 10% | 3/4 |
| **reply 50% · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply 50% · steady +25 ×0.5 | squad | 2% | 85% | 94% | 5% | 2/4 |
| reply 50% · steady +25 ×0.5 | platoon | 1% | 100% | 100% | 1% | 2/4 |
| reply 50% · steady +25 ×0.5 | company | 0% | 4% | 95% | 12% | 3/4 |
| **reply 50% · steady +25 ×0.5** | **all** | | | | | **7/12** |
| reply 70% · steady off | squad | 15% | 85% | 94% | 4% | 2/4 |
| reply 70% · steady off | platoon | 3% | 100% | 100% | 0% | 2/4 |
| reply 70% · steady off | company | 0% | 17% | 99% | 8% | 2/4 |
| **reply 70% · steady off** | **all** | | | | | **6/12** |
| reply 70% · steady +15 ×0.75 | squad | 6% | 86% | 96% | 5% | 2/4 |
| reply 70% · steady +15 ×0.75 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 70% · steady +15 ×0.75 | company | 0% | 5% | 100% | 10% | 3/4 |
| **reply 70% · steady +15 ×0.75** | **all** | | | | | **7/12** |
| reply 70% · steady +25 ×0.5 | squad | 2% | 85% | 94% | 5% | 2/4 |
| reply 70% · steady +25 ×0.5 | platoon | 2% | 100% | 100% | 1% | 2/4 |
| reply 70% · steady +25 ×0.5 | company | 0% | 4% | 95% | 12% | 3/4 |
| **reply 70% · steady +25 ×0.5** | **all** | | | | | **7/12** |

**What it says.**
- **The reply rate makes no difference at all.** The assault still almost
  never happens: the defender breaks first. The rate stays on trial, off by
  default, until something changes that.
- **Steadiness helps a little.** It moves the company fights to 3 of 4
  targets: a winning attacker at 3:1 loses 10–12%. It does not move the squad
  and platoon fights.
- **A prepared position starting in full cover changes nothing**
  (`--prepared-cover full`). The results are identical to the digit, because
  the defenders dig in to full cover by turn 7, before the attack arrives. The
  prepared defender already fights from the best cover the rules have.

**Why: the square law.** When every man can fire at every enemy, a force's
fighting power goes as the **square** of its numbers, so 2:1 in men is 4:1 in
power and 3–4:1 is 9–16:1. For a 2:1 attack to be a real fight and a 3:1 attack
to succeed — the planning figures — a prepared defender has to be roughly
**4–9 times as effective per man** as an attacker in the open. Under these
rules he is about 1.5–2 times: cover halves the chance of hitting him, less
when he shoots. That is why the outcome flips between 1:1 and 2:1, and why no
modifier of a few tens of percent moves it.

**The casualty model, measured** (the rules as they stand after decisions
22–24, 100 battles a cell, the threshold changed temporarily and reverted):

| A man is out of the fight at | Targets met | Squad: attacker down at 3:1 | Mirror, loser / winner down |
|---|---|---|---|
| 8 points (the document) | 7/12 | 5% | 32–39% / 15–24% |
| 5 points (the document's serious wound) | 7/12 | 7% | 36–50% / 13–26% |
| 4 points (one heavy hit) | 8/12 | 11% | 39–53% / 16–26% |

A deadlier hit makes the small force's fire count for more, but on its own it
does not close a factor of 2–4. See the handoff note for the options put to
the author.

## Third round: the wound-severity roll, 2026-09-23

**ירי מקביל is the coaxial gun** (decision 25), so a prepared infantry
defender's missing edge was never going to come from that table. The author put
the **wound-severity roll** on trial (`woundSeverity` in
[`data/variants.ts`](../src/engine/data/variants.ts)). Each small-arms hit rolls
a d10 instead of the document's 1d4 of damage:
- **light**: fights on, 2 points towards the document's 8;
- **serious**: out of the fight, bleeding;
- **killed**.

It is one die either way. The sweep tries three splits of the d10 — light /
serious / killed as 4/4/2, 5/4/1 and 3/5/2 — each with and without a 50%
reply in the assault, against the same targets.

| Configuration | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| 1d4 (document) · reply none | squad | 8% | 84% | 95% | 5% | 2/4 |
| 1d4 (document) · reply none | platoon | 5% | 100% | 100% | 0% | 2/4 |
| 1d4 (document) · reply none | company | 0% | 5% | 100% | 11% | 3/4 |
| **1d4 (document) · reply none** | **all** | | | | | **7/12** |
| 1d4 (document) · reply 50% | squad | 6% | 86% | 95% | 5% | 2/4 |
| 1d4 (document) · reply 50% | platoon | 2% | 100% | 100% | 1% | 2/4 |
| 1d4 (document) · reply 50% | company | 0% | 5% | 100% | 10% | 3/4 |
| **1d4 (document) · reply 50%** | **all** | | | | | **7/12** |
| severity 4/4/2 · reply none | squad | 6% | 65% | 94% | 17% | 4/4 |
| severity 4/4/2 · reply none | platoon | 2% | 88% | 100% | 5% | 2/4 |
| severity 4/4/2 · reply none | company | 0% | 10% | 99% | 10% | 3/4 |
| **severity 4/4/2 · reply none** | **all** | | | | | **9/12** |
| severity 4/4/2 · reply 50% | squad | 6% | 65% | 95% | 17% | 4/4 |
| severity 4/4/2 · reply 50% | platoon | 2% | 87% | 100% | 5% | 2/4 |
| severity 4/4/2 · reply 50% | company | 0% | 10% | 99% | 10% | 3/4 |
| **severity 4/4/2 · reply 50%** | **all** | | | | | **9/12** |
| severity 5/4/1 · reply none | squad | 9% | 71% | 92% | 17% | 3/4 |
| severity 5/4/1 · reply none | platoon | 1% | 87% | 100% | 5% | 2/4 |
| severity 5/4/1 · reply none | company | 0% | 10% | 96% | 10% | 2/4 |
| **severity 5/4/1 · reply none** | **all** | | | | | **7/12** |
| severity 5/4/1 · reply 50% | squad | 9% | 70% | 92% | 17% | 4/4 |
| severity 5/4/1 · reply 50% | platoon | 2% | 84% | 100% | 5% | 2/4 |
| severity 5/4/1 · reply 50% | company | 0% | 10% | 96% | 10% | 2/4 |
| **severity 5/4/1 · reply 50%** | **all** | | | | | **8/12** |
| severity 3/5/2 · reply none | squad | 6% | 69% | 90% | 15% | 4/4 |
| severity 3/5/2 · reply none | platoon | 2% | 79% | 100% | 6% | 2/4 |
| severity 3/5/2 · reply none | company | 0% | 14% | 99% | 10% | 2/4 |
| **severity 3/5/2 · reply none** | **all** | | | | | **8/12** |
| severity 3/5/2 · reply 50% | squad | 6% | 68% | 90% | 15% | 4/4 |
| severity 3/5/2 · reply 50% | platoon | 2% | 79% | 100% | 6% | 2/4 |
| severity 3/5/2 · reply 50% | company | 0% | 14% | 99% | 10% | 2/4 |
| **severity 3/5/2 · reply 50%** | **all** | | | | | **8/12** |

**What it says.**
- **4/4/2 is the first change that moves the balance: 9 of 12**, the best of
  any configuration so far.
  - The squad fights meet all four targets. A 2:1 attack wins 65%, a real
    fight, and a winning attacker at 3:1 loses **17%**, where the 1d4 cost him
    5%.
  - Each hit is now worth about the same whether it lands on 9 men or on 36,
    so a small force's fire stops being wasted.
- **The other splits do a little less**: 7–8 of 12.
- **The reply rate still makes no difference.**
- **What it still does not fix is the platoon fight.** A 2:1 attack wins 87%,
  and a winning platoon attacker loses about 5%. The square law is still two
  thirds of the problem there: four rifle squads' fire on one or two.

**What it does to an even fight** (the mirror, 100 battles a cell,
`--kinds meeting --morale on`):

| | 1d4: BLUE / RED / draw | turns | loser / winner down | 4/4/2: BLUE / RED / draw | turns | loser / winner down |
|---|---|---|---|---|---|---|
| squad | 43 / 49 / 8 | 12 | 39% / 15% | 47 / 53 / 0 | 6 | 58% / 18% |
| platoon | 39 / 53 / 8 | 10 | 35% / 19% | 47 / 49 / 4 | 8 | 44% / 22% |
| company | 41 / 47 / 12 | 10 | 32% / 24% | 40 / 50 / 10 | 9 | 37% / 24% |

- **Battles are shorter and splits no less even.**
- **Surrenders almost vanish** — 0.2 a platoon battle against 1.5 — because men
  now go down before the forces close to 50 m.
- **A losing squad goes further before it breaks: 58%.** Casualties come
  faster than the morale step, which judges once a turn.

**Adopted 2026-09-23:** 4/4/2 is the rule (decision 26), and the coaxial gun's
one roll a turn is confirmed (decision 25). The sweep now covers only the
assault reply rate, which is all that is left on trial.

## Fourth round: the squad drill, 2026-09-23

The rules were not the whole problem; **the decisions were**. The harness's
squads used to fight by a plain script. Every force shot at the nearest enemy
it knew of — and, it turned out, at where that enemy truly was rather than
where it was last seen. Half bounded while half fired, and nobody broke
contact.

Squads now fight by a **drill** ([`app/drill.ts`](../src/app/drill.ts)): a
`SquadDrill` of named numbers, carried out by one small executor that reads
only its side's view. That executor is also the one the simulated
subordinates will use (backlog 15), and its data is what the TTP editor will
edit (backlog 20). Two drills are defined:
- **The plain script**: the old doctrine, kept as the baseline.
- **The Western drill** (⚠️ ours, a first draft):
  - sectors of fire, 60° on each force's axis;
  - bounding overwatch with 50 m rushes;
  - the attacker opens fire at 300 m;
  - the defender holds its fire to 200 m, as a hold-fire order, so its
    covering fire keeps the discipline too;
  - a force breaks contact once, at half strength, falling back 150 m.

The same targets, the rules as they now stand (decisions 22–26), 100 battles a
cell, no reply in the assault:

| Drill | Echelon | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Targets met |
|---|---|---|---|---|---|---|
| plain script | squad | 6% | 67% | 94% | 17% | 4/4 |
| plain script | platoon | 2% | 87% | 100% | 5% | 2/4 |
| plain script | company | 0% | 10% | 99% | 10% | 3/4 |
| **plain script** | **all** | | | | | **9/12** |
| western drill | squad | 4% | 48% | 76% | 16% | 4/4 |
| western drill | platoon | 0% | 63% | 100% | 8% | 3/4 |
| western drill | company | 0% | 31% | 92% | 16% | 4/4 |
| **western drill** | **all** | | | | | **11/12** |

**The Western drill meets 11 of 12**, against the plain script's 9.
- **The platoon fight is fixed**: a 2:1 attack now wins 63%, where it was 87%.
- **The one miss**: a winning platoon attacker at 3–4:1 loses 8%, against a
  target of 10–30%. That is 36 men against 9, where the square law still has
  the most to say.
- **The reply rate in the assault still changes nothing** under either drill.

The mirror stays even (`--kinds meeting --drill western`, 200 battles a cell):

| | BLUE / RED / draw | turns | loser / winner down |
|---|---|---|---|
| squad | 46 / 53 / 1 | 7 | 53% / 18% |
| platoon | 46 / 51 / 4 | 9 | 41% / 21% |
| company | 47 / 45 / 9 | 9 | 37% / 24% |

## Fifth round: one wound rule for bullets and explosives, 2026-09-23

The author wants **the same wound rule for a bullet and a fragment**. His
guiding principle: **explosives cause most of the casualties in a modern war,
about 75%**. Today the two are resolved differently. A bullet rolls the
severity d10 (decision 26), so 60% of bullet hits put a man out. A fragment
rolls its document die against 8 points, so a grenade's 1d6 never puts a man
out in one hit, a mortar's 1d8 does 12.5% of the time, and artillery's 1d10
30%.

### The principle, checked

He is right. Across the wars with good records, explosives caused about
two-thirds to three-quarters of the wounds:

| War | Explosive | Bullet | Source |
|---|---|---|---|
| WWII (US Army) | 73% | about 20–30% | Owens et al. 2008, citing the historical series; Beebe & DeBakey: shell fragments 53% of the wounded, 62% of those who died of wounds, small arms 32% and 20% |
| Korea | 69% | about 27% | Owens et al. 2008; Reister |
| Vietnam | 65% | about 30% | Owens et al. 2008 |
| Iraq and Afghanistan, 2001–2005 | 78% | 18% | Owens et al. 2008, *J Trauma* 64(2) |
| Iraq and Afghanistan, 2005–2009 | 74% | 20% | Belmont et al. 2012 |
| Ukraine, 2022–2025 | 70–80% by artillery, then by drones | small | press and intelligence estimates, not medical series |

Sources:
- [Owens et al. 2008](https://pubmed.ncbi.nlm.nih.gov/18301189/)
- [Belmont et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3862555/)
- [the Army Medical Department's WWII and Korea wound-ballistics histories](https://achh.army.mil/history/book-korea-reister-ch3/)
- [JMVH, *Understanding weapons effects*](https://jmvh.org/article/understanding-weapons-effects-a-fundamental-precept-in-the-professional-preparation-of-military-physicians/)
- [Army Technology on drones in Ukraine](https://www.army-technology.com/news/drones-now-account-for-80-of-casualties-in-ukraine-russia-war/)

One more finding bears directly on the rule. **A fragment wound is less
likely to kill than a bullet wound**: about 10–20% against about 33%, from
the wound-ballistics literature. Explosives cause most of the casualties
because they hit many men from far away, not because each hit is worse.

### The models on trial

All four were put on trial as `woundModel` in `data/variants.ts`. That switch
was deleted once A0 became the rule (decision 27).
- **As it stands**: the severity roll for a bullet, the document's die
  against 8 for a fragment.
- **A (`severity`)**: every hit rolls the d10 severity. An explosive adds a
  shift for the size of its die: 1d6 +1, 1d8 +2, 1d10 +3, 2d10 +5.
- **A0 (`flat`)**: A without the shift. Every hit, bullet or fragment, rolls
  the same d10. This follows from the lethality finding above.
- **B (`dice`)**: every hit rolls its document die, a bullet 1d4, and a man
  is out at 5 points, where he starts bleeding.

The harness now records **what put each man out** (`Soldier.outBy`). A
company can also be given a **fire plan** (`--fires shells,bombs,lift`):
rounds a turn on the objective, spread across the defender's frontage, until
the attacker comes within the lift distance. Western drill, 100 battles a
cell, the balance targets as before. *Out by HE* is the share of men put out
by a hit that explosives put out, over the three attacks.

**No fire plan.** The company still gets its one mortar bomb a turn on the
nearest enemy it has seen.

| Model | Squad | Platoon | Company: 1:1 / ~2:1 / 3–4:1 win, attacker down | Out by HE, company | Targets met |
|---|---|---|---|---|---|
| as it stands | 4/4 | 3/4 | 0% / 31% / 92%, 16% — 4/4 | 36% | **11/12** |
| A: severity + shift | 4/4 | 3/4 | 0% / 19% / 66%, 28% — 2/4 | 62% | 9/12 |
| A0: flat severity | 4/4 | 3/4 | 0% / 20% / 81%, 24% — 3/4 | 55% | **10/12** |
| B: dice, out at 5 | 3/4 | 2/4 | 0% / 3% / 52%, 23% — 2/4 | 78% | 7/12 |

**A fire plan of one mortar bomb a turn** on the objective, lifting at
400 m (company only):

| Model | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Targets met |
|---|---|---|---|---|---|---|
| as it stands | 1% | 59% | 100% | 3% | 59% | 3/4 |
| A: severity + shift | 1% | 49% | 100% | 2% | 81% | 3/4 |
| A0: flat severity | 1% | 50% | 99% | 4% | **76%** | 3/4 |
| B: dice, out at 5 | 0% | 36% | 98% | 4% | 86% | 3/4 |

**One artillery shell a turn** (`--fires 1,0`): the 2:1 attack wins 93–100%
under every model, and explosives put out 86–95%. One shell and two bombs
(`--fires 1,2`): 100%, and 96–98%. The first run, a battery's four shells and
a mortar section's six bombs a turn, destroyed the defender before contact
at every echelon, even at 1:1.

### What it says

- **B is out.** A bullet's 1d4 can never put a man out in one hit, so small
  arms lose their effect and small-unit fights go wrong: platoon 2:1 wins
  91%. It meets 7 of 12 targets.
- **A and A0 leave squad and platoon fights unchanged.** Those fights have
  no explosives except the assault's grenades. The whole difference is at
  company level, where the mortar is.
- **A0 is the rule the evidence supports.** It meets 10 of 12 targets
  without a fire plan, and it is truly uniform: one die for every hit. With
  one mortar bomb a turn on the objective, **explosives put out 76% of the
  men**, which matches the author's figure. A's shift makes each fragment
  deadlier than a bullet, which the wound data contradicts. It also costs
  balance: 9 of 12, and a 3–4:1 company attack wins only 66%.
- **How much weight explosives carry is decided by the blast, not the wound
  rule.** One artillery shell a turn decides a 2:1 attack under every model.
  The document's blast table catches 70% of the men within 50 m of a single
  shell, and nothing reduces it:
  - Cover does not protect against blast. A quick experiment (reverted, not
    in the engine) cut the blast chance by half in partial cover and by
    three-quarters in full cover. The 2:1 attack under one shell a turn
    still won 67–89%.
  - Nothing says whether a "round" is one shell or a battery's volley.

  That is the next ruling, not a harness setting.

**Recommendation (ours), and what the author decided:**
1. Adopt A0: one d10 severity for every hit, bullet or fragment. Explosives
   dominate by how many men they hit, as they do in the data. **Adopted
   2026-09-23 as rules decision 27.** The switch is gone. The rules now play
   exactly as the A0 rows above. Rerun: company, no fire plan, 0% / 20% /
   81% / 24%, with 55% out by HE.
2. Then rule on the blast: what cover does against it, and what one round
   is. **One round is one shell (decision 28), and cover counts against it,
   option a (decision 29). See the sixth round.**

**A side bias seemed to surface once A0 was the rule, and it was the seeds.**
The company mirror (200 battles, Western drill) gave BLUE / RED / draw
52 / 39 / 10, and 50 / 37 / 13 with `--swap`, and it was 47 / 45 before. It
looked like something in the explosive path favouring BLUE. It is not
(2026-09-23, company meeting, Western drill, morale on):

| Seeds | BLUE | RED | draw |
|---|---|---|---|
| 1–400 | 186 | 186 | 28 |
| 1000–2999 | 969 | 855 | 176 |
| 5000–5999 | 458 | 449 | 93 |
| 10000–13999 | 1773 | 1880 | 347 |
| **all 7,400** | **3386** | **3370** | 644 |
| 10000–13999, RED's units added first | 1817 | 1816 | 367 |
| 20000–20199 (`--seed 20000`) | 44% | 49% | 8% |

- Pooled, the mirror is level: 3386 to 3370.
- The lean moves with the **seed window**: BLUE ahead on 1000–2999, RED
  ahead on 10000–13999.
- Adding RED's units to the game first, the prime suspect, changes nothing.
- `--swap` could not tell the two apart. It replays the **same seeds**, so
  its noise is correlated with the unswapped run. It separates side from
  position; it does not give you a second sample.

Every run on this page before this one used seeds 1000 onwards, because the
CLI had no way to choose. It has one now: `--seed <first>`. **Before
calling a lean real, rerun it on a disjoint window.** At 200 battles a
share's standard error is about 3.5 points, and the gap between two shares
about 5.

## Sixth round: cover against a shell, 2026-09-23

The author's answers to the blast question:
- **One round is one shell** (rules decision 28). A battery's mission is
  several rounds, each with its own scatter and blast.
- **Cover against blast: "test a and b".** He chose **a** after this round
  (rules decision 29; `BLAST_COVER_FACTOR` in `data/explosives.ts`; the
  trial switch and the `--blast-cover` flag are gone). Both were on trial as
  `blastCoverFactor` in `data/variants.ts`, harness flag `--blast-cover
  partial,full`. Both apply to indirect fire only, and multiply each man's
  blast chance by the cover his force is in:
  - **a** — partial ×½, full ×¼ (`--blast-cover 0.5,0.25`);
  - **b** — full cover only, ×¼ (`--blast-cover 1,0.25`). The factor is ours;
    it is a's, so the two differ only on partial cover.

Western drill, 100 battles a cell, seeds from 1000, the same targets as
before. A prepared position starts in partial cover unless the row says
full. Company only: a company is what calls fire.

| Fire | Prepared in | Cover vs blast | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|---|
| none (a mortar bomb a turn on the nearest enemy seen) | either | none | 0% | 20% | 81% | 24% | 55% | 3/4 |
| | either | a or b | 0% | 15% | 62% | 25% | 50% | 2/4 |
| a bomb a turn on the objective (`--fires plan`) | partial | none | 1% | 50% | 99% | 4% | 76% | 3/4 |
| | partial | a | 0% | 21% | 95% | 12% | 67% | 3/4 |
| | partial | b | 0% | 31% | 97% | 4% | 75% | 3/4 |
| | full | none | 1% | 50% | 99% | 4% | 76% | 3/4 |
| | full | a or b | 0% | 16% | 88% | 19% | 60% | 3/4 |
| one shell a turn (`--fires 1,0`) | partial | none | 5% | 99% | 100% | 0% | 91% | 2/4 |
| | partial | a | 1% | 78% | 100% | 1% | 83% | 2/4 |
| | partial | b | 2% | 95% | 100% | 0% | 90% | 2/4 |
| | full | a or b | 0% | 51% | 99% | 5% | 74% | 3/4 |
| a battery and a mortar section: 4 shells, 6 bombs a turn (`--fires 4,6`) | partial | none | 20% | 100% | 100% | 0% | 99% | 2/4 |
| | partial | a | 2% | 100% | 100% | 0% | 98% | 2/4 |
| | partial | b | 16% | 100% | 100% | 0% | 99% | 2/4 |
| | full | a or b | 1% | 100% | 100% | 0% | 97% | 2/4 |

Squad and platoon rows do not change without a fire plan. They have no
explosives but the assault's grenades, and those are not indirect fire.

### What it says

- **Cover is only half the answer.** It takes one shell a turn from
  deciding a 2:1 attack (99%) to an even one (51%), but only against a
  defender in **full** cover, and there a and b are the same thing. Against
  a battery's whole mission, 4 shells and 6 bombs a turn, the 2:1 attack
  still wins 100% under either. Cover then only stops that fire from winning
  a 1:1 attack (20% down to 1–2%).
- **a and b differ only where the defender is in partial cover**, that is
  a hasty position or men against a wall. Under a it is worth something
  (one shell a turn: 99% down to 78%); under b nothing.
- **Both cost the attack without a fire plan.** The defender digs in to full
  cover while the attacker walks up in the open, so the company's own mortar
  bomb does less to it: the 3–4:1 attack falls from 81% to 62% and misses
  its target. The fire plan is what brings it back (88–97%).
- **The 75% principle holds under either** with a fire plan on a dug-in
  defender: 60–75% out by HE, against 76% without cover.
- **What would decide it is how much fire a company gets**, not what cover
  does to it. How many shells one company can call in a turn is the
  question after this one. It is decision 8's one mission per side per turn,
  now that a mission is one shell, and later the ammunition item
  (backlog 12).

## Seventh round: how accurate the guns are, 2026-09-23

The author asked what changing artillery accuracy would do. First, what it is
today. This is the document's dispersion table, `data/artillery.ts`:
- Each axis is rolled on its own. There is a **70% chance** of landing on
  target on each axis, so **49%** of rounds land exactly on the aim point.
- A miss in range (short or long) is **50–200 m**, rolled as 1d4 × 50. A miss
  in line (left or right) is **25–100 m**, rolled as 1d4 × 25.
- That puts **65%** of rounds within 50 m of the aim, **82%** within 100 m
  and **98%** within 200 m. The mean miss is 52 m.
- The blast is as wide as the miss. For a man standing at the aim point, an
  artillery round catches him **58%** of the time, against 70% on a direct
  hit. A mortar bomb catches him **37%** of the time, against 50%. So a miss
  costs a shell only about a sixth of its effect.

Then a probe, a **temporary edit, not committed**: the table's miss distance
and its on-target chance were changed together, under decision 29, with the
company only. "Off" is the percentile that deviates on each side, so 15 is
today's 70% on target and 25 is 50%.

| Accuracy | Fire | 1:1 win | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|
| today (miss ×1, off 15) | none | 0% | 15% | 62% | 25% | 50% | 2/4 |
| | a bomb a turn on the objective | 0% | 21% | 95% | 12% | 67% | 3/4 |
| | one shell a turn | 1% | 78% | 100% | 1% | 83% | 2/4 |
| | 4 shells + 6 bombs a turn | 2% | 100% | 100% | 0% | 98% | 2/4 |
| 50% on target (miss ×1, off 25) | none | 0% | 19% | 67% | 24% | 46% | 2/4 |
| | a bomb a turn | 0% | 37% | 93% | 15% | 58% | **4/4** |
| | one shell a turn | 4% | 86% | 100% | 2% | 78% | 2/4 |
| | 4 + 6 | 8% | 100% | 100% | 0% | 98% | 2/4 |
| misses twice as far (miss ×2, off 15) | none | 0% | 22% | 66% | 24% | 47% | 2/4 |
| | a bomb a turn | 2% | 30% | 95% | 15% | 62% | **4/4** |
| | one shell a turn | 8% | 67% | 96% | 6% | 80% | 3/4 |
| | 4 + 6 | 44% | 100% | 100% | 0% | 100% | 1/4 |
| both (miss ×2, off 25) | none | 0% | 27% | 74% | 22% | 40% | 3/4 |
| | a bomb a turn | 6% | 40% | 90% | 15% | 51% | **4/4** |
| | one shell a turn | 9% | 56% | 93% | 10% | 70% | **4/4** |
| | 4 + 6 | 64% | 100% | 100% | 1% | 100% | 1/4 |
| miss ×4, off 25 | none | 4% | 50% | 92% | 17% | 29% | **4/4** |
| | a bomb a turn | 5% | 70% | 92% | 14% | 40% | **4/4** |
| | one shell a turn | 12% | 62% | 92% | 14% | 57% | **4/4** |
| | 4 + 6 | 94% | 98% | 99% | 9% | 100% | 1/4 |

### What it says

- **Less accuracy helps a single round's balance.** With miss ×2 and 50% on
  target, one shell a turn stops deciding a 2:1 attack (56%) and meets all
  four company targets. So does a bomb a turn.
- **Against a battery's whole mission it does the opposite.** With 4 shells
  and 6 bombs a turn, a 1:1 attack wins 2% today, 44–64% at miss ×2, and 94%
  at miss ×4. The defending company is spread over some 400 m, and the blast
  is wide. A concentrated mission hits the same men twice. A scattered one
  covers the whole company. Inaccuracy turns a mission into area fire, and
  area fire suits a dispersed target.
- **Without a fire plan, less accuracy helps the attacker too.** The
  defender's own mortar bomb, aimed at the advancing attacker, misses more.
  At miss ×4 the 3–4:1 attack is back to 92%, and explosives put out only
  29% of the men, far off the 75% principle.
- **So accuracy is not the lever for massed fire.** How much fire a company
  may call is. Accuracy is a fair lever for how decisive **one** round is.

## What the sources say cover does against a shell, 2026-09-23

The author asked what is published on this. Every figure below is
secondhand. The primary tables, the JMEM and FM 6-141-2, are classified.
The pages were read through search results, because the sandbox could not
open them.

**Lethal areas by posture**, as quoted from open compilations:

| Round | Standing | Prone | Foxhole | Prone ÷ standing | Foxhole ÷ standing |
|---|---|---|---|---|---|
| 105 mm M1, impact, 60° | 390 m² | 140 m² | — | 0.36 | — |
| 155 mm M107, impact, 60° | 971 m² | 346 m² | 130 m² | 0.36 | 0.13 |
| 155 mm, air burst, 60° | 1,240 m² | 939 m² | 130 m² | 0.76 | 0.10 |

- **FM 7-90** (mortars, Appendix B): fire at standing men is almost twice as
  effective as at prone men. A proximity fuze is about 40% more effective
  than a surface burst against prone men. Against men in open fighting
  positions without overhead cover, it is about five times as effective as
  an impact fuze.
- **FM 21-75** and its successors: a foxhole protects against every shell
  except a direct hit. Overhead cover is what protects against an air burst.
- **Troop Reaction and Posture Sequencing** (US Army, 1970s): at the first
  impact, 58% of men in a hasty defence were standing. Two seconds later 29%
  were, and after eight seconds none were. Going to ground cuts casualties
  by as much as two thirds. That is why time-on-target fire, every round
  landing at once, is the deadliest.

**How that compares with decision 29.** If "none" is a man on his feet:
- Partial cover, ×½, sits between prone (×0.36) and FM 7-90's "twice".
  That is fair.
- Full cover, ×¼, is **about twice as generous to the shell** as the
  sources. A foxhole is ×0.10–0.13 against standing men.

A probe of full cover at ×⅛ and ×1/10 (temporary edit, not committed;
company, prepared positions in full cover):

| Full cover | Fire | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|
| ×¼ (the rule) | none | 15% | 62% | 25% | 50% | 2/4 |
| | a bomb a turn | 16% | 88% | 19% | 60% | 3/4 |
| | one shell a turn | 51% | 99% | 5% | 74% | 3/4 |
| | 4 shells + 6 bombs | 100% | 100% | 0% | 97% | 2/4 |
| ×⅛ | none | 13% | 51% | 26% | 50% | 2/4 |
| | a bomb a turn | 18% | 68% | 24% | 56% | 2/4 |
| | one shell a turn | 24% | 96% | 12% | 66% | 3/4 |
| | 4 + 6 | 100% | 100% | 0% | 96% | 2/4 |
| ×1/10 | none | 13% | 49% | 26% | 50% | 2/4 |
| | a bomb a turn | 15% | 68% | 25% | 56% | 2/4 |
| | one shell a turn | 22% | 92% | 16% | 63% | 3/4 |
| | 4 + 6 | 100% | 100% | 0% | 96% | 2/4 |

At the sources' figure, a dug-in company can take a shell a turn: a 2:1
attack wins about a quarter of the time. A battery's whole mission still
decides the fight. Two things the sources raise that the game does not
model:
- **The first rounds catch men on their feet.** Our cover is a state of the
  force, and a force in the open that has just been shelled is as exposed
  on the next turn. The sources say it would be lying down.
- **The fuze.** An air burst largely defeats going prone and open holes,
  but not overhead cover. The document has one kind of shell.

## Eighth round: a company's fire support, and accuracy by CEP, 2026-09-23

The author's next steps after the sources:
- Full cover against a shell goes to ×⅛ (decision 29).
- The first volley (decision 30) and air-burst fuzes (decision 31) are rules.
- Test a company with **2 artillery missions of 4 shells and 3 mortars**,
  with artillery at **15 m CEP** and a mortar's accuracy from the sources.
  "Usually it's adjustable — with increasing accuracy up to a cap."

### Accuracy, on trial

This is `cepDispersion` in `data/variants.ts`, harness flag `--cep
weapon:first:cap`. Each round scatters as a circular normal with CEP
`max(cap, first ÷ 2^adjustments)`. An adjustment is the same side's same
weapon firing again the next turn within 100 m of its last aim; the
observer's bracket halves the error each time.

| Weapon | First round | Cap | Source |
|---|---|---|---|
| Artillery | 15 m | 15 m | The author. For scale: an unguided 155 mm round is 50–267 m CEP at long range (M777 spec 50–200 m at 25 km; M549A1 267 m at maximum range). A PGK fuze is ≤30 m, Excalibur about 4 m. So 15 m is precision-fuze accuracy. |
| Mortar | 100 m | 25 m | An unadjusted 120 mm bomb is 136 m CEP at maximum range, 76 m with modern fire control. Doctrine fires for effect once the bracket is within 50 m. 25 m, the tube's own spread at working ranges, is ours. |

Things this leaves out:
- An observer. Adjustment only needs the same aim point on consecutive turns.
- A battery's shared error. Every round scatters on its own.

### The allocation

Read as follows:
- **2 × 4 shells for the battle**, fired on the first two turns as
  preparation. They land on turns 3 and 4, 80 m apart on the objective.
- **3 tubes at the document's 3 bombs a tube a turn**: three missions of 3
  bombs a turn, 80 m apart, until the attacker is within 400 m.
- For comparison: 3 tubes at 1 bomb each, and the missions a turn rather
  than a battle.
- The defender keeps only its company's one bomb a turn on the nearest enemy
  it has seen.

Company, Western drill, 100 battles a cell, seeds from 1000. "Table" is the
document's dispersion; "CEP" is the trial above. The defender's prepared
position is in partial cover (a hasty position) or full (dug in, no roof).

**Each part alone** (impact fuze). Rerun after the review fixes: everything
landing in one turn now finds the men as they were, and each tube adjusts
onto its own point.

| Fire | Accuracy | Prepared in | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|
| none (the company's one bomb a turn) | table | either | 16% | 62% | 25% | 45% | 2/4 |
| | CEP | either | 14% | 58% | 24% | 45% | 2/4 |
| 2 × 4 shells for the battle | table | partial | 81% | 100% | 0% | 81% | 2/4 |
| | table | full | **29%** | 93% | 16% | 59% | 3/4 |
| | CEP | partial | 95% | 100% | 0% | 82% | 2/4 |
| | CEP | full | **36%** | 93% | 13% | 60% | **4/4** |
| 3 tubes × 1 bomb a turn | table | partial | 73% | 100% | 0% | 85% | 2/4 |
| | table | full | **27%** | 99% | 6% | 67% | 2/4 |
| | CEP | partial | 90% | 100% | 0% | 85% | 2/4 |
| | CEP | full | **36%** | 99% | 3% | 70% | 3/4 |
| 3 tubes × 3 bombs a turn | table | partial / full | 100% / 91% | 100% | 0% | 88–95% | 2/4 |
| | CEP | partial / full | 100% / 99% | 100% | 0% | 90–95% | 2/4 |

**Together** (the 1:1 attack never wins more than 11%, except as noted):

| Fire | Accuracy | Fuze | Prepared in | ~2:1 win | Out by HE |
|---|---|---|---|---|---|
| 2 × 4 shells a battle + 3 × 3 bombs a turn | any | any | any | 100% | 93–97% |
| 2 × 4 shells a battle + 3 × 1 bomb a turn | table | impact | full | **61%** | 82% |
| | CEP | impact | full | 80% | 84% |
| | any | impact | partial | 100% | 94% |
| | any | air burst | any | 100% | 95–96% |
| 2 × 4 shells **a turn** + 3 × 3 bombs a turn | any | any | any | 100% (1:1: 21–40% with air burst on the table's accuracy) | 96–99% |

### What it says

- **The allocation as given decides the 2:1 attack every time**, under
  every accuracy, fuze and position. Most of that is the mortar section. At
  the document's rate, 3 tubes fire 9 bombs a turn, about 36 over the
  approach. Alone, that wins a 2:1 attack 90–100% of the time.
- **The two artillery missions are about right on their own.** Against a
  dug-in company they give 29–36% at 2:1 and 93% at 3–4:1. At 15 m CEP that
  meets all four company targets. Explosives put out 60% of the men.
- **So does a section at 1 bomb a tube a turn.** Both together give 61% at
  2:1 on the table's accuracy and 80% at 15 m CEP, against a dug-in defender.
- **Digging in is what the numbers turn on.** Against a hasty position,
  every allocation above wins a 2:1 attack 73–100% of the time.
- **An air burst wins against any defender without a roof.** It finds open
  holes at ×⅝, so every air-burst row is 100%. That is decision 31 working
  as the sources say. It also means the question is whether a prepared
  position has overhead cover. Today only a building does.
- **What accuracy is worth depends on how much fire there is.** Against a
  dug-in company, the trial's accuracy adds 7–9 points to a 2:1 attack
  with each part alone. With both parts together it adds 19 points (61% to
  80%). Against the full allocation it makes no difference, because the
  attack already wins.
- **Without a fire plan, decisions 29–31 barely move the attack.** With
  the table's accuracy, the 3–4:1 attack still wins 62% and misses its
  target, as it did before them. With the trial's it wins 58%. A company is
  expected to attack with fire support; these rows are its absence.
- **The fire is one-sided.** The defender has no section of its own, no
  counter-battery fire and no way to move off a shelled position.

## Ninth round: fire missions, and the defender's own mortars, 2026-09-23

The author's answers to the eighth round:
1. **Mortars fire as missions.** One bomb a turn until one lands close to
   the mark, then fire for effect.
2. **A prepared position has overhead cover**: a roof against an air burst
   (decision 31).
3. He asked what we suggest on the accuracy trial. See the handoff.
4. **Yes to fire support for the defender.**
5. **Artillery accuracy of 50–270 m CEP**, improving with each round.

### What was built

**Adjustment** (the accuracy trial, `cepDispersion`):
- Each earlier round from the same side's same weapon within 100 m of the
  aim halves the CEP, down to the cap.
- Once a round lands within 50 m of its aim, the guns are **on the mark**
  (`Game.isOnTheMark`) and fire at the cap. Missions within 100 m of that
  point are on the mark too, so a section's sheaf is.
- Artillery is **270 m to 50 m**; a mortar is **100 m to 25 m**. The 50 m
  for "on the mark" is ours, from the doctrinal "within 50 m of the
  adjusting point".
- **Registered targets** (`registeredTargets`): a side's guns are already on
  the mark at points it planned before the battle.

**The fire plan** (`--fires ...,adjust=on`):
- One round a turn on the centre of the objective until it is on the mark,
  then the full missions, 80 m apart, until the attacker is within 400 m.
- Artillery's 2 × 4 shells count fire for effect only.

**The defender's section** (`--defender-fires mortar=3x3,registered=200/400`):
- 3 tubes on the nearest attacker it has seen, adjusting the same way.
- Targets registered 200 m and 400 m in front of its line.
- The company's one bomb a turn goes on as before, for both sides.

**Two things the traces showed first:**
- **Nobody sees anybody until about 250–300 m.** Across 700 m of open ground
  the Western drill advances about 50 m a turn. No side detects the other
  before turn 10.
- **With the eighth round's fire, the defender broke on turn 7** without
  having seen the attacker, 400 m away. It never fired a shot, so the attack
  cost nothing. That is where the 100% came from.

### Results

Company, Western drill, 100 battles a cell, seeds from 1000, the accuracy
trial on throughout. A prepared position in **full** cover now has a roof,
so impact and air burst give the same results there, within noise.

| Attacker's fire | Prepared in | Defender's section | ~2:1 win | 3–4:1 win | 3–4:1 attacker down | Out by HE | Company targets |
|---|---|---|---|---|---|---|---|
| none | either | off | 16% | 61% | 24% | 45% | 2/4 |
| | either | **on** | **0%** | **0%** | 5% | 96% | 1/4 |
| 2 × 4 shells for the battle | full | off | 50–51% | 95–96% | 11% | 62% | **4/4** |
| | full | on | 1–2% | 33% | 14% | 97% | 2/4 |
| | partial | off | 78% (impact), 99% (air) | 100% | 0–1% | 80–94% | 2/4 |
| | partial | on | 27% (impact), 85% (air) | 89–100% | 0–3% | 97–98% | 2/4 |
| 3 tubes × 3 bombs a turn | full | off | 45–46% | 100% | 1% | 76% | 3/4 |
| | full | on | 2% | 91% | 2% | 97% | 2/4 |
| | partial | off | 92% (impact), 100% (air) | 100% | 0% | 87–93% | 2/4 |
| | partial | on | 43% (impact), 95% (air) | 100% | 0% | 97–98% | 3/4 (impact) |
| 2 × 4 shells + 3 × 1 bomb | full | off | 77–78% | 100% | 1% | 79% | 2/4 |
| | full | on | 17–18% | 92–93% | 2% | 97% | 2/4 |
| 2 × 4 shells + 3 × 3 bombs (the author's) | full | off | 89% | 100% | 0% | 86% | 2/4 |
| | full | on | **39–40%** | **100%** | 0% | 97% | **3/4** |
| | partial | off | 100% | 100% | 0% | 95–96% | 2/4 |
| | partial | on | 96% (impact), 100% (air) | 100% | 0% | 98–99% | 2/4 |

Where impact and air burst differ, the row gives both. The 1:1 attack never
wins more than 10%.

### What it says

- **Fire missions make artillery about right on its own.** Adjusting from
  270 m takes several turns: the first shell lands within 50 m only 2% of
  the time, the fourth half the time. So two missions of four shells, fired
  for effect once on the mark, give a 2:1 attack on a dug-in company 50%, and
  a 3–4:1 attack 96%. That meets all four company targets.
- **The defender's own section decides almost everything.** With targets
  registered on the approach, it fires for effect at 25 m CEP the turn it
  sees the attacker. Without fire support of its own, a company never takes
  a prepared position, even at 3–4:1.
- **With both sides firing, the author's allocation lands in the band.** A
  2:1 attack wins 39–40% and a 3–4:1 attack 100% against a dug-in, roofed
  defender.
- **But it is a fire duel, and it is won before contact.** Under the
  author's allocation, the attacker who wins at 3–4:1 loses nobody (0%,
  against a target of 10–30%): the defender broke under fire before it saw
  him. The attacker who loses is broken by
  registered fire as he comes into view. Explosives put out 96–99% of the
  men. That is well past the author's 75%, because small arms rarely get
  the chance.
- **The fire never runs out.** Nine bombs a turn for as long as there is a
  target is the document's rate of fire with no ammunition behind it
  (backlog 12). How much a section can fire in a battle is the lever that
  would turn this duel into a fight.
- **An air burst still matters against a hasty position**, which has no
  roof. Against partial cover, the defender's section on, it takes a 2:1
  attack from 27–43% to 85–95%.

## How the engine scales, 2026-09-23

The same scripted mirror as the harness, grown by the company, timed per turn
over 18 turns — through the approach and into the fight — in the dev
container.

| Forces | Units | Men | Flat, ms/turn | Tel Azeka, ms/turn | Where it goes |
|---|---|---|---|---|---|
| 1 company a side | 34 | 238 | 6 | 4 | morale step 3–5 |
| 3 companies a side | 98 | 690 | 14 | 14 | morale step 12 |
| 9 companies a side | 290 | 2046 | 81 | 102 | morale step 69–85 |
| 1 company, **a token a man** | 208 | 238 | — | 26 | morale 15, move 8 |
| 3 companies, **a token a man** | 620 | 690 | — | 206 | morale 120, move 56 |

- **Squads as tokens, with every man inside rolled on his own** — which is
  what the engine already does — **stays under a tenth of a second a turn at
  2,000 men**.
- **A token per man costs about 15 times as much for the same men, and grows
  with the square of the tokens.** Tripling the men multiplied the time by 8.
- **The morale step is most of every row.** `leaderBonus` walks every unit
  for every man, several times a step. Indexing the leaders by side once per
  step would take most of it away. Not done, since nothing is slow yet.

## Observations from play, for when the balance pass happens

- **Casualties are rare in a short battle.** Hits accumulate damage points and a
  soldier needs 8 to go down, so a 5-turn skirmish often ends 0–1 casualties.
  The what-if spread reads `0–1 (חציון 0)` for that reason, not because the
  re-roll is broken. If the balance pass wants visible outcomes sooner, the
  lever is the casualty thresholds, not the hit chances.
- **The defender's advantage is large.** Continuous observation, hidden while
  stationary, and an ambush that springs itself compound: in the demo RED sees
  everything and BLUE sees nothing until it is fired on. That may be correct for
  a prepared defence; it is worth playing an attack that uses smoke and scouts
  before deciding.
- **Covering fire has not been measured against a real attack.** The posture
  holds until something sets it off, which on the demo map meant a squad
  watched for six turns while the attacker climbed. It is not free — holding it
  spends that force's action every one of those turns (decision 18) — but
  whether "watch indefinitely" is too strong against an attack that has to
  cross open ground is exactly the sort of thing only play will say. The lever
  if it is: an expiry, or a cost to re-declare.
- **A charge laid in play has not been measured yet.** Nobody has played the
  two turns out against a moving attack, so whether 2 turns is cheap or
  expensive is an open question rather than a recorded figure. The thing to
  measure when the balance pass comes: how often a layer survives two
  uninterrupted turns within reach of the enemy's axis at all.
- **Morale has not been played against a real attack.** It has been
  measured in a symmetric firefight (above) and driven through the demo, where
  RED's forward squad lost men to breaks after the attrition rule had already
  taken it. Nobody has yet played an attack that uses the withdrawal order, a
  commander walking up to rally, or the side breaking before it is wiped out.
- **Full camouflage at setup is strong.** The demo's forward RED squad starts at
  the -50% cap, which is the author's prepared-position reading. Against it, a
  walking searcher has 30% inside 20 m and a scout 40%.
