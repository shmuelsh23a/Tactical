# Validation — the game's numbers against the sources

**First written 2026-09-28**, with rules decisions 40 (a turn is 60 s), 41
(blast and the tank gun from published data), 42 (rates of fire), 43
(calibration to 75% of losses by explosives) and 44 (the historical
breakpoints, and the squads' grenadiers). This page records what the
research says about the numbers that decide a firefight — hit chances, blast
and wounds — and what `npm run validate` measures the game doing. Rerun it after
any change to those numbers and update the tables here.

[balance.md](balance.md) asks whether a battle comes out the way a planner
expects. This page asks something narrower: whether each piece of the battle is
the size the research says.

## How this was checked, and how far to trust it

- **Peer-reviewed literature** was searched through Consensus (Semantic
  Scholar, PubMed, Scopus). Those papers are cited by title below, with links.
- **Weapon figures** (lethal radii, hit probabilities) are mostly in manuals
  and reports that are not peer-reviewed, and the primary tables (JMEM,
  FM 6-141-2) are classified. These were read **through search results**,
  because the sandbox's network proxy blocked most of the source sites. Treat
  them as secondhand, as balance.md already does for the 155 mm lethal areas.
- A figure marked **ours** was derived or chosen here, not found.

## The time basis (rules decision 40)

A turn is **60 seconds**. The document never said. Its movement (50 m a turn
walking, 100 m running) reads as tactical movement in bounds at that scale.
Every rate below is per minute, which is per turn.

## Blast (rules decision 41) — changed

**What the sources measure.** A fragmenting round is described by its **lethal
area**: the area whose men, counted together, are incapacitated as if everyone
inside it were and nobody outside it. Its lethal radius is where the density of
effective fragments falls to about one per m² ([Catovic et al.
2021](https://consensus.app/papers/details/e534d9b9613d5ef3b80b936b760d80d5/?utm_source=claude_desktop)).
A first-order method gives **10.6 m for the 105 mm M1** against a quoted
9.6 m ([William
2016](https://consensus.app/papers/details/f61b3936bcfa5da09da6a141e4d9707f/?utm_source=claude_desktop)).
That matches the open compilations' 390 m² for the same round (balance.md). For
a standing person near a 105 mm detonation, injury becomes more likely than
death beyond about 40 m ([Qin et al.
2021](https://consensus.app/papers/details/abb5b688b2f0597b8b51ec5420e19b58/?utm_source=claude_desktop)).

**What the document had.** Per man, 70% within 50 m, 50% to 100 m and 25% to
200 m for artillery; 40% to 50 m for a rifle grenade. The engine puts a force at
one point, so every man within a band took the band's chance.

**How the research figures are derived.** `src/engine/data/lethality.ts`:

1. A force's men are spread over a disc of **25 m radius**, a squad's 50 m
   frontage (ours).
2. A round landing `d` m from the force's point incapacitates the share of
   that disc its lethal area covers.
3. A hit incapacitates 6 times in 10 (the wound roll: serious or killed), so a
   man's chance to be **hit** is that share ÷ 0.6. The light wounds come on
   top.
4. Averaged over 10 m rings, to two places. A test integrates the bands back
   and gets the lethal area to within 7%.
5. Against men only. A vehicle is reached, and connected with, by the
   document's bands under either setting.

| Weapon | Lethal area, standing, impact | Source |
|---|---|---|
| Artillery (155 mm) | 971 m² | Open JMEM compilations (balance.md); agrees with the peer-reviewed 105 mm figure above |
| Mortar (81 mm) | 476 m² | **Ours**: the 155 mm area scaled by the square of the published effective casualty radii (81 mm 35 m, 155 mm 50 m) |
| Tank HE | 390 m² | **Ours**, a proxy: a 105 mm shell's. No open figure found |
| Rifle grenade (40 mm) | 79 m² (5 m radius) | M433's published casualty radius (FAS) |
| RPG against men | 154 m² (7 m radius) | **Ours, unverified**: between the 40 mm and the 105 mm |

**Measured** (`npm run validate`, 2,000 rounds each, nine men standing in the
open):

| Weapon | Lethality | Men out, round on the point | Men out, round anywhere within 50 m | Lethal area predicts, on the point |
|---|---|---|---|---|
| Artillery | document | 3.82 | 3.79 | 4.45 |
| | research | 4.43 | 1.07 | 4.45 |
| Mortar | document | 2.74 | 2.76 | 2.18 |
| | research | 2.19 | 0.53 | 2.18 |
| Tank HE | document | 2.74 | 2.76 | 1.79 |
| | research | 1.76 | 0.48 | 1.79 |
| Rifle grenade | document | 2.14 | 2.17 | 0.36 |
| | research | 0.39 | 0.10 | 0.36 |
| RPG against men | document | 2.72 | 1.73 | 0.71 |
| | research | 0.72 | 0.17 | 0.71 |

**Verdict.** The document's shell on the point was about right. Its fault was
**reach**: a round 50 m off did as much as one on the point, and one 150 m off
still hit a quarter of the men. The rifle grenade was about **6× too deadly on
the point and 20× near it**.

## Tank gun (rules decision 41) — changed

- **Document:** 90% to 300 m, 70% to 500 m, 50% to 1,500 m, nothing beyond.
- **Sources:** modern fire control (stabilised gun, laser rangefinder,
  ballistic computer) is rated at 90–95% first-round hits on a stationary
  target to about 2,000 m. An unclassified Army report quotes 95% at 2,200 m
  for the M1A1 on the move (web, secondhand). Range-finding alone added 20–30%
  to first-round hit chance on 1960s guns ([Beresford
  1961](https://consensus.app/papers/details/2275f4b2b83b52239686fe89630dd74b/?utm_source=claude_desktop)).
  What drives first-shot hit probability now is the gun and fire-control error
  budget, not range ([Dursun et al.
  2018](https://consensus.app/papers/details/55bc653ea1cd56bdb0a9a1618ac07920/?utm_source=claude_desktop)).
  The document's curve is a pre-laser tank's.
- **Research figures:** **90% to 2,000 m, 50% to 3,000 m**. The 3,000 m band
  is ours.

## RPG against armour — kept

The document gives 50% to 200 m, 25% to 400 m and 10% to 700 m. Open sources
quote close to 100% at 50 m, about 50% at 200 m, 30% for a first round at
300 m in a US Army test, and 500 m maximum effective range against a stationary
target (GlobalSecurity, Military.com; secondhand). Close enough to keep.

## Wounds — kept

A hit rolls d10: 40% light (fights on), 40% serious, 20% killed (decisions
26–27). That makes the killed about **one in five of everyone hit** and **one
in three of those put out of the fight**.

- During the fighting of war, the wounded are at least twice the killed and
  as much as 13 times ([Coupland & Meddings
  1999](https://consensus.app/papers/details/ef034297cd5752f58cd5c2d0a5a34b8a/?utm_source=claude_desktop)).
  That is 7–33% killed; ours sits at the deadly end, a peer war with slow
  evacuation.
- The case fatality rate among US casualties was 20% early in the Iraq and
  Afghanistan wars and 9–10% late ([Howard et al.
  2019](https://consensus.app/papers/details/88e65826de79500ab247065b41cd768c/?utm_source=claude_desktop)).
  Survival rates were 86.5% in Vietnam and 90–92% in Iraq and Afghanistan
  ([Goldberg
  2018](https://consensus.app/papers/details/a6ffaf21a2d25283a77af073356597b5/?utm_source=claude_desktop)).
- A brigade in Iraq had 22.1% killed in action. The rate was 26.3% for
  explosion wounds and 4.6% for gunshot wounds, because body armour stops
  bullets better than blast ([Belmont et al.
  2010](https://consensus.app/papers/details/b007758adb4b53e993ac9adf66042f0e/?utm_source=claude_desktop)).
  Without armour, fragment wounds are the less fatal of the two
  ([Fragmentation weapons,
  2021](https://consensus.app/papers/details/d18fd4ae79435efd9d8151f6b61ef1fc/?utm_source=claude_desktop)).
  The game rolls one wound table for both (decision 27). Worth a look when
  body armour arrives.

## Explosives' share of casualties — calibrated to the sources (rules decision 43)

The author's principle is about 75%. The sources agree for Western forces in
Iraq and Afghanistan:

- 78% ([Owens et al.
  2008](https://consensus.app/papers/details/efda6628f747522bbd8d79aae5110da3/?utm_source=claude_desktop))
- 74.4% ([Belmont et al.
  2012](https://consensus.app/papers/details/5be2c188e3ca5740a3a023e726e666dc/?utm_source=claude_desktop))
- 72% across NATO forces ([Hoencamp et al.
  2014](https://consensus.app/papers/details/0f3aac490e0955ccae6e1aa1b1e3e7d2/?utm_source=claude_desktop))

It is not universal: gunshot wounds were 66% of casualties in Syria's civil war
([McIntyre
2020](https://consensus.app/papers/details/6d6bb3c4b00751b7bea0dc4d031b6494/?utm_source=claude_desktop)).
The share follows how much fire a war is fought with.

### Calibration

With the research blast (decision 41) and rates (decision 42), explosives
put out only 13–31% of the men in the company battles. Probes, 60 battles a
cell, morale on (temporary edits, not committed):

| What changed | 3:1 attack, out by HE | 2:1 attack, out by HE | 2:1 attacker wins |
|---|---|---|---|
| Harness fire plan, 4 adjusted missions of 12 | 29% | 11% | 62% |
| 4 missions of 24, or 8 of 36, adjusted | 30–31% | 13% | 62–65% |
| Small arms ÷2 to ÷7, same fire | 34–39% | 16–25% | 78–88% |
| 12 missions of 12, fire for effect at once | 56% | 46% | 77% |
| 12 missions of 24, fire for effect | 64% | 58% | 93% |
| 12 × 24 for effect, small arms ÷2 | 75% | 71% | 82% |
| **12 × 24 for effect, small arms ÷3** | **82%** | **77%** | **63%** |

- **More rounds alone did little**: an adjusted mission takes 4–8 turns, so
  only about two fit in a battle.
- **Weaker rifles alone did little**: most small-arms losses come from the
  assault inside 25 m, which keeps its table.
- **Fire for effect at once**, with rounds to spend, is what put explosives in
  charge. Weaker rifles then brought the 2:1 attack back inside its planning
  target (30–70%).

**The ruling (decision 43)**, on the research figures:

- Small arms hit a third as often (`SMALL_ARMS_COMBAT_FACTOR`). Men under fire
  hit 7–10 times less than in trials ([Rowland
  1987](https://consensus.app/papers/details/5fabd2f5d0d45bb58de007b49cad2b81/?utm_source=claude_desktop)).
  ⅓ is the smallest factor that reaches the target, and the table's figures
  are not trial figures either.
- A mortar mission fires 24 bombs for effect: 8 a tube, where FM 7-90 asks
  "seldom less than five rounds for each mortar".
- The fire it was calibrated on is `CALIBRATED_FIRE_PLAN`: twelve missions a
  side, fired for effect at once.

**Measured** (`npm run validate`, 100 battles a cell, morale on):

| Battle | Fire | Document: out by HE | Research: out by HE | Research: attacker wins |
|---|---|---|---|---|
| Company 3:1 attack | calibrated | 100% (over in 3 minutes) | **82%** | 98% |
| Company 2:1 attack | calibrated | 100% (over in 4 minutes) | **77%** | 63% |
| Company 3:1 attack | harness default, a bomb a turn | 31% | 21% | 100% |
| Company 2:1 attack | harness default | 23% | 19% | 30% |
| Platoon 3:1 attack | none (decision 37) | 0% | 5% | 100% |
| Platoon meeting | none | 3% | 10% | 48% |

**Where it falls short of 75%**, and why that is right:

- A battle given little fire, such as the harness's default of one bomb a
  turn, is a battle fought mostly with rifles. The company battle on Tel Azeka
  now gives each side twelve missions, the calibrated fire (it had 4 and 3).
- A platoon battle has no indirect fire at all (decision 37). Its explosives
  are its squads' grenadiers (decision 44, below).

## Rates of fire (rules decision 42) — changed

With a 60 s turn, a rate is rounds a turn. The published figures are for a
firing range, secondhand, from manufacturers' and encyclopaedic
specifications:

| Weapon | Published | Document | Low (likeliest) | High (outlier) |
|---|---|---|---|---|
| Mortar, a tube (81 mm M252) | 8–16 sustained; 20–30 for short periods | 3 | **3** | **30** |
| Artillery, a gun (155 mm M777) | 2 sustained; 4 for short periods | 2 | **2** | **4** |
| Tank gun, manual loader | 5–7; a qualified loader loads in 7 s | 1 | **1** | **7** |
| Rifle grenade (40 mm) | 5–7 aimed | 1 | **1** | **7** |
| RPG-7, gunner and assistant | 4–6 | 1 | **1** | **6** |

The author's ruling: **"no tank fires 5 rounds a minute."** The lowest figure
is the likeliest rate in a fight, and the highest is an outlier.

- **The distribution** (ours): a geometric tail above the low rate, cut at the
  high one. Each round above the low is 0.6 as likely as the one below for a
  fresh crew, and 0.15 for a tired one.
- **Fatigue** (ours): a crew goes from fresh to tired over 10 turns of firing.
- **What that gives:**

| Weapon | Fresh: low / average | Tired: low / average |
|---|---|---|
| Tank gun | 1 round 41% of turns / 2.3 | 85% / 1.2 |
| Mortar, a tube | 3 bombs 40% / 4.5 | 85% / 3.2 |
| Artillery, a gun | 2 shells 51% / 2.7 | 85% / 2.2 |

The peer-reviewed work shows guns can hold their upper rates, over the few
minutes a fight here lasts:

- Howitzer crews firing 60-round missions as fast as they could load kept
  their rate through the whole mission ([Paragallo et al.
  1979](https://consensus.app/papers/details/1589e347d79f5e7a8d4302c81cdbaa5a/?utm_source=claude_desktop)).
- A cooled 155 mm barrel fires 3 rounds a minute continuously ([Dubey et al.
  2022](https://consensus.app/papers/details/1bdace81cd9852dc9172eeaf8deeb637/?utm_source=claude_desktop)).
- Tank crews qualify by firing the first round within 5 s of a target
  appearing, and the second within 10 s ([Fingerman
  1978](https://consensus.app/papers/details/858b69d4f7a357bd9e9f3b3348f5408c/?utm_source=claude_desktop)).
- Those are gunnery trials. The ruling takes the low end for a fight, as
  Rowland does for rifles.

**How the engine applies them.**

- A direct-fire launcher fires its drawn rate in one action, each round
  rolled to hit. The crew stops when its target is down.
- A fire unit (3 tubes, 6 guns) lands tubes × its drawn rate each turn.
  Rounds for effect beyond that land on the turns after.
- Under `document`: one round, no ceiling, as before.

**Measured**, one minute of a fresh crew at a nine-man squad standing in the
open:

| Weapon | Range | Document: rounds, men out | Research: rounds, men out |
|---|---|---|---|
| Tank gun | 500 m | 1.0, 1.96 | 2.0, 2.87 |
| RPG against men | 150 m | 1.0, 0.86 | 2.2, 0.43 |
| Rifle grenade | 80 m | 1.0, 2.19 | 2.3, 0.82 |

Nothing counts ammunition yet (backlog 12).

## Small arms — a third of the table (rules decision 43)

**Measured**, one minute of a nine-man squad's fire at a nine-man squad, both
stationary:

| Range | Open, document | Open, research | Full cover, research |
|---|---|---|---|
| 50 m | 1.62 men out | 0.55 | 0.27 |
| 150 m | 1.09 | 0.36 | 0.17 |
| 350 m | 0.55 | 0.17 | 0.09 |

- Men in real combat hit **7 to 10 times less** than the same men in trials
  under simulated combat. That comes from over 100 small-unit battles, Boer War
  to Second World War ([Rowland
  1987](https://consensus.app/papers/details/5fabd2f5d0d45bb58de007b49cad2b81/?utm_source=claude_desktop);
  urban battle: [Rowland
  1991](https://consensus.app/papers/details/9f98a6e6b53e5e14a2827bb896754fea/?utm_source=claude_desktop)).
- Estimates run to 20,000–50,000 rounds issued for each casualty in modern
  war; most small-arms fire suppresses rather than kills ([Grau & Smith
  2002](https://consensus.app/papers/details/50a7cc91d1a4512c87f2c8a7e4f1a393/?utm_source=claude_desktop)).
- The factor of ⅓ was set by the calibration above, not read from a source.
  A squad in the open at 50 m now loses a man about every two minutes to
  another squad's rifles, where it lost one or two a minute.

## Where a side gives up — the historical breakpoints (rules decision 44)

- The Dupuy Institute puts the point where a unit stops attacking at about
  20–25% losses, and where it cannot defend at about 40%. US doctrine (ADRP
  1-02) calls a unit neutralised at 10% and destroyed at 30%.
- The peer-reviewed work warns against any fixed breakpoint. Casualties alone
  seldom explain a break ([Helmbold
  1971](https://consensus.app/papers/details/d012b748f8625ef0934fb87c4a14abf3/?utm_source=claude_desktop)),
  and the effect of losses on a unit is "variable and unpredictable"
  ([Wainstein
  1986](https://consensus.app/papers/details/7b0c5485018751218ff31729291623f0/?utm_source=claude_desktop)).
  So the game still breaks sides through morale, counting broken and fled men
  with the casualties, and not at a fixed casualty number.

**The ruling.** On the research figures, a side breaks when this share of its
men are down, broken or in a force that fled: **30% attacking, 60%
defending**, where decision 19 gave two thirds to both. Who attacks is
`GameOptions.attackers`, set in each scenario spec.

**The sweep** that chose them (60 battles a cell, morale on, research
figures). "Att" and "def" are the loser's median casualties at its break:

| Attacking / defending | Platoon meeting, att | Company 2:1, att / def | Calibrated 2:1, att / def | Calibrated 2:1, attacker wins |
|---|---|---|---|---|
| 2/3 / 2/3 (decision 19) | 50% | 39% (both) | 44% (both) | 70% |
| 0.40 / 0.55 | 31% | 20% / 40% | 25% / 40% | 82% |
| 0.35 / 0.50 | 31% | 19% / 35% | 26% / 38% | 97% |
| 0.30 / 0.55 | 25% | 18% / 35% | 21% / 40% | 78% |
| **0.30 / 0.60** | **25%** | **18% / 46%** | **21% / 43%** | **62%** |
| 0.30 / 0.65 | 25% | 18% / 46% | 20% / 44% | 47% |

**Measured** (`npm run validate`, 100 battles a cell, research figures):

| Battle | Fire | Attacker wins | Attacker lost at its break | Defender lost at its break | Out by explosives |
|---|---|---|---|---|---|
| Platoon meeting | — | 36% | 25% (19–36%) | — | 22% |
| Platoon 3:1 attack | — | 97% | — | 67% (44–100%) | 26% |
| Platoon 2:1 attack | — | 57% | 19% (14–25%) | 44% (39–72%) | 36% |
| Company 3:1 attack | a bomb a turn | 94% | — | 42% (31–56%) | 34% |
| Company 2:1 attack | a bomb a turn | 3% | 18% (14–22%) | — | 29% |
| Company 3:1 attack | calibrated | 95% | — | 50% (44–56%) | 83% |
| Company 2:1 attack | calibrated | 61% | 20% (15–26%) | 43% (39–49%) | 78% |

- **Attackers now give up at 16–25%** casualties, the rule of thumb.
- **Defenders give up at 42–50%**, a little above the rule of thumb's 40%.
  0.55 came closer to 40%, but the 2:1 attack with fire support then won 78%,
  outside its 30–70% planning target.
- **A one-squad defender** (the platoon 3:1 attack) can only lose whole men:
  6 of 9 is 67%.

**A rout counts by its casualties (rules decision 45).** A playtest found the
low tail: in the demo, one tank round routed a squad with 3 men out, the
routed squad counted whole (8 of 24, past 30%), and the attack ended at 12%
casualties. On the research figures a routed force now counts only its men
down or broken. Measured (`npm run validate`, 100 battles a cell):

| Battle | Attacker lost at its break, before | After | Attacker wins, before → after |
|---|---|---|---|
| Platoon 2:1 attack | 19% (14–25%) | 22% (17–28%) | 57% → 61% |
| Company 2:1 attack, a bomb a turn | 18% (14–22%) | 19% (16–23%) | 3% → 6% |
| Company 2:1 attack, calibrated | 20% (15–26%) | 21% (16–26%) | 61% → 56% |

Defenders' figures and the explosives' share did not move.

## The squad's grenadiers (with decision 44)

The drill now fires a squad's grenadiers alongside its rifles (`grenadiers`
in [`app/drill.ts`](../src/app/drill.ts), ⚠️ ours):

- One 40 mm launcher for every four men still fighting: two in a nine-man
  squad, one in a fire team, as a NATO squad carries them.
- Each fires its drawn rate of rifle grenades at the squad's target, once the
  target is inside the table's 100 m.

A player's squads fire them too, by the same function (decision 45): until
then only the drill's squads carried them.

They are a platoon battle's own explosives, **22–36%** of its losses where
riflemen alone gave 4–10%. Where a company's mortars are on call it is
**78–83%**. Most explosives come from the higher echelons, as they do in the
sources' wars.

## Hand grenades (rules decision 46)

An assault's grenades were a count for the force (two in the drill, 0–3 for
a player), each 30% to hit one man: 1–3% of the losses in the harness, where
close combat is a grenade's work.

- **Every man going in throws his**, up to the two he carries.
- **Each is a blast of the M67's lethal area**: its published 5 m killing
  radius (casualty radius 15 m), 79 m², the same criterion as the 40 mm's.
  One grenade puts out **0.39** men of a squad in the open; its lethal area
  predicts 0.36.
- The self-hit is **1.5%** a grenade (decision 47, ours), where the document
  gives 5%: at 5%, with four times the grenades, a squad's own grenades
  wounded it four times as often.

**Measured**, 60 harness battles a cell, research figures:

| Battle | Grenades that caught someone, before → after | Own men hit, before → after |
|---|---|---|
| Platoon 3:1 attack | 27 → 37 | 4 → 16 |
| Platoon 2:1 attack | 9 → 19 | 3 → 8 |
| Company 2:1 attack | 55 → 97 | 7 → 18 |

At 1.5% a grenade (decision 47) the own men hit fell to 5, 2 and 4 — about
where they were before — and the grenades catching someone stayed at 36, 24
and 100.

Out by explosives (100 battles a cell): platoon meeting 22% → 31%, platoon
3:1 attack 26% → 30%, platoon 2:1 attack 37% → 40%; the company battles moved
by a point, and the calibrated ones not at all (83%, 78%).

## Prepared positions, half-strength squads, and mortar ammunition (rules decision 48)

**Prepared positions start in full cover** — dug in, with overhead cover —
where they started in partial. It is set in the three Tel Azeka specs
(`baseCover: "full"`) and is the harness's default (`--prepared-cover
partial` for the old). Small arms meet the same cover either way: a
defender that stays put digs itself to full cover by its 7th turn (3 turns
before the tools come out, 2 a level), before an attacker 700 m off is in
range, so with no fire plan the battles came out identical, battle for
battle. What changes is the shelling: a force in full cover is under a
roof (`underRoof`), and the first turns.

**A squad the attrition rule neutralised counts by its casualties**, on the
research figures, as a routed one already did (decision 45): a squad down to
half strength is not a squad lost. A surrendered force still counts whole.

**Measured**, calibrated company battles (12 missions of 24 a side, 100
battles a cell, research figures), each change on its own:

| Battle | Partial cover, before | Partial + decision 48 | Full cover | Both | Out by explosives, partial → full |
|---|---|---|---|---|---|
| Company 3:1 attack, attacker wins | 95% | 95% | 88% | **87%** | 83% → 75% |
| Company 2:1 attack, attacker wins | 56% | 34% | 7% | **2%** | 78% → 69% |

`npm run validate` now gives (research): 3:1 wins 87%, defender breaks at
42% (36–50%), 75% by explosives; 2:1 wins 2%, attacker breaks at 22%
(18–29%), 69% by explosives. **The 2:1 attack on a dug-in company no longer
wins** — the doctrinal 3:1 does. The 30–70% planning target decision 44
traded for is lost; see *Open*.

**Mortar ammunition — does it need a limit?** Both sides given the same
allotment, fire for effect at once, 60 battles a cell, research figures:

| Battle | Cover | Missions × rounds a side | Attacker wins | Out by explosives |
|---|---|---|---|---|
| 2:1 | full | none (a bomb a turn) | 3% | — |
| 2:1 | full | 2 × 24 … 12 × 24 | 0–3% | 56–69% |
| 2:1 | partial | 2 × 24 … 12 × 24 | 2–35% | 66–78% |
| 3:1 | full | none (a bomb a turn) | 92% | — |
| 3:1 | full | 2 × 24 | 48% | 65–75% |
| 3:1 | full | 4 × 12 | 65% | |
| 3:1 | full | 4 × 24 | 90% | |
| 3:1 | full | 8 × 12 | 73% | |
| 3:1 | full | 8 × 24 | 88% | |
| 3:1 | full | 12 × 12, 12 × 24 | as 8 × 12, 8 × 24 | |
| 3:1 | partial | 2 × 24 … 12 × 24 | 85–98% | 73–83% |

- **More than about 8 missions a side is never fired**: 8 and 12 give the
  same battles. One mission in hand a weapon, the adjustment and the
  delivery hold a section to about 8 in the battle's 10–15 minutes. The
  count is already a limit only below that.
- **Rounds a mission move it more than missions**: 4 × 24 beats 8 × 12.
- **Starving both sides helps the defender**: at 2 × 24 the 3:1 attack
  wins 48%, where a bomb a turn gives it 92% — the attacker's fire plan is
  what gets it across.

The engine does not count bombs (backlog 12), so the missions × rounds
allotment is the limit. **12 × 24 a side is past what a section fires in a
company battle; 8 × 24 plays the same.** A per-tube bomb count would matter
only for longer battles or several battles in a row (a campaign).

## The defender's breakpoint at 50% (rules decision 49)

With prepared positions dug in (decision 48) the calibrated 2:1 company
attack won 2%, so the defender's breakpoint was swept down from 60% toward
the rule of thumb's 40% (100 battles a cell, research figures, the
attacker's held at 30%). "Def lost" is the defender's median casualties at
its break:

| Defender breaks at | Calibrated 3:1: wins / def lost / explosives | Calibrated 2:1: wins / def lost | 2:1, a bomb a turn: wins / def lost | Platoon 2:1: wins / def lost |
|---|---|---|---|---|
| 60% (decision 44) | 87% / 42% / 75% | 2% / 35% | 3% / 54% | 63% / 67% |
| 55% | 91% / 42% / 74% | 3% / 35% | 5% / 51% | 65% / 61% |
| **50%** | **95% / 39% / 75%** | **8% / 33%** | **8% / 49%** | **68% / 56%** |
| 45% | 97% / 31% / 87% | 11% / 32% | 12% / 43% | 68% / 56% |
| 40% | 99% / 31% / 91% | 22% / 29% | 17% / 36% | 70% / 50% |
| 35% | 100% / 28% / 95% | 38% / 26% | 27% / 32% | 71% / 44% |

- **No setting meets both targets.** The 2:1 attack gets back into 30–70%
  only at 35–40%, where defenders quit at 26–29% casualties and the 3:1
  attack is a walkover at 91–95% explosives.
- **The author took 50%** (2026-09-28): defenders break at 33–49%
  casualties, centred on 40%; the calibrated 3:1 attack wins 95% at 75%
  explosives. A 2:1 attack on a dug-in position fails (8%), as doctrine's
  demand for 3:1 says it should; the 30–70% target decision 44 kept for it
  is dropped.
- Attackers still give up at 19–25%.

## Attacks on a hasty defence (no prepared position)

`--prepared-cover none` (harness option): the defender starts in the open
and digs in as any force that stays put does. 100 battles a cell, research
figures, defender breaks at 50% (decision 49):

| Battle | Fire | Defender's position | Attacker wins | Attacker lost at break | Defender lost at break | Out by explosives | Minutes |
|---|---|---|---|---|---|---|---|
| Platoon 2:1 | a platoon's own | none / partial / full | 68% (all three) | 25% | 56% | 40% | 14 |
| Company 2:1 | a bomb a turn | none / partial / full | 8% (all three) | 20% | 49% | 32% | 15 |
| Company 2:1 | calibrated | **none** | **95%** | 24% | 38% | **92%** | 6 |
| Company 2:1 | calibrated | partial | 81% | 25% | 40% | 81% | 11 |
| Company 2:1 | calibrated | full | 8% | 22% | 33% | 69% | 12 |
| Company 3:1 | a bomb a turn | none / partial / full | 98% (all three) | — | 44% | 36% | 13 |
| Company 3:1 | calibrated | none | 100% | — | 42% | 96% | 4 |
| Company 3:1 | calibrated | full | 95% | — | 39% | 75% | 10 |

- **Without a fire plan, preparing makes no difference at all**, battle for
  battle: a defender in the open digs to full cover by its 7th minute
  (`DIG_IN`: 3 turns, then 2 a level), before an attacker 700 m off reaches
  it. Digging was on a pre-decision-40 clock — fixed by decision 50, below.
- **With a fire plan, a hasty defender is caught in the open.** The 2:1
  attack wins 95% in 6 minutes, 92% by explosives — past the 75% target,
  and far above what the planning ratios suggest (about 2.5:1 for a hasty
  defence, so 2:1 should be a close fight).
- Dug-in cover (`cover`) never puts a force under a roof against shells;
  only a prepared `baseCover: "full"` does. So the swing from 95% to 8% is
  overhead cover plus the first minutes in the open.

## Digging in takes minutes (rules decision 50)

The dig-in clock was the document's — the tools out after 3 turns, a level
every 2 — set before a turn was 60 s. **On the research figures**:

| Level | After this much work | Source |
|---|---|---|
| Partial — a hasty prone shelter, about ½ m deep, spoil thrown up in front | 30 minutes | Depth: FM 21-75 ("about one-half meter"), FM 5-103 ("at least 1½ feet"). Time: **ours**, a third of the foxhole's for about half its earth |
| Full — an individual foxhole, frontal cover | 90 minutes | US Army, FM 5-15 *Field Fortifications* (1944): "90 minutes for a soldier to excavate and camouflage an individual rifleman's foxhole" ([Pacific War Online Encyclopedia](http://pwencycl.kgbudge.com/F/o/Fortifications.htm)) |
| Overhead cover | never, in a battle | FM 5-103: "at least ten times more protected from indirect fire" under it; a two-soldier deliberate position is 6–8 hours and overhead cover 2–4 more (secondary; FM 5-103's own time table is an image and could not be read) |

The tools still come out after 3 turns in place (ours). FM 5-103 also
puts the worth of frontal cover at about half the small-arms casualties,
which is what full cover's −50% already is.

**Measured** (100 battles a cell, research figures, defender breaks at
50%). "Hasty" is `--prepared-cover none`; the prepared rows did not move:

| Battle | Fire | Hasty, before → after | Partial, before → after | Prepared (full) |
|---|---|---|---|---|
| Platoon 2:1 | platoon's own | 68% → **90%** | 68% → 77% | 68% |
| Company 2:1 | a bomb a turn | 8% → **59%** | 8% → 27% | 8% |
| Company 2:1 | calibrated | 95% → **100%** (93% explosives) | 81% → 89% | 8% |
| Company 3:1 | a bomb a turn | 98% → 100% | 98% → 100% | 98% |
| Company 3:1 | calibrated | 100% | 100% | 95% |

- **Preparing a position now matters**, with or without a fire plan: a 2:1
  company attack without mortars wins 59% against a hasty defence and 8%
  against a prepared one. The planning ratios give about 2.5:1 for a hasty
  defence and 3:1 for a prepared one, so a 2:1 attack on a hasty defence
  should be a close fight, and it is.
- **A hasty defender under a mortar section is lost** (100%, 93% by
  explosives): it has no cover at all for its first half hour.
- `npm run validate` did not move: its defenders are prepared.
- Scenario forces without a prepared position — RED platoon B in the
  company battle, RED-1 and RED-3 at Tel Azeka, RED at Yokneam — no longer
  dig in by minute 7; they hold what the ground gives them.

## The design principles, measured

The author's principles (README, *Design principles*, 2026-09-28): a
prepared position gives the defender its superiority and makes an attack
need 3:1; in a meeting engagement nobody has a defender's bonus, so numbers
should win; fortifying during battle belongs to the higher echelons.

**Meeting engagements at odds** (`meetingOdds`, harness, 100 battles a
cell, research figures, nobody prepared, both sides advancing). Win shares
are BLUE (the larger) / RED / draw:

| Echelon | Odds | Men | Larger wins | Smaller wins | Draw | Out by explosives |
|---|---|---|---|---|---|---|
| Squad | even | 9 v 9 | 50% | 41% | 9% | 53% |
| Squad | ~2:1 | 9 v 5 | 72% | 28% | 0% | 43% |
| Squad | ~2.3:1 | 9 v 4 | 80% | 15% | 5% | 37% |
| Platoon | even | 36 v 36 | 35% | 37% | 28% | 30% |
| Platoon | 2:1 | 36 v 18 | 88% | 9% | 3% | 36% |
| Platoon | 4:1 | 36 v 9 | 100% | 0% | 0% | 24% |
| Company | even | 113 v 113 | 43% | 39% | 18% | 36% |
| Company | ~1.6:1 | 113 v 72 | 74% | 12% | 14% | 38% |
| Company | ~3:1 | 113 v 36 | 100% | 0% | 0% | 21% |

With nobody prepared, the larger force wins, and more surely the larger
the odds — the principle holds. Against a prepared defender the same
harness gives the 2:1 attack 8% and the 3:1 attack 95%.

**The smart attacker in the browser** (`tools/smart-attacker.mjs`: a scripted player bounding by
halves, command groups following, a mortar fire plan on the objective area —
not on where each squad lies — lifted at 150 m, then mortar smoke on the
objective from 400 m; the defender played by the drill). Seeds 11–18 on
`?seed=`, 60 s turns, research figures:

| Scenario | Attacker wins | Draws | Defender wins | Over by |
|---|---|---|---|---|
| `telAzekaAssault` — a company on a prepared platoon, 86 v 32 | **7** | 1 | 0 | turn 8–10 |
| `telAzekaAssault2` — two platoons on a prepared platoon, 59 v 32 | **3** | 2 | 3 | turn 8–9 |

- **3:1 wins and 2:1 is a coin toss for a skilled attacker**, where the plain
  drill wins 95% and 8%. A good plan — smoke, a fire plan, bounding — can
  sometimes carry an attack below 3:1, which is as it should be; 3:1 is
  what makes it reliable.
- **The mortars decide it before the infantry closes.** Infantry walks 50 m
  a turn, half that under fire, less uphill: 14–25 m a minute up the tel, so
  the battle is over in 8–10 minutes with the attackers still 150–300 m out.
  75–100% of the casualties are by explosives.
- **So the odds act mostly through what a side can lose**, not through its
  fire: both sides have the same mortar section, and on seeds 11–13 the two
  scenarios ended with the same casualties on both sides — the third
  platoon never came into range — but at 86 men BLUE could lose them and
  still go on. An attacker at 3:1 usually brings more fire support as well;
  these scenarios give both sides the same.
- **Earlier browser results were off.** Before 2026-09-28's fix the script
  read every position 36 m off (the symbol image is not centred on the
  unit), locked distant squads out of the order cycle, and never laid smoke
  (a wrong button label): its attack crept forward at 14 m a bound. The
  earlier "3:1 wins by turn 3–4" and the first run of these seeds (1 of 8,
  2 of 4) were with that script.
- **That fire plan was built on the truth.** Until 2026-09-28 the script
  centred its fire plan on the defence's true centre. Rules decisions 51–52,
  the same seeds 11–18, and location error on in every run:

| Scenario | Plan on the truth | Plan on an estimate (0.2 of range) | Estimate, with a scout first (`RECON=1`) |
|---|---|---|---|
| `telAzekaAssault` (3:1) | 8 wins | **2 wins**, 6 losses | 1 win, 1 draw, 6 losses |
| `telAzekaAssault2` (2:1) | 6 wins, 2 draws | **2 wins**, 6 losses | 1 win, 7 losses |

  The estimates were off by 6–162 m (the same draw for both scenarios on a
  seed). The attacks won on the estimate were the seeds where it was off by
  6, 19 and 49 m.
- **Reconnaissance did not pay in the browser** (decision 52). The scout,
  the squad nearest the defence (BLUE-2-1), found it on turn 7 or 8 in
  every run, and lost 6–8 of its 8 men doing it. The mortars then fired on
  its reports, 9–10 calls as before. The defence lost no more than it did to
  fire on the estimate (5–11 men down), and the scout's losses counted
  toward the attacker's 30% breakpoint, which it reached a squad sooner. In
  the harness the same drill takes the 3:1 attack from 20% to 59%
  (balance.md, *Fifteenth round*). What differs is not yet known. The
  likeliest cause is that on the tel the defender's positions are dug in
  with overhead cover (decision 48), so a report 60 m off is still not
  close enough for a mortar to hurt them, while the harness's flat ground
  rewards it more. Worth a trace before any ruling.
- **Binoculars and a look did not pay in the browser either** (decisions
  53–54, seeds 11–18, the scout halting a turn each bound, `RECON=1
  WATCH=1`). With a 4-turn look and the guns waiting for a mark within 40 m
  (`LOOK=4 AIM=40`) the attacker won 0 of 16 (one draw). Without the look it
  won 1 of 16. The company waited 20–30 turns at its start line, in the open
  below the defender's observation posts on the tel. Decisions 53–54 let
  those posts see a still company and keep their eyes on it, and the
  defender's mortars took 20 of its men while its own guns fired 3–5
  missions. In the harness the ground is flat and the defender has no posts.
  So the company must wait out of sight, which is the company commander's
  call (Jev's, in the game) and needs a dead-ground finder.

## Where the enemy is (rules decision 51)

**What the sources say.** US fire support grades how well a target's
position is known as **target location error** (TLE). The categories run
CAT I (0–6 m), CAT II (7–15 m), CAT III (16–30 m), CAT IV (31–91 m) and
CAT V (92–305 m) to CAT VI (worse). A ground observer who fixes a target
by laser rangefinder, GPS and magnetic compass is limited by the compass,
typically 10–17 mils. That is 50–85 m at 5 km, CAT IV–V. Without the
rangefinder, the range is judged by eye. The Armored Medical Research
Laboratory at Fort Knox found in 1945 that troops' range estimates err by
**about 20% or more**, and that this is why tank gunners had to bracket
with several rounds before hitting.

**What the game does** (`data/locationError.ts`, with
`GameOptions.locationError`):

| Who sees | Along the sight line (1 SD) | Across it (1 SD) | At 400 m | At 1,000 m |
|---|---|---|---|---|
| A force, by eye | 20% of range | 10 mils | 80 m × 5 m | 200 m × 10 m |
| An observation post (range card) | 10% of range (**ours**) | 10 mils | 40 m × 5 m | 100 m × 10 m |
| A UAV | 15 m (**ours**) | 15 m | 15 m | 15 m |

- The 20% is read as a standard deviation. The 1945 figure is a typical
  error, so this is if anything generous to the observer.
- Never under 5 m (**ours**): the observer's own place on the map.
- A force that holds still and is seen again is placed better. The
  estimates are combined, each weighted by the inverse of its variance
  (**ours**). This is optimistic, because one observer's errors are
  correlated from minute to minute. It is the lever if contacts turn out
  too sharp after a few turns.
- These fall in CAT IV–V at the ranges an infantry battle is fought, which
  is where the doctrine puts an observer with map and compass.

**What it moved** (balance.md, *Fourteenth round*): a calibrated company
attack at 3:1 on a prepared platoon falls from 95% to 20% when the
attacker's fire plan is made on an eye's estimate rather than on the
truth. Location error in the fight itself moves it 2 points. The fire plan
was the whole of it.

## Infantry pace under fire (2026-09-30) — the climb cost changed (rules decision 61)

The question: on the tel no attack closes (balance.md, *Twenty-second
round*). Is the infantry too slow? The game's figures are the document's —
**50 m a turn walking, 100 running, half under fire or suppressed** — plus
**8 m of a move for every metre climbed** (decision 15, Naismith) and, in the
drill, bounding overwatch: in contact half the squads hold each turn.

**What the sources say** (1 turn = 60 s, so m/min = m a turn). Two research
passes, 2026-09-30; papers read as abstracts, the US field manuals only
through search results and a blog quoting them (the sites were blocked):

| Figure | m/min | Source |
|---|---|---|
| Cross-country march rate, day / night; road, night | 40 / 27; 53 | FM 21-18, through search results and [MTI](https://mtntactical.com/research/yet-calculating-movement-uneven-terrain/) |
| Hiking off path (Tobler's function × 0.6) | 50 | [Tobler's hiking function](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function) |
| Self-paced loaded march, 22 kg | 66 | Arya 2022 (abstract) |
| Fastest loaded walk, 22–66% of body mass | 112–89 | Looney 2021 (abstract) |
| 30 m sprint in a 21.6 kg fighting load | 220 (8.2 s) | Billing 2011 (abstract) |
| A rush: 3–5 s, kept short so a gunner cannot track it | — | [FM 21-75, ch. 3](https://www.globalsecurity.org/military/library/policy/army/fm/21-75/Ch3.htm) |
| Fire and movement drill: 6 m bounds, one every 20 s | **18 net** | Billing 2015; McGuire 2025 (abstracts) |
| Mock section assaults over 100–150 m: 7 m bounds every 22 s, 6.5 min on average | **15–23 net** | Silk 2013, *Mil Med* (abstract) |
| Low (leopard) crawl, 18 m with 24 kg | 41–45 | McGuire 2025; Myers 2016 (abstracts) |
| Creeping barrages infantry kept up with: Vimy 1917, Passchendaele 1917, Hitler Line 1944, Veritable 1945 | **30, 23, 18–30, 23** | [Barrage (artillery)](https://en.wikipedia.org/wiki/Barrage_(artillery)), citing Griffith, Steel & Hart, Hogg |
| A barrage infantry could *not* keep up with: the Somme, XV Corps, 1 July 1916 | 46 planned | same |
| Urban advance, unopposed; opposition slowed it about sevenfold | 13; about 2 | Rowland, *The Stress of Battle*, through [a review](https://www.themself.org/2013/12/stress-of-battle-part-2-op-research-on-urban-battles/) |
| Metres of flat a metre of climb is worth: Naismith and fell racing; Tobler at 9–27% grades; running on a treadmill or road | 8; 4–6; 3–4.4 | Scarf 2007; Norman 2004 (abstracts); Tobler (arithmetic) |

**Read together:**

- **Under fire a squad does not walk at half speed; it rushes and drops.**
  A rush is very fast (5–7 m/s) and short (6–30 m), followed by 15–20 s on
  the ground. Three independent drill studies and the barrages infantry kept
  pace with agree on about **15–30 m a minute net**, 20 the middle. Where the
  defender was not suppressed it fell to almost nothing.
- **Walking at 50 m a minute is right** for a cross-country move (40–53).
  **Running at 100 m a minute** is a fast loaded walk as a sustained minute —
  defensible as a minute that includes going to ground and getting up, low as
  a top speed. No measured 60-second loaded run was found.
- **8 m a metre climbed is probably heavy for a tactical move.** It is the
  figure for a long hill walk; for the 10–25% grades of the tel Tobler gives
  4–6, and one study found the slope penalty grows with fatigue over minutes,
  which a one-minute bound has not got. No source gives a figure for loaded
  soldiers. Downhill (gentle) is slightly faster than flat in Tobler; the
  game gives it nothing, which is close.

**What the game does, measured on the tel** (20 battles of the 3:1, the
twenty-second round's company, from the minute the main body is let go):
a squad moves in 39% of its turns (42% held by the drill's overwatch, 16%
scouts lying up, 2% blocked) and covers 52 m when it does — a 100 m bound
at a run, of which the climb takes about 42 m (5.3 m climbed a bound). It
is suppressed in only 5% of its turns, so the halving barely applies. **Net,
about 20 m a minute** — in the middle of the sources' range. The ridge rises
only 24 m over the last 440 m on the centre line (28 m of climb summed), 51
m on the eastern approach.

**So pace is not why the attack does not close.** The main body is let go at
a median turn 20, about 350 m from the nearest defender, and the battle ends
at a median turn 26–29, about 260 m out: fire decides it in 6–9 minutes,
where 350 m at a realistic 20 m a minute takes 15–20. Nothing here says the
infantry should be faster; it says the fire breaks a side sooner than the
last few hundred metres can be crossed. That is the next question —
how long a dug-in platoon holds under a mortar section, against the sources
(handoff, *mortar lethality against men dug in*).

Two changes the sources would support. **The author took the first**
(2026-09-30, decision 61): the climb cost is **5 m a metre** for a bound
instead of 8. The second is not made: on flat ground the drill's pace in
contact (half the squads bounding 100 m) nets about 50 m a minute, more
than twice the sources' 20, if no one is suppressed.

## Mortars against men dug in (2026-09-30) — the factors changed (rules decision 62)

The question, from the pace research: on the tel fire decides the battle
6–9 minutes after the company goes. Is the mortar too lethal against men
dug in? The game's figures (`SHELL_VS_MEN`, decisions 29–31, 48): an 81 mm
bomb reaches 476 m² of standing men; in a hole dug in the battle that is ×
0.125 (impact) or × 0.625 (air burst); under overhead cover — a position
prepared before the battle — × 0.125 either way.

**What the sources say** (a research pass, 2026-09-30; FM 7-90, FM 6-30
and FM 100-61 read in full, FM 5-103 not reached, the rest secondary):

| Figure | Value | Source |
|---|---|---|
| Men in open holes, proximity fuze | "only 10 percent as effective" as in the open; proximity about 5× impact | FM 7-90, App. B-5c ([GlobalSecurity](https://www.globalsecurity.org/military/library/policy/army/fm/7-90/Appb.htm)) |
| Under overhead cover | proximity: "few, if any" casualties; impact: "some blast and suppressive effect"; light and medium mortars "little effect" | FM 7-90, B-3d, B-5d |
| Warned platoon | 2 rounds unwarned took 10–15 once it had gone to ground | FM 7-90, B-5a |
| 81 mm suppression | likely within 30 m, 50% at 75 m, little beyond 125 m; strongest when fire first falls | FM 7-90, B-7 |
| Relative risk (WWII British), to a standing man | lying ⅓; firing from an open trench 1/15–1/50; crouched in it 1/25–1/100 | Evans, through [balagan.info](https://balagan.info/artillery-and-mortar-tactics-of-ww2) |
| Neutralization; destruction | 10% casualties; 30% "during a short time span" — destroying dug-in targets by fire "is not economical"; suppression "usually lasts only as long as the fires are continued" | FM 6-30, App. E ([GlobalSecurity](https://www.globalsecurity.org/military/library/policy/army/fm/6-30/f630_14.htm)) |
| Rounds to neutralize (30% of targets, unobserved) a hectare | troops in the open: 35 of 82 mm; a hasty dug-in position: 300 of 82 mm; a prepared strongpoint: no 82 mm norm (120 mm: 200) | FM 100-61, ch. 9 ([GlobalSecurity](https://www.globalsecurity.org/military/library/policy/army/fm/100-61/Ch9.htm)), the US Army's OPFOR norms |
| Operation Veritable, 1945 | casualties under 5% on both sides, about 20 prisoners a German casualty; success came from assaulting as the fire lifted | Swann (No. 2 ORS), reanalysed by Rooney ([Wavell Room](https://wavellroom.com/2020/08/18/the-psychology-of-artillery-effectiveness-fire-support/)) |
| Suppression after the fire stops | "some brief, indeterminate period" | Dupuy ([TDI](https://dupuyinstitute.org/2018/10/11/human-factors-in-warfare-suppression/)) |

**What the game does, measured** (60 battles of the tel's 3:1, the
twenty-third round's company, squads first). In the 47 the defender lost,
every one ended at its breakpoint: 32% of its men down, 82% of them by the
mortars, and another 25% broken but unhurt. The attacker fired about 10 HE
missions a battle — some 245 bombs for about 8.5 men of a dug-in platoon, a
man for every 29 bombs. On the OPFOR norm a *hasty* dug-in platoon position
of 2–6 ha takes 600–1,800 bombs for 30%; for positions under overhead cover
the sources give no norm and "few, if any" casualties.

**Read together:** against men dug in, the game's mortar is several times
too lethal — about 5× in an open hole under an air burst (0.49 of standing
against the sources' 0.10), 2–6× on impact (0.125 against 0.02, or
1/15–1/100), and most of all under overhead cover, which the game makes no
safer than an open hole. The sources' factors would be about: impact, open
hole **0.03**, overhead cover **0.02**; air burst, open hole **0.13**,
overhead cover **0.005**. Posture in the open (standing 1, lying 0.36)
agrees with Evans's ⅓. **Adopted** (author, 2026-09-30, decision 62); in
the game (200 battles, balance.md *Twenty-fourth round*) the 3:1 wins
44–47% and the 2:1 17–19%.

**A trial with the sources' factors** (scratch, not in the game; 100
battles, the same company):

| | 3:1 wins | 2:1 wins | defender down (3:1) | explosives' share |
|---|---|---|---|---|
| The game's factors | 76% | 59% | 30% | 79–81% |
| The sources' factors | **47%** | **18%** | 19% | 73% |

The prepared position gets its superiority back — 2:1 fails, 3:1 is an even
fight — which is the author's design principle. But the battle still ends
at about turn 25 with no attack closed: now it is the **attacker** that
reaches its breakpoint, in the open under the defender's mortars. What the
sources say decides such a fight is missing from the game: fire on men dug
in mostly **suppresses**, the suppression lasts about as long as the fire,
and the assault succeeds by arriving while it does (Veritable). Fire that
only kills cannot give that.

## What an attack at 3:1 should win (2026-09-30)

The design principle (README) has a prepared position make an attack need
3:1, with 85% as the author's upper bound for a 3:1 attack on a prepared
platoon (decision 54, resting on the Dupuy Institute's 83% at 2.5–2.99:1).
A research pass read the evidence more widely:

| Ratio, condition | Attacker success | Source |
|---|---|---|
| 2.0–2.49:1, division level 1904–91, postures mixed | 71% (80% without probing attacks) | TDI 752-case database ([TDI](https://dupuyinstitute.org/2019/10/31/tests-using-the-752-case-division-level-data-base/)) |
| 2.5–2.99:1, same | 83% | same |
| 3.0–3.49:1, same | 69–70% | same |
| 3.5–3.98:1, same | 76–77% | same |
| 3:1 or more, battles 1600–1973 | 74% | Helmbold & Khan 1986, through [TDI](https://dupuyinstitute.org/2016/07/11/trevor-dupuy-and-the-3-1-rule/) |
| Small-unit WWII attacks without surprise, 1:1 / 3:1 | 40% / 54% | Rowland, *The Stress of Battle*, through [a review](https://www.themself.org/2013/12/stress-of-battle-5-ww2-heroism-surprise/) |
| The same with surprise, 1:1 / 3:1 | 70% / 76% | same |
| Prepared positions | defender ×1.65 | Rowland, through [a review](https://www.themself.org/2013/12/book-review-the-stress-of-battle-by-david-rowlands-part-1/) |
| Doctrine's origin: a defender has "approximately a 50-50 probability" against three times his strength | — | CGSC ST 100-9 (1991), through [TDI](https://dupuyinstitute.org/2019/11/14/the-source-of-the-u-s-army-three-to-one-rule/) |

**Read together:** none of the sources splits win rates by the defender's
preparation, and the aggregate tables mix postures (high ratios are massed
against the strongest positions, which is why 3–6:1 sometimes wins less
than 2.5–3:1). Small-unit attacks without surprise do markedly worse than
the division-level tables. With a prepared defender worth about 1.65 times
its numbers, 3:1 is about 1.8:1 in effect. **A defensible target: 3:1
against a prepared platoon about 55–70%, with 75–85% for an attack with
surprise or strong suppression; 2:1 about 30–45%** — "usually fails" holds.
85% fits as a ceiling, not as the typical result. Mearsheimer's 1989 paper,
Helmbold 1969 and the Kress & Talmor model were read as abstracts only.

## The breakpoints and explosives' share, on the game's rules (2026-09-30)

`npm run validate` now plays the harness on the game's rules (balance.md,
*Thirty-third round*: decisions 51–55 on, an eye's planning error, a scout
from each attacking platoon), on today's engine (decisions 61–66, the
command post that stays put). Its single-weapon measurements — a round's
casualties, a launcher's minute, rifle fire — do not play battles and did
not move. Where a side gives up, research figures, 100 battles a cell,
the classic harness → the game's rules:

| Battle | Fire | Attacker wins | Attacker lost, at its break | Defender lost, at its break | Out by explosives | Minutes, median |
|---|---|---|---|---|---|---|
| Platoon meeting | — | 48% → 40% | 42% → 39% | — | 34% → 33% | 8 → 8 |
| Platoon 3:1 attack | — | 99% → 95% | — → 25% | 67% → 67% | 27% → 16% | 13 → 34 |
| Platoon 2:1 attack | — | 87% → 46% | 31% → 28% | 56% → 50% | 41% → 21% | 14 → 34 |
| Company 3:1 attack | a bomb a turn | 97% → 61% | — → 16% | 42% → 31% | 33% → 33% | 14 → 29 |
| Company 2:1 attack | a bomb a turn | 1% → 0% | 20% → 20% | — | 28% → 20% | 15 → 29 |
| Company 3:1 attack | calibrated | 7% → **68%** | 23% → 23% | 33% → 28% | 73% → **51%** | 13 → 27 |
| Company 2:1 attack | calibrated | 0% → 9% | 25% → 26% | — → 25% | 56% → 50% | 12 → 28 |

(The document's lethality, recorded by the tool alongside, moves the same way.)

- **Attackers give up at 16–28% casualties**, around the rule of thumb's
  20–25% (decision 44) even with the breakpoint at 40% (decision 66):
  broken and fled men count toward it too.
- **Defenders give up at 25–31% casualties at company**, under the rule of
  thumb's 40%: since decisions 63–64 more of a dug-in defender's men break
  before they fall. A one-squad defender still loses whole men (67%).
- **Battles take twice as long** (27–34 minutes against 13–15): the attack
  finds the defence before it goes.
- **Explosives' share with calibrated fire is 51% on flat ground, not the
  75% the author set** (decision 43, which was calibrated on the classic
  harness). On the tel it is 73–77% (balance.md, *Thirty-first round*). On
  open ground the scouted attack closes to rifle range, and small arms do
  more of the work. **The author ruled (2026-09-30): 75% is for real
  ground, and the tel meets it.** The flat harness's 51% is not a miss.

## Open

For the author, in rough order of what they move:

1. **What gives an attacker the defender's location** (decision 51). On an
   eye's estimate the 3:1 attack no longer wins; reconnaissance is what
   would. Nothing in the game or the harness does it for the attacker yet.

2. **Which scenario forces should start prepared.** Since decision 50 a
   force that has not prepared its position stays in the open for 30
   minutes; RED platoon B (company battle), RED-1 and RED-3 (Tel Azeka) and
   RED at Yokneam have none.
3. **The fire a battle is given.** 75% holds with a mortar section on call all
   battle (69–75% with full cover). Missions past about 8 a side go unfired
   (decision 48's sweep).
4. **Ammunition** (backlog 12): nothing runs out by the bomb, whatever the
   rate — a grenadier fires his rate every turn. The mission allotment is
   the only limit.
5. **The figures that are ours**: one launcher per four men; the tail weights and the 10 turns of
   fatigue; the ⅓ on small arms; the mortar's and tank HE's lethal areas, the
   RPG's against men, and the 25 m footprint.
6. **Infantry pace** (2026-09-30): the sources put an advance under fire at
   15–30 m a minute and the tel's attack already nets about 20. The climb
   cost went from 8 m a metre to 5 (decision 61); the drill's flat-ground
   pace in contact (about 50 m a minute unsuppressed) is left as it is. See
   *Infantry pace under fire*.
7. **Mortars against men dug in** (2026-09-30): the full-cover factors are
   the sources' since decision 62. What the sources say decides the fight —
   suppression the assault arrives under — is not in the game yet: see
   docs/suppression-design.md.
8. **Not researched yet**: the charges (a 100–200 m reach at 50%
   activation), and the armour damage table (a flat 20%
   penetration whatever the weapon and facing). The direct-fire HE review
   (agenda item 4) covers the last.

## Sources read through the web

These were not peer-reviewed and were read through search results.

- [David Rowland — The Dupuy Institute](https://dupuyinstitute.org/tag/david-rowland/)
- [Breakpoints in U.S. Army doctrine — The Dupuy Institute](https://dupuyinstitute.org/2018/04/18/breakpoints-in-u-s-army-doctrine/)
- [The 40% rule — The Dupuy Institute](https://dupuyinstitute.org/2024/03/26/the-40-rule/)
- [M67 fragmentation hand grenade — FAS](https://man.fas.org/dod-101/sys/land/m67.htm)
- [M433 40 mm cartridge — FAS](https://man.fas.org/dod-101/sys/land/m433.htm)
- [81 mm mortar](https://en.wikipedia.org/wiki/81_mm_mortar)
- [RPG-7 — GlobalSecurity](https://www.globalsecurity.org/military/world/russia/rpg-7.htm)
- [How an RPG works — Military.com](https://www.military.com/daily-news/2019/06/07/how-rpg-works.html)
- [The accuracy of tank main armaments — BRL](https://apps.dtic.mil/sti/tr/pdf/ADA182415.pdf)
- [M252 mortar](https://en.wikipedia.org/wiki/M252_mortar), [M224 mortar](https://en.wikipedia.org/wiki/M224_mortar)
- [M777 howitzer](https://en.wikipedia.org/wiki/M777_howitzer), [M109A6 Paladin — FAS](https://man.fas.org/dod-101/sys/land/m109a6.htm)
- [M320 grenade launcher module](https://en.wikipedia.org/wiki/M320_Grenade_Launcher_Module), [M203 grenade launcher](https://en.wikipedia.org/wiki/M203_grenade_launcher)
- [RPG-7 — Defense Update](https://defense-update.com/20060726_rpg-7rpg-7vrpg-7vr-rocket-propelled-grenade-launcher-multi-purpose-weapon.html)
- [Autoloader](https://en.wikipedia.org/wiki/Autoloader) (loader and autoloader rates)
- [Principles of fire support — USMC TBS](https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/B2C2437%20Principles%20of%20Fire%20Support.pdf)
  (effective casualty radii, through search results)
- Target location error categories, and a magnetic compass's 10–17 mils —
  read through search results summarising ATP 3-09.30 (*Observed Fires*),
  FM 6-30 and [An Analysis of Target Location Error](https://trace.tennessee.edu/cgi/viewcontent.cgi?httpsredir=1&article=6123&context=utk_gradthes)
  (University of Tennessee thesis); the source sites were blocked.
- [Study of errors in range estimation with the unaided eye](https://collections.nlm.nih.gov/catalog/nlm:nlmuid-101677642-bk)
  (Armored Medical Research Laboratory, Fort Knox, 1945), and its "20% or
  more" as cited in *Tactical Display for Soldiers* (National Research
  Council, 1997); read through search results.
- Infantry pace (2026-09-30): [FM 21-75, ch. 3 — GlobalSecurity](https://www.globalsecurity.org/military/library/policy/army/fm/21-75/Ch3.htm);
  [Barrage (artillery)](https://en.wikipedia.org/wiki/Barrage_(artillery));
  [Tobler's hiking function](https://en.wikipedia.org/wiki/Tobler%27s_hiking_function);
  [Naismith's rule](https://en.wikipedia.org/wiki/Naismith%27s_rule);
  [MTI on movement over uneven terrain](https://mtntactical.com/research/yet-calculating-movement-uneven-terrain/)
  (quoting FM 21-18's march rates);
  [a review of Rowland's *Stress of Battle*](https://www.themself.org/2013/12/stress-of-battle-part-2-op-research-on-urban-battles/);
  [Advance rates in combat — The Dupuy Institute](https://dupuyinstitute.org/2023/04/26/advance-rates-in-combat/).
  Papers read as abstracts through Consensus: Silk et al. 2013 (*Military
  Medicine*, section assaults); Billing et al. 2011 and 2015; McGuire et al.
  2025; Myers et al. 2016; Hunt et al. 2016; Looney et al. 2021; Arya et al.
  2022; Scarf 2007; Norman 2004; Goodwin et al. 2024.
- Mortars against men dug in (2026-09-30): FM 7-90 App. B, FM 6-30 App. E
  and FM 100-61 ch. 9 (GlobalSecurity, read in full); [the psychology of
  artillery effectiveness — Wavell Room](https://wavellroom.com/2020/08/18/the-psychology-of-artillery-effectiveness-fire-support/);
  [artillery and mortar tactics of WW2 — balagan.info](https://balagan.info/artillery-and-mortar-tactics-of-ww2)
  (quoting Evans and Ellis); [human factors in warfare: suppression — The
  Dupuy Institute](https://dupuyinstitute.org/2018/10/11/human-factors-in-warfare-suppression/).
