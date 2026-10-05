# Handoff — where the project stands

**Current as of 2026-10-05: save and resume — a battle in progress is kept in the browser after every change and resumed from the picker or by a reload, mid-turn included, replaying exactly (`src/app/session.ts`; pinned in `computerSide.test.ts`, driven in the browser both ways). Before that, the same day: single-player, first cut — the picker's *מול המחשב* plays the attack against the computer, which defends as the harness's defender does (`src/app/computerSide.ts`, shared with `scenarioBattle.ts`; the harness's standard measurement byte-identical after the move); driven in the browser to a RED win at the 2:1 on turn 6. Before that, 2026-10-04: the quality gap built (README decision 84): small arms and the assault, ×1 between equals, ×3 at the widest, on the normal curve turned over; elite against irregular wins 85% with mortars, 100% without, and the other way 4% and 0% (balance.md, fifty-ninth round). Before that: the force-quality matrix built (README decision 83), mapped onto `motivation` / `experience` as the author asked. ⚠️ The mapping is ours. Measured on the tel at 3:1, 400 battles a cell: attacker cells 32–53%, defender cells 14.5–65.5% for the attacker, every row and column ordered, and the baseline unchanged at 40% (balance.md, fifty-eighth round). Before that, 2026-10-03: the traits built (README decision 82: decisions 69, 71, 72; a force rushes at its slowest man's pace, walking is the gait's own, by the author's ruling on the measurement). Standard measurement: tel 3:1 41%, 2:1 33%, urban 18%; the eight reference plans' 3:1 median about 30% with the traits or without (200 battles a plan; under its 40–55%; the fall came with decisions 75–81), and the plan that "beat the deliberate one" turned out to be fire and movement with full reconnaissance, renamed by the author; history's hasty attack (one scout) wins 29% at 3:1, inside history's 15–35% (balance.md, fifty-fourth to fifty-seventh rounds). Before that: PR #16 merged; the author's rulings on the open questions (README decision 81: explosives 60–80%, 2:1 accepted, direct HE bombards, house types and a force-quality matrix to come, traits go-ahead after merge). Before that: the urban test bed (`yokneamUrban`), the figures checked against the sources (decision 79) and ARES's indirect-fire figures (decision 80). Then: tel 3:1 41%, 2:1 36% (accepted), explosives' share 64% (inside 60–80%), urban 18%. Before that: direct-fire HE on the shell's rules (README decision 75); buildings that take damage, critical hits through windows, slits and roofs, and armour by weapon, class and facing (76–78). Before that, 2026-10-02: the author's rulings on every open question (below, *Rulings of 2026-10-02*; README decisions 69–70); the doctrine engine is public, commercial-edition work and waits for the author's manuals. Before that, 2026-10-01: PR #12 merged (balance rounds 34–47, rules decisions 67–68); the balance is judged by closeness to real-life outcomes on a set of reasonable plans, and meets the small-unit targets; the AI commanders compared; the doctrine engine (backlog 21) is next ([doctrine-handoff.md](doctrine-handoff.md)). Before that: decisions 60–66 (2026-09-30), 51–59 (PR #10), 40–50 (PR #9), 36–39 (2026-09-23); the business plan (2026-09-24): [business-plan.md](business-plan.md).** This is the working note for whoever
picks the project up next: the state of play, what is waiting on the author, and
what I would take next. It is **current state only** — history lives in
[handoff-archive.md](handoff-archive.md), and anything durable has been moved
out of here on purpose:

- [AGENTS.md](../AGENTS.md) — the operating manual: commands, conventions that
  are easy to get wrong, and how to drive the game in a browser.
- [README.md](../README.md) — the design: what is implemented, the **rules
  decisions**, the gap list and the roadmap.
- [docs/mechanics.he.md](mechanics.he.md) — the rules document itself.
- [docs/balance.md](balance.md) — every number that was chosen rather than
  transcribed, and the interactions to preserve when tuning them.
- [docs/review-checklist.md](review-checklist.md) — what to check before
  committing, written for any reviewer of any make.
- [docs/driving-the-game.md](driving-the-game.md) — scripting the browser to
  verify a change for real.
- [docs/sources.md](sources.md) — the reference library: every report and
  page the numbers were checked against, where to find it, how far it was
  read, the figures in play with their sources, and the air-delivered
  munition figures for when air support comes (backlog 10).
- [docs/business-plan.md](business-plan.md) — who it is for, editions, free
  and paid, build order, and the open business items.
- [docs/validation.md](validation.md) — the game's numbers against the
  research, with sources, and what `npm run validate` measures.

## Green as of this commit

```
npm run check       lint + typecheck clean, 897 tests, 55 files
npm run balance     the balance harness; see balance.md for every run recorded
npm run validate    the numbers against the sources; see validation.md
node tools/smart-attacker.mjs [scenario] [turns]
                    a scripted attacker plays a scenario in the browser
                    (dev server on :5199 first; SEED=n for other dice)
```

The app opens on a **scenario picker** (Yokneam, Tel Azeka, a company
battle on Tel Azeka, and a company (3:1) and two platoons (2:1) assaulting a
prepared platoon there — or a saved battle to review). **The scenarios are
test beds** (author, 2026-09-28); the real ones come later. `?seed=N` in the
address plays one on other dice. A battle opens on **mission
planning** before turn 1, and the demo plays end to end in the browser,
including the debrief. The two platoon battles have **no indirect fire** any
more (rules decision 37); the company battle is where fire is planned and
called. The
rule is that nothing is called done on tests alone: if a player can see it, it
gets driven in the actual game first.

## How this repo expects to be worked on

The rules that matter are **enforced, not written down**. `npm run check` is the
one command — lint, typecheck, suite — and the three surfaces divide the work
with one owner per rule: [`eslint.config.js`](../eslint.config.js) for
determinism and layering, [`src/invariants.test.ts`](../src/invariants.test.ts)
for what a selector states badly, and the compiler for the four switches over
`RecordedAction`. Node is pinned to **24** in `.nvmrc`, which `engines` and CI
both read. Prefer adding a check to adding a paragraph.

Instructions are vendor-neutral: [AGENTS.md](../AGENTS.md) is canonical,
`CLAUDE.md` is a pointer to it, and `.claude/` holds adapters only — hooks that
call the project's npm scripts and a reviewer that reads
[review-checklist.md](review-checklist.md). Any assistant should be able to work
here from AGENTS.md alone.

## Start here (2026-10-01, end of the day)

**Everything is merged to `main`** (PR #12; this handoff, PR #13). Two
things changed the course of the project in the last two days, and both
govern the next step:

1. **The author's guideline: results are judged by closeness to real-life
   outcomes** — win rates, and what attacks cost each side, against the
   sources (validation.md). Balance means **reasonable plans** land in the
   targets, not one scripted plan.
2. **The layers divide** (README, backlog 21): **rules** are tuned to real
   outcomes; **drills** come from doctrine and stay fixed; **plans** are the
   players' or the AI's. Today's drills are still ours, and the next large
   piece of work is replacing them from the manuals:
   **[doctrine-handoff.md](doctrine-handoff.md)**. It is commercial-edition
   work on open-source manuals and goes in this public repo; it waits only
   for the manuals the author has collected, which are on the author's
   computer and are to be embedded too (author, 2026-10-02).

**Where the balance stands, 2026-10-03** (balance.md, fiftieth to
fifty-second rounds; README, decisions 75–80; every figure in play and its
source in [sources.md](sources.md)). Standard measurement, 200 battles each:

| Measure | Now | Target / source |
|---|---|---|
| Tel Azeka 3:1 | **41%** | 40–55% (decision 68) |
| Tel Azeka 2:1 | **36%** | 20–35%; accepted (decision 81) |
| Yokneam urban (company, 2 tanks, 2 APCs against a platoon in houses) | **18%** | — (the test bed for decisions 75–78) |
| Explosives' share of losses, tel | **64%** | 60–80% (decision 81) |
| Urban: BLUE's vehicles out a battle | 21% | — |
| Urban: window / slit criticals a battle | 3.2 | — |

The author looked at these and found them fine (2026-10-03). Before
decisions 75–80 the same measurement gave 49% and 27%. The reference
plans (below) have not been measured since; their medians were 42% and 24%
on 2026-10-01.

The **reference plans** are `--rule` variants of `npm run jev-sim` (A
calibrated `—`; A + flank `flank`; B deliberate `basefire,bound,holdshort`;
E fire-heavy `holdshort,prep`; D flank `basefire,holdshort,flank`; A + move
up `moveup`; B + move up `…,moveup`; C hasty `rush`), 100 seeds a scenario
from 1000, both tel assaults. They cost no tokens; a full set takes about an
hour four at a time.

**The AI commanders** (balance.md, thirty-fourth to thirty-sixth and
forty-sixth rounds): on today's rules Jev wins **15% / 5%** and Haiku
**5% / 5%**. Most of the gap is their own plans (Jev: the hasty attack with
bounding and holding short; Haiku: the flank and moving up before the enemy
is found — a real mistake the game rightly punishes). Opus and Sonnet behave
alike and cost far more: compare Haiku and Jev only. Keys:
`TYPESAFE_API_KEY` (Jev), **`JEV_ANTHROPIC_API_KEY`** (Claude; the cloud
session keeps `ANTHROPIC_API_KEY` for itself). The next design for the AI is
backlog 22 (plan once, compute, execute cheaply), after the doctrine work.

**Rulings of 2026-10-02** (the author, answering every open question):

| Question | Ruling |
|---|---|
| Hasty attack 45% at 3:1, flank plan 25% | Wait for doctrine: measure the reference plans again on the doctrinal drill, then rule |
| Fire on the move (`fireOnTheMove`, off) | Keep, off, until doctrine says whether infantry fires while moving |
| Fire support by odds | Per scenario, in its spec (README decision 70) |
| The OPORD (`src/sim/opord.ts`) | Rewrite it from doctrine; not to be used again before |
| Mission and victory conditions (backlog 18) | From doctrine: the manuals' definitions of mission accomplishment |
| Direct-fire HE | Review it now — cloud work, no manuals needed |
| Reserves for the other layouts | From doctrine |
| The traits' other effects | Built (decision 82): per soldier, ±20%; the slowest man sets a rush's pace, not a walk's |
| Fatigue | Built (decision 82): by strength; ⚠️ points and thresholds ours, after Ito 1999 |
| Who fires first | Built (decision 82): within a side, still forces first, then agility; the hotseat player still chooses his own order |
| Skills | Every soldier has an MOS from doctrine, with weapon, weight, ammunition and equipment, a skill level per man, and a comrade takes up a fallen specialist's weapon (decision 73) — not built |
| Campaign traits | Learning by wisdom, named quirks, relationships within a squad only (decision 74) — with campaigns |

Decisions 69–74 came from a survey of what other tactical games use traits
for, with the cost at scale kept in view: none adds a sight line, and none
adds a die where the force rolls once today (README, after decision 74).

The doctrine items are in [doctrine-handoff.md](doctrine-handoff.md)'s
scope. The author asked for the rulings to be recorded and nothing built
yet.

How the last two days went, round by round, is in
[handoff-archive.md](handoff-archive.md), *2026-09-30 to 2026-10-01*.

**Where the game stands** (README, *Rules decisions*; balance.md):

- **60–65** (2026-09-30): a defending platoon's reserve counterattacks; a
  metre climbed costs 5 m; full cover against a shell by the sources;
  suppression (reach 30–75 m, pinned is heads down, roofs halve it, danger
  close, a pinned defender assaulted tests its nerve); nerve lost by cover; a
  pinned force fires to 400 m at half its chance beyond 100 m.
- **66** nerve in the open ×1 (and division-level targets, 55–70% / 30–45%).
  **67** an attacker's breakpoint at **30%** again. **68** targets for
  small-unit attacks: 3:1 on a prepared position **40–55%** (70–75% with
  surprise or strong suppression), 2:1 **20–35%** — judged on reasonable
  plans and on losses.
- **Drill (ours), 2026-10-01:** bounding by platoon at one level and only
  within 400 m of a known enemy; squads step by covered ground once released;
  platoons wait at the last cover to close together (≤ 5 turns); the company
  can move up to an assault position chosen against what the scouts found,
  and go round a flank on the enemy's side. Each has a `--no-…` switch in
  `jev-sim` where it was measured.
- **The question set is `2026-10-01.3`.** The scout question says what
  scouts do (bare, it drew one scout from every model). Change a question's
  wording only after `npm run jev-probe` / `npm run scout-probe` shows what
  it does, and bump `QUESTION_SET_VERSION`.
- **Harness policies (ours, not rules):** the scripted defender registers its
  mortars on the dead ground in front of it (measured: where it registers
  barely matters); a defending command post stays put; the scripted company
  sends three scouts.
- **The standard measurement:**
  `npm run scenario-sim -- --recon 3 --watch 1 --look 4 --wait-for-contact --aim 40 --scout-from vantage --wait-in dead-ground --n 200 --target-first squads`
  — 3:1 **49%**, 2:1 **27%**, explosives 72–75%.

**Open, in rough order:**

1. **The doctrine engine** (backlog 21), when the author brings the manuals:
   [doctrine-handoff.md](doctrine-handoff.md). Its scope now takes in
   victory conditions, reserves, the OPORD, fire on the move and the hasty
   attack's ruling. Then the reference plans measured again on doctrinal
   drills.
2. **Direct-fire HE** — **done 2026-10-03** as rules decision 75: the
   author's ruling was to put it on the same rules as indirect fire, and
   it is on for a new game (`directHeAsShell`). It cost the attacker
   6 / 3 points on the standard measurement (48% → 42%, 32% → 29%;
   balance.md, *Forty-eighth round*). Left open: **measure the reference
   plans again under it**, since the 3:1 median was 42% before and may
   now fall below decision 68's 40%; the armour damage table (a flat 20%
   penetration whatever the weapon and facing), which this did not touch;
   and whether direct HE should cost `bombarded` nerve like a shell.
2a. **Buildings, critical hits, armour** — **built 2026-10-03** as rules
   decisions 76–78, on by default. Most of their figures are ours (⚠️ in
   the README; sources on validation.md). They could not be measured: the
   harness's battles have no buildings and no vehicles (balance.md,
   *Forty-ninth round*). **The test bed is built**: `yokneamUrban`
   (balance.md, fiftieth to fifty-second rounds), 18% for the attacker
   today. Its houses are twice the reference size, so none comes down in a
   battle (about 5 tank rounds a battle against about 20 needed). The
   sources were read on the page on
   2026-10-03 (validation.md, *second pass*), and four rules were
   corrected from them. Still unsourced: rounds to bring a house down,
   window, slit and roof chances. Not built: rubble slowing
   movement, breaching walls, an ATGM weapon, machine guns against light
   vehicles, active protection, passengers.
3. **The traits are built** (decision 82). **For the author:** the reference plans' 3:1 median is about 30%, under its band, and plan B (base of fire of riflemen, waiting out its suppression) is the weakest deliberate plan, for the doctrine manuals to settle (balance.md, fifty-sixth and fifty-seventh rounds). **The MOS**
   (decision 73) needs the doctrine's squad organisation first, and moves
   weapons from the force to the man; **campaign traits** (74) wait for
   campaigns (backlog 16).
4. **Play the new rules in the browser as a player** (the author, on the
   author's computer). Suppression, heads down, danger close, the nerve
   test, the counterattack, the 30% breakpoint: none has been played by a
   person. The browser game is hotseat; the scripted company's choices
   (scouts, moving up, bounding) exist only in the headless harness.
5. **The AI commander in three parts** (backlog 22), stage 1 (plan once,
   evaluate once by rule from the side's belief) — after 1.
6. **Force quality matrix**: **built 2026-10-04** (decision 83). **For the author:** checked against Dupuy and the rest (validation.md, *Force quality*), the mapping moves only nerve: the casualty exchange hardly moves with the attacker's quality, where Dupuy's CEV (1.2–1.5 within armies, 1.75–2 Israel against Egypt) would move it a lot. **Ruled and built as decision 84** (the quality gap); the author accepted its size and the nerve between equals on the measurement (2026-10-04). Closed. No scenario uses a cell yet. No scenario uses a cell yet: the test beds are all regular, experienced. **House types** (decision 81), with the urban combat work, are next.
7. **Flat-ground misses**, **overhead cover for higher echelons**,
   **ammunition** (backlog 12) — for battalion battles.

## Waiting on the author

**The artillery, as the 2026-09-23 sessions left it.** Decisions
36–39 are ✅ and built (README):
- **36:** rounds for effect by weapon, 6 artillery / 12 mortar. A call for
  fire journals its number; a recording from before replays at what it
  fired (`madeBeforeDecision36` in `recording.ts` tells the eras apart).
- **37:** who may call — mortars company+, artillery battalion+
  (`Game.mayCall`, `GameOptions.commandEchelon`, `FIRE_SUPPORT_MIN_ECHELON`).
  Both platoon demos lost their indirect fire.
- **39:** the caller chooses adjust fire or fire for effect
  (`callForFire`'s `method`; `שיטה` in the UI; Jev for simulated echelons).
- **38:** mission planning on turn 0 — `registerTarget`,
  `designateObservationPost`, `prepareAlternatePosition` — in the engine,
  the harness (`--defender-ops`, `--alternate`) and the live UI.

**The artillery stage is closed** (author, 2026-09-23). He accepted the
mission-planning numbers (6 targets a weapon, OPs to 1,000 m, one alternate
a force, 25 m, partial for a force with none). They, and the open questions
below, are to be **tested and balanced when the artillery is**, at
battalion, with echelon scaling (backlog 3, where the README says so):
- how far an alternate position may be (an attacker may prepare one on the
  objective today);
- whether one mission in hand a weapon is a rule (today the UI's and the
  harness's);
- why displacing to an alternate still hurts the defender (the drill moves
  in the open under fire);
- the artillery itself: 6 rounds for effect, 270 m to 50 m, never measured.

Not yet shown to him: the company battle on Tel Azeka (`telAzekaCompany`),
whose layout is ours. He has not played the planning stage or the call for
fire either; nothing about this session has been played by a person yet.

His guiding principle, checked against the sources and agreed, is that
explosives cause **about 75% of casualties** in modern war
([balance.md](balance.md), *Fifth round*). With fire missions on both sides
it measures 82–99%, because the fight is decided before small arms get a
say (see *Start here*).

**What the balance work has settled** (2026-09-22/23, decisions 20–27, all on
balance.md):
- A harness of headless NATO-style battles, judged against four planning
  targets at each of three echelons (`TARGETS` in
  [`sim/balance.ts`](../src/sim/balance.ts)).
- A **squad drill** as data ([`app/drill.ts`](../src/app/drill.ts)), which is
  the executor future simulated subordinates will use (backlog 15) and what
  the TTP editor will edit (backlog 20).
- Under the Western drill and today's rules: **10 of 12 targets**. The two
  misses:
  - a winning platoon attacker at 3–4:1 loses 8%, where the target is
    10–30%;
  - a company attacking at 2:1 wins 20%, where the target is 30–70%. This
    has been the trade for making explosives count; with a fire plan it
    recovers to 50%.

**The company mirror's BLUE lean was not a bug** (closed 2026-09-23, the
session after decision 27). It was the seed window. Over 7,400 battles on
disjoint seeds the mirror is 3386 BLUE to 3370 RED, and the lean flips sign
between windows. See balance.md, just above *How the engine scales*.
`npm run balance` takes `--seed <first>` now; rerun a lean on a fresh window
before chasing it.

**Still open, and his:**
- **The company battle's layout** (above). The rest of the artillery waits for battalion.
- **The Western drill's numbers**: all ours.
- **The assault reply rate** (ruling 1, on trial as `assaultReplyChance`).
  It measures as irrelevant, and we suggest 30%.
- **The size of the prepared-defender bonus** (decision 24, his rule, our
  numbers).
- ~~The traits' other effects~~: ruled 2026-10-02 (decision 69).

**Morale is built (rules decision 19), and so are the traits (decision
82).** Strength, intelligence, wisdom, agility, charisma and luck are drawn
for every man and act through morale and, with `traitEffects`, on his own
pace at a rush, aim, spotting, being hit and his luck; `fatigue` tires him
by strength.
Also the author's, and not built: **campaigns carry the pool of will, and only rest refills it** (backlog 16), and **taking the
objective** as a morale gain, which needs backlog 18 first.

**Two further things, both raised 2026-09-21, neither blocking today's work.**

1. **Mission and victory conditions** (backlog 18) — the shape, before
   anything is built on a reading. Today a battle ends only when one side is
   wiped out (`sideDefeated`), and the document names no משימה, no objective
   and no victory condition. This is the load-bearing one: backlog 16 needs a
   result to carry forward and backlog 17 needs "objective" to mean something.
2. **Weather and light** (backlog 19) — same, and the same reason as morale:
   the document has none of it, so every number would be ours.

Everything raised before those two is closed. The **`LICENSE` carve-out** was
raised and settled the same day (✅ 2026-09-21): it named the two Ramat Menashe
map modules and not the two Tel Azeka ones, which had shipped on 2026-09-16
without it. It is grouped by source now, and `src/invariants.test.ts` fails
when a module under `src/app/maps/` is missing from it, so the next window
cannot repeat the omission. On 2026-09-24 it stopped naming files: it covers
map data **by source, wherever it is found** — the whole `src/app/maps/`
directory, the runtime cache and every exported file — so backlog 17 does not
break it. The test now checks that coverage, and that each map module carries
its own attribution. **Drafted by us, not reviewed by a lawyer.**

Six rulings closed on 2026-09-16 (decisions 16, 17 and 18, and two riders on
12), and rules decision 15 on 2026-09-06. The reasoning behind all of them is
in [handoff-archive.md](handoff-archive.md), and the figures he gave are on
[balance.md](balance.md). **Do not reopen a decision without him.**

Some are ✅ *as decisions* while their **numbers** are still ours. They belong to
the balance pass, not to the rules list, and live on
[balance.md](balance.md):

| | Chosen | Note |
|---|---|---|
| Decision 9 | smoke radii **25 / 50 / 100 m** | The document sizes no screen. |
| Decision 13 | casualty bands **0 / 1–2 / 3–5 / 6+** | He confirmed that reports are banded, not where the bands fall. |
| Decision 15 | eye heights **1.5 / 2.5 / 0.5 m**, object cover, **5 m per metre climbed** (decision 61, was 8), **30°** for vehicles | All his, all "tentative until balance"; the climb cost set from the sources 2026-09-30. |
| Decision 16 | laying a charge takes **2 turns** | "Tentatively", 2026-09-16. What the two turns *cost*, and that the charge goes where the force stands, he confirmed the same day. |
| Decision 19 | **every morale number** — losses, gains, test, rally, suppression, reach, breaking points | The shape is his; not one magnitude is. The whole table is on [balance.md](balance.md), with the one measurement that shaped it. |

**Decision 11's riders** (no assault on armour, no ammunition tracking) remain
assumptions he has not contradicted; ammunition is backlog 12's job.

One rules question is **open but not asked**, because nothing needs it yet:

- **Roads as going.** The map draws roads and the engine ignores them. Faster
  along a road, a vehicle confined to one — the document does not raise it.

## Do not re-propose

Closed deliberately, with reasons that are not obvious from the code:

- **A limit on how many charges a force may lay.** No stock and no cooldown is
  deliberate: put to the author 2026-09-16 and **deferred to ammunition**
  (backlog 12), because a stock of charges per force is the same mechanism as
  rounds per force and a separate one here would only have to be unpicked. It
  is a known dominated option in the meantime — for a force that was going to
  sit still anyway the two turns are free (decision 16).

- **An artillery battery as a standalone unit.** Indirect fire is off-map
  *because* the playable slice is the platoon-leader view — a platoon commander
  calls for fire rather than owning guns. The battery arrives with **echelon
  scaling** (backlog 3) and not before (decision 8). The author set where
  (decision 35): mortars on the map at company and above, artillery at
  battalion and above. Counter-battery fire comes with them, and there is
  none for off-map guns.
- **Reading the cover modifier as percentage points.** Settled on the document's
  own grammar, not on the arithmetic (decision 7).
- **A flat bonus for a sector of observation.** It made the width control a trap
  — the widest arc dominated every narrower one. The bonus is divided by the
  arc's width for that reason (decision 14).
- **Raising the charge trigger radius to the 20 m search band.** The gap between
  10 m and 20 m is the ground where a charge is found without being trodden on,
  which is the only thing the search roll buys (decision 10).
- **Terrain types** (wood, built-up, each with a cover grade, a sight rule and
  a movement cost). Proposed and **withdrawn on the author's steer**
  2026-09-06: the game is to scale from soldier to brigade with metre-level
  resolution underneath, so the map carries *objects* and *elevation*, never
  a zone with a rules table. A wood is a footprint from OpenStreetMap, not a
  type (decision 15).
- **An elevation bonus to hit or to detect.** "No hit modifier for now" — the
  sight lines already reward the high ground. To be looked at again at
  balance, not before (decision 15).
- **Judging "no climb" on the whole order line.** It was the shortcut in
  `reachAlong`, and on the real map it disagreed with the bound's own
  samples one order in 260 and threw out of the order loop. The climb is
  judged on the bound taken; a test holds a field on which the old shortcut
  overspends.

## Do not re-derive

Measurements that cost real time and are already recorded:

- **Charges, before the decision-10 fix:** a charge 5 m off the route at the
  midpoint of a 50 m walk fired **200/200 seeds and was found 0/200**.
- **Hidden enemy, same shape:** a stationary squad 15 m beside a 50 m walk was
  found **0/400** from the endpoint against **~26%** beside the halt.
- **Sector bonus by width:** `13.5 ÷ width` → +23% / +15% / +8% at
  60° / 90° / 180°, against a flat −20% outside.
- **Dead ground on the demo map:** BLUE-2 running up the centre from
  (400, 60) is seen by nobody on turn 1 at (400, 160) — **0/200 seeds** —
  and by someone on turn 2 at (400, 260) — **200/200**, RED-1 itself 185
  times. The shoulder at about y = 250 is where the northern low ground comes
  into view.
- **Node support windows** (from `nodejs/Release`, checked 2026-09-05): 20 went
  EOL **2026-04-30**, 22 ends 2027-04-30, 24 ends **2028-04-30** and leaves
  Active LTS on 2026-10-20. That is why the pin is 24 and not 22.
- **What a NATO symbol costs to draw** (measured in the dev browser,
  2026-09-21): **0.037 ms** per `renderUnitSymbol` call before it was cached,
  **0.0006 ms** on a cache hit after — about 60×. Worth knowing what that does
  *not* buy: at the 5–8 tokens a platoon battle draws it is well under a
  millisecond per re-render either way, so this was never the cause of the
  "ten button clicks in one script call is too many" ceiling further down
  this file. That cause is still unmeasured. The cache earns its place at the
  token counts echelon scaling (backlog 3) brings, and on a phone (Stage 4),
  not on a desktop platoon.
- **What Jev actually exposes** (from `typesafe-ai/typesafe-sdk-js`, read
  2026-09-21, for backlog 15): three question kinds — `noul`, `choice`, `score`
  — answers carrying a confidence and per-label probabilities, and **no seed and
  no temperature among the exported types**. Hosted API, Node 20+,
  `TYPESAFE_API_KEY`, no published weights and no self-hosting. The vendor's own
  documentation site was unreachable from a sandboxed session, so the SDK source
  on GitHub is the reference that can actually be read.

## What I would pick up next

*Start here*'s **Open** list is the order. While the manuals are not
here, toward a browser beta (the assessment of 2026-10-05): **play-testing
single-player** (the author, `?vs=computer`), then a **designed scenario** that uses force quality (an elite
raid on an irregular-held position, no mortars), the **computer as the
attacker** (the harness's `ScriptedCompany`), and house types for the urban
work (decision 81). The force-quality
matrix is built (decision 83) and waits on the author's view of its
spread. Mission and victory conditions (backlog 18) and the **base of
fire** (machine guns a commander pulls out to form it; README backlog 21)
are to come from doctrine.

## Traps that cost real time

- **A background measurement reads the code as each job starts.** A run of
  `jev-sim --rule` jobs (`xargs -P 4`) launches a fresh process per job, so
  editing `src/` while it runs changes the later jobs. Develop in a
  `git worktree` (symlink `node_modules`) while a measurement runs, and merge
  after (2026-10-01 did this throughout).
- **"Lost" is not "casualties".** `ScenarioBattleResult.lost` counts the
  broken and fled with the killed, wounded and captured; the sources'
  casualty figures do not count a failing attacker's broken men, who rally.
  Compare a failed attacker by `down`, a lost position's defender by `lost`
  (balance.md, fortieth round: round 39 got this wrong).
- **A 20-seed table can be wrong by 50 points without anyone noticing.**
  Round 34's "holding short wins 10%" did not reproduce at its own commit
  (65%), and three rounds reasoned from it. Rerun a surprising row at 100
  seeds before building on it.


Browser-driving traps live in [driving-the-game.md](driving-the-game.md) and
testing ones in [AGENTS.md](../AGENTS.md). These are the ones specific to where
the code currently stands:

- **A map symbol is not centred on its unit.** APP-6 amplifiers sit above the
  frame, so an image's centre is ~36 m off the unit's position. Read a
  selected unit's position from its `circle.selection-ring` (`cx`, `cy`).
  The smart attacker read image centres for its first runs and crept forward
  14 m a bound; every result from that version is marked in validation.md.
- **A squad far from its command group takes orders every other turn**
  (`g.token-no-orders`). A script that alternates bound/hold by turn parity
  can lock such a squad on "hold" for the whole battle.
- **Research-figure rules are gated on `lethality`**, and a recording without
  the field reads as `"document"`. Decisions 40–50 all follow this: a new
  research rule goes behind `this.lethality === "research"` so older
  recordings replay.
- **The container blocks most military-manual sites** (globalsecurity,
  infantrydrills, archive.org, DTIC). The Apify connector's `web-fetch` and
  `rag-web-browser` get through; a large result is saved to a file and can be
  searched with `jq`. Chromium in the container also phones Google, which
  the proxy rejects — harmless noise.

- **A battle does not begin when it is built.** The App opens on mission
  planning at turn 0 and calls `beginTurn` only when both sides have planned
  (decision 38). The harness and the tests still begin at once, which is
  fine: planning is optional. But anything in the App that assumes turn 1 on
  mount — `activations[0]`, `game.turn`, the initiative line — is wrong
  during planning.
- **Three eras of rounds for effect in a recording.** Before decision 36 a
  mortar mission fired 6. Between decision 36 and the fix that journals the
  number, it fired the weapon's default and the call carried none. Since
  then, every call carries its number. `madeBeforeDecision36` tells the first
  two apart by the header (the decision 37 flag, numbers written into the
  allotments). A player's call never takes a number from the caller: only
  `replayCallForFire` does.
- **The harness strikes what the battle's echelon may not call** (decision
  37) and says so on the first line of its output. A company row given
  `artillery=2` plays without it. `--any-echelon` measures without the rule.
- **A force's men are drawn from their own rng, not the game's** (rules
  decision 19). `generateMorale` seeds from the game's seed and the force's
  id, because a recording carries the men as drawn and a replay does not draw
  them again. Move that draw onto `game.rng` and every recording diverges
  after setup — the digests will say so, but the reason will not be obvious.
- **Morale finds casualties by itself; suppression does not.** The morale step
  compares every soldier with the snapshot taken when the turn began, so any
  way of hurting a force is counted. But *being shot at* — suppression, and
  which way the fire came from for flanking — is only known where the engine
  calls `noteFire`. A new way to fire at a force must call it, or it will kill
  without frightening anyone.
- **`--swap` is not a second sample.** It replays the same seeds with the
  sides' places exchanged, so a fluke of the seed window survives it and
  looks like a bias that "follows the side". It put a bug that was not there
  at the top of the 2026-09-23 handoff. Check a lean on a disjoint window with `--seed`.
- **Tests that end a turn need two steps.** `advanceToPhase("initiative")`
  straight after `beginTurn()` does nothing — the game is already there. Go to
  `summary` first; `morale.test.ts` has an `endTurn` helper.

- **Recordings saved from the demo before Naismith (2026-09-06) replay
  differently**: an order's bound now stops short uphill, so every position
  after the first climb moves. `verifyRecording` will say so.
- **Sealed recordings made before 2026-08-16 that cross a minefield will fail
  `verifyRecording`.** Decision 10 changed how many rng draws a move near a
  charge makes. That is the tool doing its job, not a regression.
- **Covering fire answers a bound *late*, and that is the ruling working.** A
  force answers only an enemy its side has **detected** (author, 2026-09-16),
  and the roll that picks a mover up happens on the way into the *fire* phase,
  after movement. So the first bound that breaks cover in front of a coverer is
  not answered; the ambush fires on the next one. A force already on its side's
  map is answered the moment it moves. Both halves are pinned by tests. It is
  the sort of thing that reads as broken at the table before it is explained,
  and the alternative — the coverer rolling its own look at the moment of the
  trigger — is a change he would have to make, not us.
- **Measure before believing a performance claim, including this file's.**
  Caching the drawn NATO symbol was taken on because two notes here said
  milsymbol re-rendering was why long click scripts time out. It is 0.037 ms a
  call, which at a platoon's 5–8 tokens is under a millisecond per re-render:
  real, worth caching for what echelon scaling and a phone will bring, and
  **not** the cause of that ceiling. The cause is still unmeasured. The dev
  server's modules import inside `page.evaluate`, so timing something takes
  about ten minutes — see [driving-the-game.md](driving-the-game.md).
- **A rule with two halves is where the bugs have actually been — every time.**
  Three of the five decisions settled on 2026-08-16 turned up real defects this
  way; on 2026-09-16 it was **eleven**, across three features, and not one of
  them was a typo or a bad algorithm. Each was one rule applied in two places
  off different state, each half defensible alone: cover written at placement
  but read mid-bound, exactness keyed to the firer where the document keys it
  to the owner of the casualties, three of four attack paths carrying a
  refusal, an action economy borrowing a flag two other rules read. See
  [handoff-archive.md](handoff-archive.md) for that day's list.

  **When you touch one half, go and read the other** — and when a comment says
  a rule "cannot disagree" with another, check that it is true rather than
  intended. One of the day's bugs was a comment of mine claiming exactly that
  about two expressions that were not the same.
- **A sealed recording of a game whose forces had `baseCover`, made before
  2026-09-16, will fail `verifyRecording`.** Placement now gives a prepared
  force its cover, so the first turn resolves differently. No such recording
  exists in the repo — nothing set `baseCover` at setup before Tel Azeka — but
  a recording saved from a scenario of your own might.
- **A new spec is not a playable battle until it is listed.** The tool writes
  `<slug>Listing` beside the builder; add it to `SCENARIOS` in
  `src/app/scenario.ts`. `scenarioCatalogue.test.ts` fails until you do, and a
  spec without a `brief` is refused by the tool — the picker shows it to both
  players, so it is a tasking, never forces or charges.
- **`src/app/scenario.ts` is a list, not the scenario.** The demo lives in
  `src/app/scenarios/yokneamIllit.ts`, which is generated — editing it is
  editing a build product, and the next run of the tool throws the edit away.
  The spec is `tools/scenarios/yokneam-illit.json`.
- **Switching battles remounts `App`** ([`Root.tsx`](../src/app/Root.tsx)),
  keyed on the scenario and a pick counter, so picking the same battle again
  is still a new game. The engine is a mutable instance in a ref with a turn's
  worth of state beside it, so a new battle is a new `App` rather than a reset
  that would have to be extended every time a piece of state is added.
  Anything that must survive a switch has to live in `Root`, above the key —
  today that is only a debrief opened from the picker.
- **`addMine` is setup only now** (decision 16). A test or tool that emplaced a
  charge mid-game gets a `PhaseError`; in play a force lays one, which takes
  turns. Every call site was already before `beginTurn`, so nothing had to
  move — but a new one written from memory will fail.
- **`addUnit` records the force as it stands.** Setting `camouflaging` or
  `baseCover` after adding a unit desyncs the recording from the live game — the
  replay gets an undressed unit. Set it before `addUnit`.
- **The demo seed can miss a 90% roll twice.** On seed 2026 BLUE-2 crests the
  shoulder on turn 2 in full view of the tank and the ridge squad, and on that
  seed both missed before the wall fix; after it the tank sees it. Over 200
  seeds it is seen every time. A "nobody saw it" in the browser is a seed
  before it is a bug — measure before ruling.
- **Ten button clicks in one browser script call is too many.** The pane
  re-renders every token through milsymbol between clicks; eight is the
  ceiling, six is safe, and the handoff button's label starts with the side
  (`RED מוכן — הצג את המפה`), so match on the word, not the prefix.
- **The tank's cover is 1.6 m from flipping.** `RED-TANK` stands 4.6 m from
  the nearest house and the cover reach is 3 m; full cover would drop its
  eye to 0.5 m and switch off the "far low ground" lesson.
  `src/app/scenario.test.ts` pins it — if a regenerated map fails there, move
  the tank, do not loosen the test.
- **A log line without an audience does not compile, and that is deliberate.**
  `pushLog`'s third argument says who may read the line (rules decision 17).
  Reaching for the old `pushLog(text, kind, viewingSide)` shape passes a `Side`
  where an `Audience` belongs — the compiler says so, and
  `src/invariants.test.ts` catches it as text too. Use `onlyFor(side)` for a
  decision behind one's own lines, `sharedBy(side)` for an exchange both sides
  were in, `TABLE` for the umpire's bookkeeping, and `pushPerSide` when the two
  sides are entitled to different words — which is every line carrying losses.
- **A force's own object is left off its sight line for 6 m only.** The first
  cut skipped the whole object and let a squad against a house be seen
  straight through it from the far side. `OWN_OBJECT_SIGHT_M` is twice the
  cover reach for exactly the wall-versus-building distinction; read
  `terrainBlocksSight`'s comment before touching either number.
- **A zero-size Browser pane makes every map click land at (0, -1).** With the
  pane hidden the page gets no layout at all — `innerWidth` is 0 — so a click
  aimed as a fraction of `svg.map`'s rect maps to the origin, the order *is*
  accepted, and the log shows a plausible-looking bound to nowhere. Set a
  viewport (`resize_window` 1280×900) before aiming at map coordinates, and
  re-measure the rect *after* the map is on screen rather than at a handoff.
- **The console buffer in the Browser pane survives reloads.** After changing
  an export's shape (a component becoming a `memo`), the buffer shows
  "Component is not a function" with an *older* module timestamp than the
  page. If a clean reload renders tokens and buildings, it is history.
