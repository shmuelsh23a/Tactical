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
