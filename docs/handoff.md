# Handoff — where the project stands

**Current as of 2026-09-30, after the reference plans and loss exchange (balance.md, thirty-seventh to fortieth rounds), the Claude comparison (thirty-fifth and thirty-sixth) and rules decisions 60–66 (merged to `main`): a reserve that counterattacks, the climb cost, the sources' cover against shells, suppression, nerve by cover, and the balance targets — 3:1 wins 58% and 2:1 38% on the tel, inside the author's 55–70% and 30–45% — and a Jev decider, now run against Jev itself (see *Start here*). Before that, decisions 51–59 (PR #10): neither side knows exactly where the other is — sightings carry location error, and the test players plan fires on an estimate — and the attacker can send reconnaissance first. Before that, decisions 40–50 (PR #9): a turn is 60 s; blast, the tank gun and rates of fire are set from published data; explosives cause 75% of losses where fire support is used; sides give up at the historical breakpoints (30% attacking, 50% defending); prepared positions are dug in with overhead cover; digging in takes minutes (30 to a prone shelter, 90 to a foxhole). The author's design principles are recorded in the README and measured ([validation.md](validation.md), *The design principles, measured*). Before that: decisions 36–39 (2026-09-23); the business plan (2026-09-24): [business-plan.md](business-plan.md).** This is the working note for whoever
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
- [docs/business-plan.md](business-plan.md) — who it is for, editions, free
  and paid, build order, and the open business items.
- [docs/validation.md](validation.md) — the game's numbers against the
  research, with sources, and what `npm run validate` measures.

## Green as of this commit

```
npm run check       lint + typecheck clean, 803 tests, 47 files
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

## Start here (2026-09-30, end of the day)

**Everything is merged to `main`** (the 2026-09-30 PR). Rules decisions
60–66 are built, and the balance is inside the author's targets on the tel.

**Jev and three Claude models have played** (2026-09-30, branch
`claude/jev-api-key-check-zsfa16`, not merged yet): `TYPESAFE_API_KEY` is set
and `api.typesafe.ai` allowed in the cloud environment. Read balance.md,
*Thirty-fourth round* (Jev) and the *thirty-fifth* and *thirty-sixth* (Claude) before anything
else about them. In short:

- **Working with Jev**: it is steady, judges rather than plans, and leans to
  an option whose words the state repeats. The question set now frames each
  question with the commander's role and mission (`MISSION`, naming no
  option — tested), words each option by what it does to the attack, and
  tells it what the company has been ordered. Change a question's wording
  only after `npm run jev-probe` shows what it does on Jev's own recorded
  questions, and bump `QUESTION_SET_VERSION` (now `2026-09-30.3`).
- **Balance with Jev**: 3:1 **10%**, 2:1 **15%** (20 seeds each) against the
  scripted commander's 65% and 25% on the same seeds. The questions are not
  the gap — `jev-sim --rule` answers them as the scripted commander decides
  and wins 63% and 34% over 100 seeds; given Jev's four plan choices, 23% and
  14% — Jev's choices are: it bounds by platoon and holds short
  under its fires, textbook both, and each costs the attack about as much as
  a platoon never committed. **Waiting on the author**: should they (drill
  mechanics, ours), and are the targets meant to hold for Jev too?
- **Claude in Jev's place** (balance.md, *Thirty-fifth round*):
  `jev-sim --claude <model>` (`src/sim/claude.ts`) answers the same questions
  through the Anthropic API. **The key goes in as `JEV_ANTHROPIC_API_KEY`**
  (the cloud session keeps `ANTHROPIC_API_KEY` for Claude Code itself).
  20 seeds a scenario from 1000, 3:1 / 2:1: `claude-haiku-4-5` **20% / 0%**,
  `claude-sonnet-5-5` **5% / 0%**, `claude-opus-5-5` **5% / 5%**, beside Jev
  10% / 15% and the rule 63% / 34%. A model that reasons does not beat one
  that judges, and the small one does best, because it waits for the enemy
  to be found. Sonnet and Opus go in at turn 5, the enemy not found, in
  every battle ("waiting wastes time" against the deadline), and hoard their
  mortars for an approach they never reach. All three send one scout and
  bound by platoon; Haiku and Opus hold short (Opus then won't lift the
  fires until the company has massed).
- **An order, a plan and a memory** (balance.md, *Thirty-sixth round*):
  `--order` gives the OPORD from battalion (`src/sim/opord.ts`, ours: the
  author's to check), `--plan` a plan the model writes before the first
  question, `--memory` its decisions so far. **No commander wins more**
  (0–15% everywhere). Told how long closing under fire takes, Opus and Sonnet
  stop bounding and Jev stops holding short, so those two textbook costs
  were not what held the wins down. The costly choice is going in blind:
  `--rule blind` (the rule sent in at turn 5) wins **18% / 4%** against 63% /
  34%. The order's time line pushes every commander to go sooner, and the
  plans they write (move up under cover to an assault position, find and
  shell the enemy, then go) **cannot be played**: "send the company in"
  commits it to the attack, and there is no step to move up and hold.
- **Back to the balance** (balance.md, *Thirty-seventh round*, 2026-10-01).
  The author's guideline: results are judged by **closeness to real-life
  outcomes**, and balance means **reasonable plans**, not the calibrated one,
  land in the targets, with tactics worth about the 20 points the sources
  show. A set of reference plans (A calibrated, B deliberate, C hasty,
  D flank, E fire-heavy, each with and without moving up to an assault
  position, and two controls) is measured by `--rule`, 100 seeds, no tokens.
  Found: the defender's mortar plan is not the cause; **bounding was a drill
  artefact** (two layers of it and from the first sighting: 8 m a minute
  against the sources' 15–30), fixed in the drill — deliberate attack 29% →
  50% at 3:1; **holding short costs about 6 points, not 50** (round 34's
  10% does not reproduce; corrected there). Fire on the move
  (`GameOptions.fireOnTheMove`) is offered, off, and not recommended. The
  median reasonable plan is 47% (3:1) and 33% (2:1); the floor fails on
  three plans, each for a harness reason: the **assault position** is chosen
  against the plan's estimate before the enemy is found (seen in 18 of 20,
  men lost at 254 m), the **flank** goes by the scouts' observation point
  (a detour), and the **hasty** attack's gap (19%) is untraced.
- **The assault position and the flank** (balance.md, *Thirty-eighth
  round*): moving up now chooses ground against what the scouts found (A +
  move up 10% → 37% at 3:1), and a flank option goes in on the enemy's side
  (flank plan 11% → 42%). The reasonable plans' median is **45% (3:1)** and
  **30% (2:1)**; the spread is about 30 points, the hasty attack (19%) aside.
- **The hasty attack and what attacks cost** (balance.md, *Thirty-ninth
  round*; validation.md, *Loss exchange in attacks*): the hasty attack is two
  ordinary costs (one scout finds the enemy 7 turns later, −33; no fire
  before going in, −20). Against the sources, a **won** attack costs what
  history says (attacker 8–14%, defender ~50%, mostly prisoners and the
  fled); a **failed** one goes on too long (attacker 35–41% lost, sources
  10–25%), because the attacker's breakpoint is 40% (decision 66).
- **The breakpoint at 30%** (balance.md, *Fortieth round*): losses in failed
  attacks come into the sources' range (attacker killed and wounded 16–22%,
  against 19–28% at 40%; round 39's "twice" was a counting error, corrected);
  the reasonable plans' median falls to **40% (3:1)** and **21.5% (2:1)**.
- **Decisions 67 and 68** (author, 2026-10-01): the attacker's breakpoint
  is 30% again, and the win targets are set for small-unit attacks (3:1
  40–55%, 2:1 20–35%). **The reference plans meet them** (balance.md,
  *Forty-third round*): median 40% (3:1) and 21.5% (2:1), at the bottom of
  each band; losses in the sources' range; the hasty attack (three scouts,
  no fire first — no one sends a lone scout, author) wins 30%, inside
  history's 15–35%. Tried and withdrawn: fire on the move, an overwatch and
  binoculars for command groups (thirty-seventh and forty-second rounds).
- **The scout question** (balance.md, *Forty-fourth round*): reworded with
  what scouts do (question set `2026-10-01.3`); Jev now sends three, Haiku
  two. **Two scouts win 18% at 3:1** (three 59%, one 24%): traced to the
  western platoon's approach, where the attack is lost piecemeal — the third
  scout wins by keeping a squad off it. The drill sends squads straight at
  the enemy by no covered route. **Done** (balance.md, *Forty-fifth round*): the
  drill now steps by covered ground and brings platoons in together; scouts
  count in order (one 28%, two 35%, three 57%); the reference plans' median
  42% (3:1) and 24% (2:1), inside the targets. The hasty attack rose to 45%
  (history 15–35%), the flank fell to 25%: open with the author. The AI
  comparison on these rules (forty-sixth round): Jev 15% / 5%, Haiku 5% /
  5% — mostly their plans (the hasty attack with bounding; the flank and
  moving up), and Haiku moves up before the enemy is found. Next: playing it
  in the browser.

**Where the game stands** (README, *Rules decisions*; balance.md,
twenty-second to thirty-third rounds; validation.md):

- **60** a defending platoon holds a squad in reserve and counterattacks a
  lost position at once, by drill (`SquadDrill.counterattack`,
  `"reserve": true` in a spec). **61** a metre climbed costs 5 m of a bound.
  **62** full cover against a shell by the sources (hole 0.03/0.13, roof
  0.02/0.005). **63** suppression: reach 30–75 m from a burst, pinned means
  heads down, roofs halve it, danger close is the caller's risk, a pinned
  defender assaulted tests its nerve (surrender or rout on a roll). **64**
  nerve lost to fire by cover (open ×1 since 66, partial ×1, hole ×0.3, roof
  ×0.15). **65** a pinned force fires to 400 m at half its chance beyond
  100 m. **66** nerve in the open ×1 (and division-level targets, 55–70% and
  30–45%). **67** an attacker's breakpoint at 30% again. **68** the targets
  for small-unit attacks — 3:1 on a prepared position **40–55%** (70–75%
  with surprise or strong suppression), 2:1 **20–35%** — judged on
  reasonable plans and on losses.
- **75% of losses by explosives is for real ground** (author): the tel meets
  it (73–77%); the flat harness gives about 51% and is not held to it.
- **Harness policies (ours, not rules):** the scripted defender registers its
  mortar targets on the dead ground in front of it; a defending command post
  stays put (it used to walk into the shelling and lose the side its fire
  control); the scripted company sends three scouts; smoke and plan fires
  for the scripted attacker exist as options and are off (they hurt).
- **Both harnesses play the game's rules by default** (decisions 51–55 on, a
  scout from each attacking platoon); `--classic` gives the old harness.
- **The standard measurement:**
  `npm run scenario-sim -- --recon 3 --watch 1 --look 4 --wait-for-contact --aim 40 --scout-from vantage --wait-in dead-ground --n 200 --target-first squads`
  — since decision 67 (the attacker's breakpoint at 30%): 3:1 **49%**, 2:1
  **27%** (58% and 38% at 40%), explosives 72–75%, the reserve
  counterattacking in about one battle in seven.

**Open, in rough order:**

1. **The balance by reference plans** (above), then **Jev** with Haiku beside it.
2. **Play the new rules in the browser as a player.** Suppression, heads
   down, danger close, the nerve test under assault and the counterattack
   have only been played by scripts. The live game plays no drill for a
   player's side, so a reserve there is the player's to commit.
3. **Flat-ground misses** (balance.md, *Thirty-third round*): platoon 3:1
   94% and company 2:1 1–10% on flat open ground; the tel meets both
   targets. Probably ground, not rules — a flat harness with some dead
   ground would say.
4. **Reserves for the other layouts** — the platoon battle, the company
   battle's platoon B, Yokneam: which squad each holds back is the author's.
5. **Fire support by odds** — asked on 2026-09-28, never answered: should an
   attacker at 3:1 bring more fire? (Doubling the scripted attacker's
   missions did not help on the tel: balance.md, *Twenty-ninth round*.)
6. **Direct-fire HE** (tanks, RPGs, rifle grenades, ATGMs) — the author's
   old agenda item 4; decisions 29–31 and 62 cover indirect fire only.
7. **Overhead cover for the higher echelons** and **ammunition**
   (backlog 12) — for when battalion battles come.

How today went, step by step, and everything superseded is in
[handoff-archive.md](handoff-archive.md), *2026-09-28 to 2026-09-30*.

## Next session: what is left of the author's agenda (2026-09-23)

The author set four items and said to take them in order. The first two
were done in the second session of 2026-09-23:

1. ✅ **The artillery balance.** He answered all five questions (decisions
   36–38): rounds for effect **6 for artillery, 12 for a mortar**; **planned
   targets, observation posts and alternate positions are set in mission
   planning** by the player; binoculars and UAVs later (backlog 4); the live
   UI calls missions. All built and driven in the browser.
2. ✅ **A minimum echelon for fire support.** Tested (balance.md, *Eleventh
   round*) and ruled: **mortars at company and above, artillery at
   battalion and above** (decision 37).

**Start with item 3, first thing** (the author's words at the end of the
session).

3. **The game's business plan.** A conversation, not code. Come with what
   the repo already says about the product direction: the roadmap's Stage 4
   (mobile and desktop app on the same engine) and backlog 16–19
   (campaigns, mission builder over real ground, mission and victory
   conditions, weather).
4. **Direct-fire HE: tanks, RPGs, rifle grenades, ATGMs.** After the
   business plan, review it the way indirect fire was reviewed:
   - What the document's tables give: `resolveDirectExplosive` and the
     `EXPLOSIVES` entries with `delivery: "directFire"`.
   - What decisions 29–31 already changed: they apply to indirect fire only,
     so a tank round or an RPG still ignores cover, posture and roofs.
   - What the sources say.
   - The harness has no vehicles yet; that is the first thing to add.

## Waiting on the author

**Start here: where the second 2026-09-23 session stopped.** Decisions
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
- **The traits' other effects**: his next session on morale.

**Morale is built (rules decision 19), and the author's next session is the
traits.** He said so on 2026-09-22: strength, intelligence, wisdom, agility,
charisma and luck are drawn for every man now, but only wisdom, luck and a
leader's intelligence and charisma do anything — through morale. What the
others do to shooting, movement, detection and the rest is the next ruling;
build nothing on them before it. Also his, and not built: **campaigns carry
the pool of will, and only rest refills it** (backlog 16), and **taking the
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

**Ordered. The first three want a word from him before anything is built;
the fourth does not.** The author's own agenda for the next session comes
first: see *Next session* at the top.

0. **The author's agenda** (*Next session*): the business plan, then
   direct-fire HE. (The artillery balance and the minimum echelon are done.)
1. **Mission and victory conditions** (backlog 18) — **ask first, and ask
   about this one first.** It sits under the whole product direction: a
   campaign needs a result to carry (16), a mission builder needs "objective"
   to mean something (17), and the debrief would finally measure a plan
   against its mission instead of a body count. Today `sideDefeated` ends a
   battle only when a side is wiped out.
2. **The traits' other rules** — the author's next session. Wait for it.
3. **The AI commander** (backlog 15). **Its first slice is built** (2026-09-30):
   Jev answers the attacking company commander's typed questions in the
   headless runner (`src/sim/jev.ts`, `jev-sim --jev`); run it first (see
   *Start here*). The rest is Stage 3 work while the repo is mid-Stage 2, and
   it brings a hosted third-party dependency with it. Note the item covers two
   jobs: the opponent in single-player, and the **simulated subordinates under
   every player** once echelons scale past company (author, 2026-09-21), where
   a platoon commander under a human's order still has to decide how to carry
   it out. The second is the larger job and arrives with backlog 3. Read the
   item before touching any of it, particularly the part about `sideView`
   versus `game.units`: that mistake would pass every test in the suite.

**Morale is built** (rules decision 19, 2026-09-22), so that item is off this
list: the author gave the shape, compared it with Total War, Company of
Heroes, XCOM, Close Combat, Combat Mission, ASL, Steel Division, Battle
Brothers and Darkest Dungeon, and took every suggestion. Both scenarios play
with it on. It was driven in the demo to a break and a rally; nobody has yet
*played* an attack under it (see balance.md).

**The scenario picker is built**, so that item is off this list. It was built
twice: once on 2026-09-21 as a `בחר קרב` dialog in the header, and again on
2026-09-22 as the opening screen, by a session that started from `main` and
never saw the first branch. The merge kept the **opening screen and its
briefs** (the author's choice): a brief is a tasking both players read before
taking a side, so it names no forces and does not give away the ground's
lesson. From the first build it kept the catalogue tests (Hebrew labels,
forces inside the window, ground covering it); its dialog, keyboard close and
ground-lesson briefs went. Adding a battle is a spec, a run of the tool, and
one line in [`scenario.ts`](../src/app/scenario.ts).

**The roadmap now carries the product direction** (2026-09-21): the browser
build is the development shell, and **Stage 4** is the mobile and desktop app
on the same engine. Backlog **16–19** are the four things the author described
that the repo did not have — campaigns, a mission builder over real ground and
mission parameters, mission and victory conditions, and weather.

**The live log is filtered by side** (rules decision 17, 2026-09-16).
`LogEntry` carries `readers`, `pushLog` takes a required audience, and
`LogPanel` renders only what the side at the screen may read.

## Traps that cost real time

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
