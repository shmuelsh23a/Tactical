# Validation — the game's numbers against the sources

**First written 2026-09-28**, with rules decisions 40 (a turn is 60 s), 41
(blast and the tank gun from published data) and 42 (rates of fire). This page records what the
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

## Explosives' share of casualties — now low, and why

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
Those shares come from the **number of rounds** fired, not from any one round
reaching far.

**Measured** (morale on, 100 battles a cell):

| Battle | Out by explosives, document | Out by explosives, research |
|---|---|---|
| Company 3:1 attack, one mortar bomb a turn | 31% | 4% |
| Company 2:1 attack, one mortar bomb a turn | 23% | 4% |
| Company 3:1 attack, mortar fire plan | 76% | 31% |
| Company 2:1 attack, mortar fire plan | 46% | 13% |

With the reach corrected, the harness's fire plans are too thin to reach 75%.
The rate of fire is not what holds them back (next section). The number of
rounds a mission fires for effect is, and so is the number of missions.
See *Open*.

## Rates of fire (rules decision 42) — changed

With a 60 s turn, a rate is rounds a turn. The figures below are secondhand,
from manufacturers' and encyclopaedic specifications read through search
results. Where a range is published, the game takes its **low end**, because
those are rates on a range and a crew in a fight also has to find its next
target.

| Weapon | Published | Document | Research figure |
|---|---|---|---|
| Mortar (81 mm M252) | 8–16 sustained; 20–30 for short periods | 3 a tube (never applied) | **8** a tube; a 3-tube section lands up to 24 a turn |
| Mortar (60 mm M224) | up to 20 sustained; 30 for short periods | — | (the 81 mm's is used) |
| Artillery (155 mm M777) | 2 sustained; 4 for short periods | 2 a gun (never applied) | **2** a gun; a 6-gun battery lands up to 12 a turn |
| Artillery (155 mm M109A6) | up to 4–8 for short periods; far less sustained | — | (the M777's is used) |
| Tank gun, manual loader | 5–7 sustained; a qualified loader loads any round in 7 s | 1 a turn | **5** |
| Rifle grenade (40 mm M203/M320) | 5–7 aimed; 15–17 for area suppression | 1 a turn | **5** |
| RPG-7, gunner and assistant | 4–6 | 1 a turn | **4** |

The peer-reviewed work supports the upper rates for guns, over the few
minutes a fight here lasts:

- Howitzer crews firing 60-round missions as fast as they could load kept
  their rate through the whole mission ([Paragallo et al.
  1979](https://consensus.app/papers/details/1589e347d79f5e7a8d4302c81cdbaa5a/?utm_source=claude_desktop)).
- A 155 mm barrel with jacket cooling fires 3 rounds a minute continuously
  without reaching cook-off ([Dubey et al.
  2022](https://consensus.app/papers/details/1bdace81cd9852dc9172eeaf8deeb637/?utm_source=claude_desktop)).
  2 is well inside that.
- Tank crews qualify by engaging within 5 s of a target appearing, firing the
  first round within 5 s and the second within 10 s ([Fingerman
  1978](https://consensus.app/papers/details/858b69d4f7a357bd9e9f3b3348f5408c/?utm_source=claude_desktop)).

**How the engine applies them.**

- A direct-fire launcher fires its rate in one action, each round rolled to
  hit. The crew stops when its target is down.
- A fire unit lands at most its rate × its tubes in a turn. Rounds for effect
  beyond that land on the turns after. Under `document` there is no ceiling,
  as before.

**Measured**, one minute at a nine-man squad standing in the open:

| Weapon | Range | Document: rounds, men out | Research: rounds, men out |
|---|---|---|---|
| Tank gun | 500 m | 1.0, 1.96 | 3.8, 4.99 |
| RPG against men | 150 m | 1.0, 0.86 | 4.0, 0.82 |
| Rifle grenade | 80 m | 1.0, 2.19 | 5.0, 1.72 |

- **The document's single "round" reads as a minute of fire.** With the
  research blast and the research rate, a rifle grenade and an RPG put out
  about what the document's one round did.
- **The tank is the exception**: 2.5 times the document. Its HE round's
  lethal area is a proxy (above).
- **Nothing counts ammunition** (backlog 12). A tank fires 5 rounds every turn
  it is told to, where an M1A2 carries 42.
- **Indirect fire in the harness is unchanged**: 12 bombs or 6 shells for
  effect are inside one turn's ceiling of 24 and 12. What would change it is
  the rounds for effect (decision 36) and how many missions a company is
  given.

## Small arms — kept, and not settled

**Measured**, one minute of a nine-man squad's fire at a nine-man squad, both
stationary:

| Range | Target in the open | Target in full cover |
|---|---|---|
| 50 m | 1.62 men out (0.30 hits a firer) | 0.82 |
| 150–250 m | 1.09 (0.20) | 0.55 |
| 350 m | 0.55 (0.10) | 0.27 |

- Men in real combat hit **7 to 10 times less** than the same men in trials
  under simulated combat. That comes from over 100 small-unit battles, Boer War
  to Second World War ([Rowland
  1987](https://consensus.app/papers/details/5fabd2f5d0d45bb58de007b49cad2b81/?utm_source=claude_desktop);
  urban battle: [Rowland
  1991](https://consensus.app/papers/details/9f98a6e6b53e5e14a2827bb896754fea/?utm_source=claude_desktop)).
- The trial baseline those factors apply to is in DOAC/Dstl reports that are
  not open, so no per-minute rate could be set from them.
- The figures above would destroy a squad in the open at 50 m in about five
  minutes. That reads **fast** against the historical record of long, low-loss
  firefights. It is left for the author, and for a source with a rate in it.

## Where a side gives up — not settled

**Measured**: the loser's losses when it broke, morale on, research lethality.

| Battle | Median | p10–p90 |
|---|---|---|
| Platoon meeting | 47% | 36–58% |
| Platoon 3:1 attack (defender) | 67% | 56–89% |
| Company 3:1 attack | 47% | 39–58% |
| Company 2:1 attack | 35% | 29–44% |

- The Dupuy Institute puts the point where a unit stops attacking at about
  20–25% losses, and where it cannot defend at about 40%. US doctrine (ADRP
  1-02) calls a unit neutralised at 10% and destroyed at 30%.
- The peer-reviewed work warns against any fixed breakpoint. Casualties alone
  seldom explain a break ([Helmbold
  1971](https://consensus.app/papers/details/d012b748f8625ef0934fb87c4a14abf3/?utm_source=claude_desktop)),
  and the effect of losses on a unit is "variable and unpredictable"
  ([Wainstein
  1986](https://consensus.app/papers/details/7b0c5485018751218ff31729291623f0/?utm_source=claude_desktop)).
  So the game is right to break forces through morale and not at a number.
- **Our forces hold on long**: a median of 35–67% losses at the break,
  against 20–40% in the historical rule of thumb. The morale numbers are all
  ours (decision 19), so this is theirs to tune at the balance pass.

## Open

For the author, in rough order of what they move:

1. **The volume of indirect fire.** The rates are set (decision 42) and do
   not bind. Rounds for effect (12 bombs, 6 shells, decision 36) and the
   missions a company is given decide whether explosives reach 75% again.
   Doctrine asks "seldom less than five rounds for each mortar" (FM 7-90),
   which would be 15 for a 3-tube section.
2. **Morale's breakpoints**: 35–67% losses at the break against about 20–40%.
3. **Small arms per minute**: a source with a combat rate in it, or a ruling.
4. **Ammunition** (backlog 12): with rates of fire, a tank or a launcher
   fires its rate every turn. The tank is where this shows first.
5. **The figures that are ours**: the mortar's and tank HE's lethal areas,
   the RPG's against men, and the 25 m footprint.
6. **Not researched yet**: the hand grenade (30% a man in an assault;
   M67: 5 m killing radius, 15 m casualty radius), the charges (a 100–200 m
   reach at 50% activation), and the armour damage table (a flat 20%
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
