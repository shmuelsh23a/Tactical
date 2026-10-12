# Small arms and suppression: doctrine, data, and other games (2026-10-12)

The review the author asked for when three balance bands came out on the
attacker's side (handoff, *The one that blocks work*): "revisit small arms
and suppression according to doctrine, real numbers and the way it is
applied in other games." This is the evidence and a proposal. **Nothing in
the engine has changed yet** — the proposal waits on the author's ruling.

## What the game does now

- **Hits.** Each fit man rolls once a turn (60 s) against the band —
  30 / 20 / 10% to 100 / 299 / 400 m — ×⅓ on the research figures
  (decision 43), × cover (full −50%, firing from full −30%, partial −10%),
  × movement. 1d4 a hit.
- **Suppression.** A force that is fired on takes
  `SUPPRESSION.directFire` **10 for the burst, hit or not**, + 5 a hit
  (×1.5 for a coaxial gun), × the target's experience. It halves at every
  end of turn; suppressed at 15, pinned at 40.

So the burst's suppression **does not depend on how many men fire it, the
weapon, the range or the target's cover** — only the 5-a-hit part falls
with cover, through fewer hits. A two-man scout team at 390 m suppresses
as much as a nine-man squad at 50 m, and a squad in a hole is spared
about 12% of the suppression against 50% of the casualties
(balance.md, *Does suppression pay?*, part 3).

## Doctrine

- **TC 7-9 (1993), para 2-5:** "Suppression requires sustained, accurate
  fire. It is *NOT* the act of spraying rounds downrange." "only one M16
  round every minute may keep a sniper pinned down, whereas 10 rounds a
  minute might be needed on an enemy fighting position or even 60 rounds
  a minute along a woodline." And: "when firing stops, the target may
  become active again."
- **ATP 3-21.9 (2025), para B-36** (mortars): "Soldiers in the open are
  much more easily suppressed than those with OHC." "Inexperienced or
  surprised Soldiers are more easily suppressed." "Suppression is most
  effective when mortar fires first fall; as they continue, their
  suppressive effects lessen."
- **ATP 3-21.8 (2024), paras C-121–C-124, C-52:** the base of fire opens
  at the rapid rate "to gain fire superiority", then the sustained rate,
  which "might not be enough volume of fire to suppress or destroy."
- **TC 3-20.31-040 (2025), para 6-27; ATP 3-20.15 para A-75:** "a unit
  suppresses an enemy position by the sustained rate of fire of its
  automatic weapons"; time of suppression is planned from the area, the
  target type, the range, the rates of fire and the ammunition.
- **TC 3-22.9 (2016), para 8-19:** rapid semiautomatic fire is
  "approximately 45 rounds per minute".

Doctrine gives **volume** as the driver and says cover matters; it gives
no number for cover against small-arms suppression.

## Real numbers

The CDEC suppression experiments (SASE II 1976, SUPEX 1977) are the
measurements; the subjects were defenders **in foxholes** (ATGM gunners
raising a periscope, a silhouette in front of the hole going up with it).

| Finding | Source |
|---|---|
| Rounds a minute on a **100 m front** to suppress foxhole defenders, 50% / 90%: **M16A1 68–128 / 293–413**; M2 .50 23–25 / 75–100; M3 SMG 103–135 / 342–450 (DAR / SUPEX) | Fort Sill Fire Suppression Symposium (1979), ADA081134, annex III-C, Table II — read on the page |
| Rounds per burst (3 vs 6) has "little or no effect"; the **interval** between bursts (4 s vs 12 s) has a significant one. Fire spread at random over the area suppresses more than systematic fire | same, III-C-14/15 — read |
| "Soldiers defending from **frontal parapet** foxholes were significantly less suppressed" than from standard foxholes — the figure is OCR-garbled, "(624)", probably 62% | same, III-C-15 — read |
| Men alone **43–115% more suppressed** than men in groups | same — read |
| M60, probability of suppression by miss distance: RMD = 89.556·e^(−5.395·P) — 0.5 at 6 m, 0.9 under 1 m (≈0.4 at 10 m, ≈0.3 at 20 m) | Kubala & Warnick, ARI TR-79-A19 (1979), ADA071116, p. 2-9 — read |
| Kinetic energy (loudness) explains nearly all the difference between weapons; per round **.50 > MG > rifle** | same; Kushnick & Duffy (1972), AD0519874 — read |
| Perceived danger, men **in foxholes**: M60 66, M16 10, AK 5; men **in the assault**: M60 82, M16 37, AK 29 (.50 = 100) | Kushnick & Duffy, pp. 3-18/19 — read |
| Time down per HE round, men in covered bunkers: about 3–4 s | Mueller & Pietsch, NPS (1978), ADA061417 — read |
| Gunshot share of wounds: WWI 65%, Vietnam 35%, OIF/OEF 16–23%; Afghanistan 2007 ~40% | Belmont et al. 2010; 2012 (secondhand) |

A squad of nine at the rifle's sustained 12–15 rounds a minute puts
108–135 rounds a minute on its front: **one squad keeps about half a
dug-in squad down, and it takes about three to keep nine in ten down.**

**Gap:** no source found gives the cut in *hits* from a fighting
position. The report that measured it — BRL Report 761, *A Study of the
Variation of Weapon Effectiveness With Foxhole Cover* (1954) — was not
obtained. So the hit side has no new evidence; the suppression side has.

## Other games

Four answers to cover against suppression (survey, sources in the
session notes):

1. **One modifier on one roll for both** — ASL, Combat Commander,
   Conflict of Heroes, Panzer Grenadier. Cover protects nerve exactly as
   much as life.
2. **Cover cuts to-hit only; any hit pins** — Bolt Action, Flames of War.
   The least admired.
3. **Cover turns kills into suppression** — Chain of Command (the cover
   decides what a hit does), Steel Panthers ("all small arms will
   suppress more than they kill"), Combat Mission (emergent). Best regarded
   by players.
4. **Cover acts on the suppression itself** — the UK Close Action
   Environment as DSTO describes it (Millikan, Wong & Grieger, MODSIM
   2013): +4 per round within a set miss distance, **×0.1 for a target
   prone or behind cover**, −2 a second; Steel Panthers' trenches recover
   faster.

On volume, most designs give extra firers **diminishing or counted**
returns (Combat Commander's best + 1 per extra unit; CAEn per round);
none gives a flat amount per firing unit regardless of its size — Bolt
Action's one-pin-per-unit is the closest, and the most criticised.

## What it says about our rule

- **Volume is the driver** (doctrine, CDEC). Our burst ignores it.
- **Cover cuts suppression, and more against rifles than against MGs**
  (the foxhole ratings, the parapet finding, B-36, CAEn). Ours barely.
- **Weapon matters per round**: a 7.62 MG round is worth about two rifle
  rounds, a .50 three to five.
- **Range has no direct effect** in the data — it acts through miss
  distance. Ours has none either; nothing to change.
- **Suppression lasts seconds once fire stops**. Halving every minute is
  generous, but changing it is the lifting-of-fires question
  (suppression-design.md), and it is left alone here.

## The proposal (⚠️ for the author)

Replace the flat burst with one built from the fire's volume, the weapon,
and the target's cover:

```
burst = perRifleman × (men firing + gunEquivalent) × coverFactor(target, weapon) + perHit × hits
```

| Figure | Value | From |
|---|---|---|
| `perRifleman`, target in the open | 1.7 | set so one squad (9) on a dug-in squad settles at about 20 — suppressed, ≈ CDEC's 50% — and three at about 60, pinned, ≈ 90% |
| `coverFactor`, full cover, rifle fire | 0.5 | ⚠️ ours, from the foxhole/assault ratings and the parapet finding |
| `coverFactor`, full cover, machine gun | 0.75 | ⚠️ ours, same sources (66 vs 82) |
| `coverFactor`, partial cover | 0.75 rifle / 0.9 MG | ⚠️ ours, between |
| `gunEquivalent`, medium MG | 9 riflemen; the crew's rifles are not added | 100 rounds a minute sustained ≈ a squad's 108–135 rifle rounds — conservative on the heavier round's extra weight |
| `perHit` | 5, unchanged | |

What it would do at 200 m on the research figures, by arithmetic (the
level a turn of fire settles at, about twice the burst; suppressed ≥ 15,
pinned ≥ 40):

| Fire | On a dug-in squad: now → proposed | On a squad in the open: now → proposed |
|---|---|---|
| 1 rifle squad | 24 → **20** suppressed | 26 → **37** suppressed |
| 2 rifle squads | 48 pinned → **39** suppressed, at the edge | 52 → **73** pinned |
| 3 rifle squads | 73 → **59** pinned | 78 → **110** pinned |
| 4-man fire team | 22 → **9** none | 23 → **16** suppressed |
| 1 MG team | 25 → **28** suppressed | 27 → **38** suppressed |
| 2 MG teams | ≈50 → **≈56** pinned | ≈54 → **≈76** pinned |

**Expected effect on the bands, not yet measured:** a dug-in defender
takes three squads to pin rather than two, and an attacker in the open is
pinned more easily — both against the attacker. 2:1 should fall the most
(its two squads per defending squad no longer pin), 3:1 less. The hit side
is untouched, per decision 7's rule and for want of the BRL report.

Dominated-option check: cover is never worse to sit in, but it already
costs time to dig and holds the force in place, so the choice keeps its
tradeoff.
