# Handoff — where the project stands

**Current as of 2026-09-30, after rules decision 60 (branch `claude/daily-standup-b2svcu`): a defending platoon holds a squad in reserve and counterattacks a lost position by drill — built, and inert on the tel, because no attack there ever closes (see *Start the next session here*). Before that, decisions 51–59 (PR #10): neither side knows exactly where the other is — sightings carry location error, and the test players plan fires on an estimate — and the attacker can send reconnaissance first. Before that, decisions 40–50 (PR #9): a turn is 60 s; blast, the tank gun and rates of fire are set from published data; explosives cause 75% of losses where fire support is used; sides give up at the historical breakpoints (30% attacking, 50% defending); prepared positions are dug in with overhead cover; digging in takes minutes (30 to a prone shelter, 90 to a foxhole). The author's design principles are recorded in the README and measured ([validation.md](validation.md), *The design principles, measured*). Before that: decisions 36–39 (2026-09-23); the business plan (2026-09-24): [business-plan.md](business-plan.md).** This is the working note for whoever
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
npm run check       lint + typecheck clean, 763 tests, 43 files
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

## Start here: the validation pass (2026-09-28)

The author asked how valid the numbers are, and ruled (decisions 40–41):
**a turn is 60 s**, and **the tables follow the research**. Built:
`data/lethality.ts` derives each explosive's blast bands from its published
lethal area, the tank gun hits to 2 km, and `GameOptions.lethality` keeps the
document's tables a per-game option (a recording from before replays on them).
`npm run validate` measures the result. Everything is on
[validation.md](validation.md), with sources.

**Rates of fire and the 75% calibration** followed the same day (decisions
42–43). A weapon's rate is a range, drawn each turn: the lowest figure
(tank 1, mortar 3 a tube) is the likeliest, the highest published one the
outlier, and a crew tires over 10 turns of firing. To bring explosives to 75%
of losses, on the research figures small arms hit a third as often and a
mortar mission fires 24 bombs for effect. With a mortar section on call all
battle (`--fires calibrated --defender-fires calibrated`) the company attacks
come out at 82% and 77%, and the 2:1 attacker wins 63%.

**Then the breakpoints and grenadiers** (decision 44). On the research
figures a side gives up at 30% of its men down, broken or fled when
attacking, 60% when defending (`GameOptions.attackers`, set in every spec):
attackers now quit at a median 16–25% casualties, defenders at 42–50%, and
the calibrated 2:1 attack still wins 61%. The drill fires one 40 mm launcher
per four men inside 100 m; platoon battles are 22–36% explosives, company
battles with mortars 78–83%.

**Then a playtest** of all three battles through the UI (a scripted player
on both sides, the recordings read back as umpire) found two things, fixed
in decision 45: a single squad's rout ended an attack at 12% casualties,
because a routed force counted whole — on the research figures it now
counts its men down or broken — and a player's squads had no grenadiers;
they fire them now, by the drill's rule. The demo now goes to turn 7 and
ends at 33% really lost; the company battle with mortars called ends on
turn 8, 61% of its casualties by explosives.

**Then hand grenades** (decision 46): every man going in throws his, up to
the two he carries, each a blast of the M67's lethal area; a grenade wounds
its own side 1.5% of the time (decision 47), not the document's 5%. Platoon
battles are now 30–40% explosives; the calibrated company battles did not
move.

**Then a smarter attacker and a 3:1 scenario** (`telAzekaAssault`: a
company against a platoon, 12 missions a side; `telAzekaAssault2`, two
platoons, for 2:1). The scripted player (`tools/smart-attacker.mjs`) bounds
by halves behind a fire plan and lays smoke; with its position-reading bug
fixed it wins the 3:1 attack 7 of 8 and the 2:1 attack 3 of 8
(validation.md, *The design principles, measured*). `?seed=N` plays a
scenario on other dice.

**Then decision 48**: prepared positions start in full (overhead) cover,
and on the research figures a squad the attrition rule neutralised counts
by its casualties. The calibrated 3:1 attack wins 87%, 75% by explosives;
the 2:1 wins 2% (was 56%) — mostly the overhead cover. A sweep of mortar
missions × rounds found that more than about 8 missions a side are never
fired, and that rounds a mission matter more (validation.md).

**Then decisions 49–50**: a defender gives up at 50%, and on the research
figures digging takes minutes — partial cover after 30, full after 90 (FM
5-15, 1944), never overhead cover. A 2:1 company attack without mortars
wins 59% against a hasty defence and 8% against a prepared one.

**The author's design principles** (README, 2026-09-28), which every
balance change should be measured against: a prepared position gives the
defender its superiority and makes an attack need 3:1; a meeting engagement
has no defender's bonus, so numbers win (measured: 72–88% at ~2:1, 80–100% at
3:1); fortifying during battle belongs to the higher echelons, whose battles
last hours; the scenarios are test beds. Measured with the smart attacker:
3:1 on a prepared platoon wins 7 of 8, 2:1 wins 3 of 8 (2 draws).

**Then decisions 51–52 (2026-09-28/29)**, from the author's question
"in an attack neither side knows exactly where the other is — did you take
that into account?" Only in the engine: the harness and the smart attacker
planned fires on the defence's true centre. Now a sighting reports an
observer's estimate (`GameOptions.locationError`, on in every scenario), and
the test players plan on an estimate (`--planning-error`, `PLANNING_ERROR`).
The calibrated 3:1 company attack falls from 95% to 20%; the smart attacker
from 8 of 8 to 2 of 8. Reconnaissance (decision 52: `--recon 1` with
`--fires calibrated-wait`, `RECON=1`) brings the harness's 3:1 back to 59%
when the defender opens fire at 400 m — and does nothing against a defender
with fire discipline, because a still force is found only inside 20 m.
In the browser the smart attacker's scout did not pay (1 of 8 at 3:1, 2 of
8 without it): the reports did not make the mortars hurt the dug-in defence
more, and the scout's losses counted toward the breakpoint. Why the harness
and the browser differ is the next thing to trace.
balance.md, *Fourteenth* and *Fifteenth round*.

**Start the next session here** — open, in rough order:
0. **Waiting on the author (2026-09-30, end of day): mortars against men
   dug in** (validation.md, *Mortars against men dug in*). The sources
   make the game's mortar several times too lethal against holes and
   overhead cover: in the tel's 3:1 the attacker's mortars take a man of a
   dug-in platoon for every 29 bombs, where the OPFOR norm for 30% of a
   *hasty* position is 300 bombs a hectare, and doctrine gives overhead
   cover "few, if any" casualties. Proposed factors (`SHELL_VS_MEN`):
   impact open hole 0.03, roof 0.02; air burst open hole 0.13, roof 0.005.
   A scratch trial: 3:1 47%, 2:1 18% (were 76% and 59%) — the design
   principle back — but no attack closes still: the attacker now breaks in
   the open under the defender's mortars. What the sources say decides it,
   suppression the assault arrives under, is not modelled; that is the
   structural question behind both this and the reserve.
0. **Where the day ended (2026-09-30): the defender's reserve.** Two
   rulings from the author. **Which target the company's guns take is a
   command decision** — Jev's, or the player's; there is to be no scripted
   rule for it. `jev-sim` already asks it. The scripted company in the
   headless runner still has to choose to measure balance; we proposed it
   plays a competent commander (squads first, 3:1 56–62%) with the other
   orders kept as the range a choice spans (23–62%) — not confirmed.
   Then, asked whether the defender ever counterattacked or used a reserve
   (it never had either): **"a squad in reserve; platoon counterattacks by
   drill"** — rules decision 60, built: `SquadDrill.counterattack`,
   `DrillTask.reserves`, `"reserve": true` in a spec, `Scenario.reserves`,
   RED-A-1 pulled back on the three Tel Azeka layouts that share platoon A,
   `--no-counterattack` on `scenario-sim`. What it found (balance.md,
   *Twenty-second round*):
   - **No attack on the tel ever closes.** Over 40 traced battles no
     attacker came within 148 m of a forward position; every one ended at
     a breakpoint after fire. So the counterattack never goes in, and the
     change in the tables (3:1 up 6–11 points) is the layout alone.
   - **Without mortars it goes in half the time and helps the attacker**
     (3:1 57% → 72%), because it goes as the platoon reaches its breakpoint.
   **Settled the same day:** it counterattacks **at once, before the
   attacker consolidates** — no strength or odds check, no waiting for
   fire — which is what was built.
   **Not done:** the reserve in the balance harness's flat-ground layouts;
   the platoon battle, the company battle's platoon B and Yokneam, whose
   layouts each teach a lesson and have no reserve — which squad each
   holds back is a layout question for the author. The first thing worth
   doing is item 2 below: a counterattack only matters in an attack that
   reaches the position — and the pace research found fire, not pace, is
   what stops it.
0. **Where the day ended (2026-09-29): the mortar thread, and what is open.**
   The day began with the author's question whether pre-planned fires
   account for neither side knowing where the other is. They did not: with
   fires planned from an estimate (decision 51) the calibrated 3:1 fell from
   95% to about 20%. Recon (decisions 52–54) brings the guns to a median 22 m
   off. On the tel, headless, the scripted 3:1 wins 41–59% by target order
   (squads first best, command first worst, 25%); 2:1 30–39%; on the truth
   68–76%. So 3:1 sits well under the author's 85% ceiling (decision
   rulings), and a company using platoon control (decision 59) does better
   than the script. **Open, in the order proposed to the author:**
   1. **Waiting on the author:** which target the company's guns take
      first. Squads first measures best; decision 55 found a dug-in
      defender's command group is low value.
   2. Mortar lethality against men dug in, checked against the research
      figures (the author asked whether the research has numbers; not done).
   3. Why the tel stays low with good aim: no spot on the attacker's side
      sees all three of RED's squads, so some fire goes on stale marks.
   4. Another agent round as Jev on the new questions (decisions 58–59 and
      the item 1 fixes), each agent in its own folder.
0. **Then (author: "do 1 and 2, keep marks on last seen, mark them with
   broken lines; mission will have time limit in briefing"):** decision 57
   (a mark stays where last seen, drawn with a dashed frame) and 58 (each
   mission's deadline, 45 turns on the tel, in the brief and the turn line;
   costs the scripted 3:1 about 5 points, balance.md *Twentieth round*),
   both driven in the browser. Item 1, the agents' bugs in the questions:
   a scout at its point seeing nothing is now asked about (with a decider
   it no longer walks on by itself), "on" there sends it toward the
   objective, the scout questions offer observation points on marks found
   away from the plan, jev-sim counts HE and smoke separately and exits 2
   with one line on an answer that is not an option, and the go question
   says what was found near the objective instead of "not found yet".
   Item 2 (decision 59): the commander tasks each platoon at "go"
   (assault, base of fire, reserve), can bound by platoon, hold the
   assault short until it lifts the fires, and is asked when a platoon
   takes casualties, with what it is under fire from. A fixed policy using
   it wins the 3:1 16 of 30 instead of 12 (balance.md, *Twenty-first
   round*). **Next: another agent round on the new questions, in separate
   folders.**
0. **Then (author: "can you spin up an agent that takes Jev's role", then
   "destroying the command group should have effect; do 1-3"):**
   `npm run jev-sim` puts the company commander's decisions as typed
   questions; two Claude agents played them (3:1: 3 of 4; 2:1: 0 of 4) and
   found a scout bug, fixed. Rules decision 55 (command succession), more
   information and control in the questions. The scripted commander now
   wins the tel's 3:1 59% firing on squads first (balance.md, *Nineteenth
   round*). A second agent run on the fixed questions is recorded there.
0. **Then (author: "do both"):** traced why the tel stays low, and moved the
   company choices out of `SquadDrill` into `app/company.ts`
   (`CompanyOrders`, `ScriptedCompany`). No spot in reach sees all three
   of RED's squads, so the commander now sends two scouts to two
   observation points. On the tel that gives 3:1 28–37% and 2:1 23–25%. The
   guns aim well (median 22 m) but half their missions go at command groups
   in the open. **Waiting on the author:** which target the company's guns
   take when several are found (balance.md, *Why the tel stays low*).
0. **Built 2026-09-29 (author: "go ahead with the headless runner and
   dead-ground finder"):** `npm run scenario-sim` plays the scenarios on
   their real ground headless with a scripted company commander; dead
   ground and a vantage point for it are in `src/app/deadGround.ts`. It
   agrees with the browser: on the tel, recon lifts 3:1 only from about 20%
   to 28% (balance.md, *Eighteenth round*); flat ground gave 82%. Tracing
   why is the next step. Moving the company choices out of `SquadDrill`
   (item a below) is still to do.
0. **Proposed to the author (2026-09-29):** only squad and platoon
   are scripted in the real game; company and up is Jev plus an LLM call.
   So: (a) move the company-level choices (recon, the look, fires waiting)
   out of `SquadDrill` into a company plan that a scripted commander plays
   in the harness and Jev will play in the game; (b) a dead-ground finder
   (where a force is out of sight of known and likely enemy observers),
   used by both; (c) a headless runner that plays the scripted commander on
   the scenarios' real ground, so balance is measured on a hill with
   observation posts, not only on flat ground. The browser stays for
   end-to-end checks.
0. **Decision 54 (2026-09-29), built and measured:** scouts carry
   binoculars and a longer look sharpens a report. With a 4-turn look the
   harness's 3:1 company attack on realistic intelligence wins 86–95%
   (balance.md, *Seventeenth round*). Browser results in validation.md.
   What is left for the author: whether 3:1 at 86–95% and 2:1 at 1–21% is
   the balance wanted, and the 600 m / 1,000 m / halving, all ours.
0. **Waiting on the author (decision 53, 2026-09-29):** a force in
   position now finds a still enemy out to 300 m (600 m from an OP), and the
   scouts can bound and observe, but it moves nothing: the defender sees
   the halted scout as easily and shells it. An experiment giving a halted
   scout an OP's 600 m (binoculars) takes the Western-drill 3:1 attack from
   1% to 42%. Should scouts carry binoculars (backlog 4), and should a
   longer look sharpen the report? balance.md, *Sixteenth round*.
0. **Waiting on the author (decisions 51–52):** what should let an attacker
   find a still, dug-in defender before the assault — a longer detection
   band for a force that stops and watches, binoculars (backlog 4), UAVs,
   or none (recon only by drawing fire)? And whether 3:1 should still win
   against a prepared platoon once intelligence is realistic.
1. **Fire support by odds.** Both sides of the test scenarios have the same
   mortar section, and the mortars decide the battle before the infantry
   closes (8–10 minutes; infantry advances 14–25 m a minute uphill under
   fire). So the odds act through what a side can lose, not through its
   fire. An attacker at 3:1 usually brings more fire than the defender:
   asked the author whether the real scenarios should; no answer yet.
2. **Infantry pace under fire — researched 2026-09-30, nothing changed**
   (validation.md, *Infantry pace under fire*). The sources put an advance
   under fire at 15–30 m a minute net (rush and drop); the tel's attack
   already nets about 20. Pace is not why it never closes: fire decides
   the battle 6–9 minutes after the company goes, where 350 m takes 15–20.
   **The climb cost is 5 m a metre since decision 61** (author, the same
   day; balance.md, *Twenty-third round*): the tel's 3:1 wins 67–77%,
   the 2:1 41–58% — the 2:1 now sits badly with the design principle
   that a prepared position needs 3:1. Still no attack closes. Left as
   it is: the drill's pace in contact on flat ground (about 50 m a minute
   when nobody is suppressed). **Next: how long a dug-in platoon holds under a
   mortar section**, against the sources — the morning's item 2.
3. **The plain drill against the smart attacker.** The harness's drill wins
   the 3:1 attack 95% and the 2:1 8%; the smart attacker 7/8 and 3/8. The
   drill is what balance numbers are measured with; how far it is from a
   good player is itself a finding.
4. **Overhead cover for the higher echelons** (decision 50 leaves it out: it
   takes hours). When battalion battles come (backlog 3), it needs a step on
   the digging clock (6–8 h for a two-soldier position, 2–4 more for
   overhead cover — secondary sources; FM 5-103's table is an image).
5. **Ammunition** (backlog 12): nothing runs out by the bomb; the mission
   allotment is the only limit, and past ~8 missions a side they go unfired.

Not yet played by a person on the new figures; the scripted players are the
only ones who have.

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
3. **The AI commander** (backlog 15). Unblocked — it invents no rule, so it
   needs no ruling — but it is Stage 3 work while the repo is mid-Stage 2, and
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
