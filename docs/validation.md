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
- The self-hit stays the document's 5% a grenade.

**Measured**, 60 harness battles a cell, research figures:

| Battle | Grenades that caught someone, before → after | Own men hit, before → after |
|---|---|---|
| Platoon 3:1 attack | 27 → 37 | 4 → 16 |
| Platoon 2:1 attack | 9 → 19 | 3 → 8 |
| Company 2:1 attack | 55 → 97 | 7 → 18 |

Out by explosives (100 battles a cell): platoon meeting 22% → 31%, platoon
3:1 attack 26% → 30%, platoon 2:1 attack 37% → 40%; the company battles moved
by a point, and the calibrated ones not at all (83%, 78%).

## Open

For the author, in rough order of what they move:

1. **The fire a battle is given.** 75% holds with a mortar section on call all
   battle, which the company scenario now has (twelve missions a side). The
   harness's default (a bomb a turn) gives 19–31%. The company battle has not
   been played by a person on it yet.
2. **Ammunition** (backlog 12): nothing runs out, whatever the rate — a
   grenadier fires his rate every turn.
3. **A defender's breakpoint**: 42–50% casualties against the rule of
   thumb's 40%, traded for the 2:1 attack's planning target.
4. **The figures that are ours**: one launcher per four men; the tail weights and the 10 turns of
   fatigue; the ⅓ on small arms; the mortar's and tank HE's lethal areas, the
   RPG's against men, and the 25 m footprint.
5. **Not researched yet**: the charges (a 100–200 m reach at 50%
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
