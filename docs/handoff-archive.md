# Handoff archive — what past sessions built

[docs/handoff.md](handoff.md) is the live note and holds **current state only**.
This file is where its history goes, newest first, so the working note stays
short without losing the reasoning behind decisions someone may want to reopen.

Durable facts do not live here either: rules go to the README's **Rules
decisions**, conventions and traps go to [AGENTS.md](../AGENTS.md), and chosen
numbers go to [balance.md](balance.md). What is left — "this is what happened
and why" — is what belongs below.

---

## 2026-10-02 — the author's rulings, and what other games use traits for

PR #14. The author answered every open question with the reasons below. The rulings
themselves are in the README (decisions 69–74) and in handoff.md's
*Rulings of 2026-10-02*. What led to 71–74 was a survey of what other
tactical and role-playing games use a soldier's traits for, read with the
cost at scale in mind.

**The survey** (2026-10-02):

| Use | Games | Outcome |
|---|---|---|
| Accuracy | XCOM (Aim, +1% a point), Jagged Alliance 2 (marksmanship, dexterity), Combat Mission and Close Combat (experience) | Intelligence (69) |
| Spotting | Combat Mission, Close Combat (experience spots sooner), Fallout and Phoenix Point (Perception) | Wisdom (69) |
| Movement | XCOM (Mobility), Phoenix Point (Speed), Fallout and Jagged Alliance 2 (agility gives action points) | Agility, strength under load (69) |
| Morale and panic | XCOM (Will), Battle Brothers (Resolve), Combat Mission | Already decision 19 |
| A hit that wounds instead of kills | XCOM (Will: critically wounded rather than killed) | Luck (69) |
| Fatigue | Battle Brothers (every action costs fatigue, recovered each turn), Close Combat (tired men shoot worse, obey less), Combat Mission (fitness: how fast men tire and recover) | Strength (71) |
| Who acts first | Battle Brothers (Initiative), Jagged Alliance 2 (interrupts), Fallout (Sequence) | Agility (72) |
| Load and throwing | Phoenix Point (Strength: weight, throw range), Jagged Alliance 2 | Load, through the MOS's kit (73); throw range not chosen |
| Learning | Jagged Alliance 2 (wisdom sets how fast skills grow), Close Combat | Wisdom (74) |
| Skills apart from traits | Jagged Alliance 2 (medical, explosives, mechanical), XCOM (hacking) | Widened by the author to an MOS for every soldier, with kit and a skill level (73) |
| Named quirks | Battle Brothers (Fearless, Iron Lungs, Eagle Eyes, Night Blind) | Yes (74) |
| Relationships | Jagged Alliance 2, Battle Brothers | Within a squad only, for cost (74) |

**The cost, measured the same day:** ten company battles headless in 1.5 s.
The step that grows fastest is the line of sight between forces, which
samples the ground and grows with the square of the forces. Combat Mission
gives every soldier his own view ("relative spotting"). Copying it would
multiply sight lines by the squad's size, about 50 to 100 times at battalion. So the
rulings keep sight lines between forces, read traits as modifiers, and roll
no new die per man where the force rolls once. `src/engine/scaling.test.ts`
now holds the first of these.

**The other rulings:**
- **Wait for doctrine:** the hasty attack's 45%, fire on the move, reserves
  and victory conditions. The answers should come from doctrine, not from us.
- **Rewrite the OPORD from doctrine:** it is ours.
- **Fire support per scenario:** the specs already set it.
- **Doctrine engine public:** the author corrected the 2026-10-01 note that it
  was local, private work. The commercial edition is built on open-source
  manuals, and the work waits only for the author's collection.

Sources: [XCOM 2 soldier](https://xcom.fandom.com/wiki/Soldier_(XCOM_2)),
[XCOM 2 stats](https://xcom2.wiki.fextralife.com/Stats),
[Phoenix Point stats](https://phoenixpoint.wiki.fextralife.com/Stats),
[Combat Mission: experience, motivation and leadership](https://community.battlefront.com/topic/137563-experience-motivation-and-leadership-kg-peiper/),
[soft factors, morale and fatigue](https://www.thefewgoodmen.com/thefgmforum/goto/post?id=239477),
[why CMx2 infantry combat is different](https://community.battlefront.com/topic/93490-why-infantry-combat-in-cmx2-is-so-different/),
[Close Combat (series)](https://en.wikipedia.org/wiki/Close_Combat_(series)),
[Close Combat manual](https://manualmachine.com/microsoft/closecombat/660292-user-manual/),
[Jagged Alliance 2](https://en.wikipedia.org/wiki/Jagged_Alliance_2),
[JA2 official secrets](https://www.fadden.com/gaming/ja2/ja2-official-secrets.txt),
[Battle Brothers dev blog #111](https://www.gamebanshee.com/k4hc8),
[Battle Brothers tips](https://battlebrothers.fandom.com/wiki/Loading_Screen_Tips),
[Fallout SPECIAL](https://geck.uesp.net/wiki/SPECIAL).

---

## 2026-09-30 to 2026-10-01 — Jev and Claude as commander, then the balance by reference plans

Moved here from handoff.md at the end of 2026-10-01 (PR #12 merged). The
rounds are balance.md's thirty-fourth to forty-seventh; the decisions are the
README's 67 and 68. In one line: the AI comparison showed that every
commander but the scripted one lost, which led back to the balance itself —
judged now by real-life outcomes on reasonable plans — and through it to
drill fixes (bounding, covered routes, closing together, the assault
position, the flank), the breakpoint back at 30%, small-unit targets, and the
roadmap's doctrine engine (backlog 21) and three-part AI commander (22).

### Start here, as it stood at the end of 2026-10-01 (round by round)

**Everything is merged to `main`** (PR #12, 2026-10-01: balance rounds
34–47, rules decisions 67–68). The reference plans meet the author's
small-unit targets on the tel (balance.md, *Forty-fifth round*).

**Jev and three Claude models have played** (2026-09-30 and 2026-10-01): `TYPESAFE_API_KEY` is set
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


### Next session: what is left of the author's agenda (2026-09-23)

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


### What I would pick up next, as it stood

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


---

## 2026-09-28 to 2026-09-30 — the validation pass, unknown positions, and the day that fixed the balance

Moved here from handoff.md at the end of 2026-09-30, as it stood. Its
superseded "Waiting on the author" items were answered in rules decisions
51–66 (README).

### Start here: the validation pass (2026-09-28)

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
0. **Where 2026-09-30 ended: the balance inside the author's targets.**
   The day ran: the reserve and counterattack (60), pace researched, climb
   8 → 5 (61), the sources' cover against shells (62), suppression in five
   parts (63, [suppression-design.md](suppression-design.md)), nerve by
   cover (64), a pinned force firing to 400 m at a penalty (65), the
   scripted defender's fire plan and a defending command post that stays
   put (harness), a smarter scripted attacker (smoke and plan fires,
   options, off: they did not help), and **decision 66**: the targets
   **55–70% at 3:1 and 30–45% at 2:1** against a prepared position (from
   research), nerve in the open ×1, an attacker's breakpoint at 40%. With
   the scripted company sending three scouts, **3:1 wins 58% and 2:1 38%**
   (balance.md, *Thirty-first round*, which also gives the standard
   `scenario-sim` command); the reserve counterattacks in about one battle
   in seven. The flat-ground harness was rerun on today's rules
   (balance.md, *Thirty-second round*): the company 3:1 with the full rules
   wins 58%, inside the target, but the harness's defaults have fallen
   behind the game (decisions 51–55 off, recon that does not scale with the
   echelon), so its squad and platoon cells no longer judge anything; its
   `TARGETS` carry decision 66's bands. Then the harness was brought up to
   the game (*Thirty-third round*): decisions 51–55 on by default, an eye's
   planning error, a scout from each attacking platoon (`--classic` for the
   old harness). Squad 3:1 69%, company 3:1 59% (69% with calibrated
   fire); the sweep meets 7–8 of 12. Still off target on flat ground:
   platoon 3:1 94%, company 2:1 1–10%. `npm run validate` now plays the
   game's rules too (validation.md, *The breakpoints and explosives' share,
   on the game's rules*): attackers give up at 16–28% casualties, defenders
   at 25–31%, battles take twice as long, and **explosives' share with
   calibrated fire is 51% on flat ground** where decision 43 set 75% — the
   author ruled that **75% is for real ground**, which the tel meets
   (73–77%). **Jev:** the author has a TypeSafe API key; the SDK is
   `@typesafe-ai/sdk` (0.6.0, reads `TYPESAFE_API_KEY`, talks to
   `api.typesafe.ai`), and this environment's network denied that host on
   2026-09-30. **The Jev decider is built** (`src/sim/jev.ts`, `npm run
   jev-sim -- --jev --seed 1000 --n 10`), tested against a stand-in; once the
   key is set as an environment variable and the host allowed, run it and
   measure Jev's company against the scripted one (3:1 58%, balance.md
   *Thirty-first round*).
   **Next, in rough order:**
   drive the new
   rules in the browser as a player (suppression, heads down, danger close
   and a counterattack have only been played by scripts); the layouts
   without a reserve (the platoon battle, the company battle's platoon B,
   Yokneam) are the author's to lay out.
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


---

## 2026-09-22/23 — morale, the balance harness, and five rounds of rulings

Morale was built (decision 19, merged as PR #2). Then the author asked for
the rules to be measured: 100 battles each at squad, platoon and company.
Each round ruled on what the last one found. The figures are on
[balance.md](balance.md). What the live note said at each step:

**Fourth round, 2026-09-23: the squad drill.** The harness's squads now fight
by a `SquadDrill` ([`app/drill.ts`](../src/app/drill.ts)) — data, carried out
by one executor that sees only its side's view. That is the future default
for simulated subordinates (backlog 15), and the thing the TTP editor
(backlog 20, added by the author today) will edit. The Western drill meets
**11 of 12** balance targets, against the plain script's 9; the platoon gap
is closed. Open: the drill's numbers (all ours), the one remaining miss (a
winning platoon attacker loses 8%), and the assault reply's rate, which
measures as irrelevant under every drill.

**Third round, 2026-09-23.** ירי מקביל is the **coaxial gun** (decision 25):
infantry no longer fire that table, and vehicles now can. The **wound-severity
roll** is on trial (`woundSeverity`), and at a 4/4/2 split it is the first
change that moves the balance — 9 of 12 targets, squad fights all four. It
leaves the platoon fights lopsided. **Both since adopted**: 4/4/2 is decision 26, and the coaxial gun's one roll a
turn is confirmed in decision 25. Still open: what closes the platoon gap. He
asked whether to simulate every echelon above the squad as its soldiers
fighting; the scaling measurements are on balance.md, *How the engine scales*.

**Second round, 2026-09-23.** Rulings 2c and 3b are made (decisions 22 and
23), and so is a steadier prepared defender (24). Ruling 1 — the defender
returns fire in an assault — is ruled in principle, with the rate on trial.
Swept: the rate makes no difference, because the defender breaks before any
assault. The harness has now shown that the attack balance is a **square-law**
effect. A prepared defender needs roughly 4–9 times an attacker's per-man
effectiveness to meet the planning figures, and has about 1.5–2 times. Put to
him: the casualty model (a hit-severity roll), and what **ירי מקביל** means —
the engine reads it as a sustained machine gun, and the harness has never fired
a gun on that table. Both are on balance.md, *Second round*.

**Rulings 4 and 5 are made** (decisions 20 and 21, 2026-09-23). **Rulings
1–3 were put on trial** as switches in `engine/data/variants.ts` and swept
(`npm run balance -- --sweep`). **None of the eight combinations fixes the
attack** (balance.md, *Rulings 1–3 on trial*), because the problem is elsewhere:
the defender breaks before any assault, and the document's 1d4-of-8 casualty
model spreads a small force's hits too thin to matter. He picks 1–3 on meaning;
the variants file goes once he has.

**The five questions as first raised** (2026-09-22,
[balance.md](balance.md), *The balance harness*). 2,400 headless battles between
NATO-organised forces show an attack is close to a switch — a dug-in defender
holds at 1:1, falls at 2:1 — and a winning attacker at 3–4:1 loses 0–8% of his
men. Three rules do it, and all three are his to rule on, not ours to tune:
**an assault is one-sided** (the defender never fires back), **ordinary fire
ignores the document's movement modifier** (+30% walker / −20% runner — only
covering fire applies it), and **a defender loses full cover the moment it
fires**. Two more: the **initiative tie-break** always favours RED (55% of
turns first; worth under 5 points of win rate, but a bias with no reason), and
**`sideDefeated` counts command groups**, so without morale a battle whose
fighting forces are all gone never ends. Rerun `npm run balance` after any
answer changes a rule.

**Fifth round, 2026-09-23.** One wound rule for bullets and explosives: A
(a severity shift by die size), A0 (a flat d10) and B (the document's dice,
out at 5) were put on trial. A0 was adopted as decision 27.

---

## 2026-09-21 — the second battle becomes reachable, and the roadmap grows a product

Ended at `5bef6a8`. 428 tests in 22 files, lint and typecheck clean (404 at the
start of the day). No rules decisions: everything here is app, tooling or
writing things down.

### The scenario picker — the item 2026-09-16 called the smallest on the list

`בחר קרב` in the header lists every battle by title and by one line about its
ground. Tel Azeka had been generated, tested and unreachable in the hotseat for
five days; it is playable now.

**The line comes from the spec, not from the UI.** `make-scenario.py` gained a
required `brief` key and refuses an empty one, and each generated module now
exports its own catalogue entry — id, title, brief, builder — so the label the
player picks by and the title the header draws are the same generated string.
`src/app/scenario.ts` became the list of those entries, which makes adding a
battle a spec, a run of the tool, and one hand-written line. The generator was
checked against both committed modules first: byte-for-byte identical but the
`Written` date.

**Switching remounts `App` under the scenario's id** rather than resetting
state piece by piece. The engine is a mutable instance in a ref with a turn's
worth of React state beside it; a reset would need extending every time a piece
of state was added, and the piece someone forgot would carry the last battle's
state into the next one.

One bug fixed on the way in: the header's controls reached the far end via
`margin-inline-start: auto` on the first button, which works only while there
is exactly one — a second button carrying it splits the free space instead.

### What the licence was missing, and the check that now holds it

The third-party carve-out named the two Ramat Menashe map modules and not the
two Tel Azeka ones, which had shipped with the second scenario on 2026-09-16.
Same data, same terms — OpenStreetMap under ODbL, AWS Terrain Tiles from SRTM
— so the clause is grouped by source now and names all four.

**Nothing in the build noticed for five days.** `src/invariants.test.ts` fails
when a module under `src/app/maps/` is not named in `LICENSE`, and pins both
attributions as text, since losing one is a breach rather than a typo. Checked
by dropping a file from the clause and watching it go red — a test that cannot
fail is not a check.

### The roadmap gained a product, and four gaps under it

The author's direction: the browser is the development stage, the destination
is a full mobile and desktop app, with pre-built scenarios and campaigns on one
side and generation from real-world terrain plus mission parameters on the
other. **Stage 4** and backlog **16–19** are that, written down.

The finding worth keeping: **three of the four mission parameters named do not
exist as rules.** Starting positions are scenario layout and already work.
Objectives and mission type do not exist — `sideDefeated` ends a battle only
when a side is wiped out, and the document names no משימה, no objective and no
victory condition. Weather does not exist either; the only visibility rule in
the game is smoke. So the generator is blocked less on tooling than on rules,
and the two rulings that unblock it are on the live handoff.

The tooling half, by contrast, is nearly built — and the engine can already
*score* a candidate layout, which is the part that surprised: `hasLineOfSight`
over real relief, `boundCost` for a climb, `coverAgainst` for what a force is
behind. "Give the attacker one covered approach and make it the slow one" is a
search scored by the rules themselves rather than by invented heuristics, and
drawn from `Rng` it is a seed plus a template.

### An AI player, and why a System One model fits the seam

Backlog 15 (decided 2026-09-21): a model at the action seam, emitting the same
actions a player clicks, with nothing about the mechanics moving. It has **two
jobs**, and the author named the second the same day: the opponent in
single-player, and the **simulated subordinates under every player** once
echelons scale above company — a platoon commander under a human's order still
has to decide how to carry it out. That is the larger job, it arrives with
echelon scaling (backlog 3), and it is what turns the never-call-during-a-replay
rule from a nicety into the thing protecting every recording rather than only
single-player ones. TypeSafe's **Jev** is the intended vehicle — typed questions in, typed
decisions with a confidence out, no string generation — which answers three of
backlog 13's five open questions by construction: it can only choose among
alternatives it is handed, it is fast enough that every subordinate reasoning
is not a budget question, and its answer is already typed, so a `choice` over
objectives *is* a `setStandingOrder`.

The item is mostly limits, written before there is code to get them wrong in:
no rule consults the model; it is never called during a replay, a
`verifyRecording` or a what-if (it has no seed and no temperature); it is fed
`sideView(game, side)` and **never** `game.units`; it lives in the app layer;
it is a `GameOptions` toggle. The open one that matters: Jev returns no
explanation, and this is a teaching instrument.

### A performance claim that did not survive being measured

`Token` rendered a NATO symbol on every render of every token, uncached, while
`Relief.tsx` had memoised the terrain layer long ago. Cached now, keyed on the
four values the render reads — and emphatically not on the unit, because the
engine mutates a force in place and the same reference is the squad before and
after it loses three men. A `React.memo` on `Token` would draw 8/8 over the
casualties; `symbols.test.ts` pins that case.

**But the reason it was taken on was wrong.** Two notes said milsymbol
re-rendering was why long click scripts time out. Measured: 0.037 ms a call
before, 0.0006 ms after — about 60× on the hit, and under a millisecond per
re-render either way at the 5–8 tokens a platoon battle draws. It earns its
place at echelon scaling's token counts and on a phone, not on a desktop
platoon, and the real cause of that ceiling is still unmeasured. Both figures
are on the live handoff so nobody pays for them twice.

The picker also closes on Escape now, with focus moving into the card and back
to the button that opened it. The guard on that effect is the part worth
reading: without it, it runs on mount too, where `open` is false, and the
header button took focus off the page as the game loaded.

### Also this session

`driving-the-game.md` gained how to get a browser at all in a sandboxed
session: Playwright's library needs `createRequire` because ESM ignores
`NODE_PATH`, Chromium sits under a *versioned* directory rather than the one
`PLAYWRIGHT_BROWSERS_PATH` implies, `playwright install` should not be run, and
the dev server's own modules import inside `page.evaluate` — which is how the
figures above were taken.

---

## 2026-08-16 — sectors of observation, and the last five rules decisions

Ended at `d61a646`. 281 tests, typecheck clean. The session closed rules
decisions **7, 8, 10, 13 and 14**, emptying the README's ⚠️ list for the first
time, and shipped one new feature.

### Sectors of observation (decision 14)

A force can be told which way to look: an arc with a bearing and a width, worth
a bonus inside it and −20% outside. The bearing is absolute, so displacing a
force does not re-aim it. It raises the concealed-charge floor the way scouting
does but never lowers it, it goes into the recording as a decision, and the
per-side debrief shows it to its owner only (the umpire sees both). The hotseat
lays one by picking a width and clicking the map, and draws the wedge out to
300 m.

**The width is the bet, and getting there took two goes.** The first cut paid a
flat +15% at any width, which made the control a trap — widening only ever
converted a penalised direction into a bonused one, so 180° strictly dominated
60° and there was no decision to take. The author caught it by asking what the
tradeoff was. The fix: attention is a fixed budget spread over the arc, so the
bonus is `13.5 ÷ width` (+23% / +15% / +8% at 60° / 90° / 180°).

> **Worth remembering as a shape, not just a number:** a modifier that applies
> to a region has to be checked against that region's *size*, or the control
> that sets the size is decoration.

Driven in the browser before it was called done: wedge drawn at each width, log
line, posture line, the sector surviving a move, and release back to all-round.

### Decision 7 — cover is proportional

Settled on the **grammar**, not the arithmetic. The document writes the cover
modifier with the partitive מ־ and the definite article (`-50% מסיכויי הפגיעה`)
and the movement-table modifier without either (`+30% סיכויי פגיעה`) — the same
kind of quantity, in the same document, phrased two ways on purpose. That also
confirmed the movement modifiers as additive, which had been sitting separately
in the "reasonable assumption" list. No code changed; the reading was already
the implemented one.

> **Worth reusing:** when the document is ambiguous, look for the *same quantity
> phrased twice*. This had been open since 2026-08-12 on an arithmetic argument
> alone, and a two-line grep across two tables closed it.

### Decision 8 — indirect fire is scoped, not provisional

It had been recorded as a stopgap ("the game has no battery piece; a battery
unit would replace it"), which invited someone to build one as a missing
feature. It is not missing: the playable slice is the platoon-leader view, and a
platoon commander *calls for* fire rather than owning a battery. Off-map is
correct at this echelon and stops being correct at battalion. The battery
therefore arrives with **echelon scaling** (backlog 3) and is recorded on both
ends — the decision says when, the backlog item says what it inherits.

### Decision 10 — the search has to cover the ground the trigger does

Settling it found a real bug. Charges were triggered along the **whole path**
walked while the search for them was rolled from the **endpoint alone** — two
halves of one rule measured off different geometry. Measured: a charge 5 m off
the route at the midpoint of a 50 m walk went off **200/200 seeds and was found
0/200**, so the document's 30%-walking / 5%-running split was doing nothing on a
mined approach — the one decision it exists to price.

The ruling: a walking force searches the ground it crossed; a runner gets no
look on the way and its 5% applies only where it halts. Trigger radius stays
10 m, deliberately below the 20 m search band.

The **same hole existed for a hidden enemy** (0/400 beside the midpoint against
~26% beside the halt), and the same ruling closed it — the document names
charges, shafts and hidden enemy in one 20 m clause. Only the *range* is swept;
chance and line of sight are still judged from where the bound finished. Checked
that this does not undo the ambush: the defender observes continuously at 300 m
and sees the attacker several bounds out, and camouflage still holds the
attacker to the concealed-charge floor.

Verified in play: `דרך על מטען נ"א — לא הופעל` fired 40 m behind where the bound
ended. A sweep-caused *detection* was never observed in the browser — the demo's
squad failed three 30% rolls and was then shot — so that half rests on the
measured tests.

### Decision 13 — two leaks in opposite directions

The disclosure line was mine and is now the author's, with two corrections:

- **The לקחים panel leaked the order of battle.** *How many enemy forces were
  never identified* was shown before the truth reveal — the only line in that
  panel that was umpire knowledge rather than the side's own experience. Since a
  side knows what it *did* detect, a bare count gives away the enemy's total. It
  now waits for the reveal.
- **A shot at an unseen force reported nothing at all**, contradicting the
  already-confirmed half of the same decision: a force always knows how many of
  its own men fired and at what chance. It now reads
  `N יורים ב-X% — ללא תצפית על המטרה`.

> **The shape behind both:** `outcomeVisibleTo` decides whether a line appears;
> `describeOutcome` decides what it may say. Putting an observation test in the
> first of those suppresses things a side plainly knows. The fix moved the test
> down a layer rather than loosening it.

### Also this session

The `.claude/` scaffold — permissions, the two hooks, the `code-reviewer`
subagent — had been in use for several sessions without ever being committed. It
is in the repo now; `settings.local.json` stays ignored.

---

## 2026-09-06 — the map is real ground

Ended at `056d056`. 325 tests. Rules decision 15 in one day, settled in two
rounds with the author, twelve commits, each driven in the browser:

1. **The proposal that was withdrawn.** Terrain *types* — wood, built-up,
   with cover, a 20 m sight rule and a double movement cost — went to him
   first. His steer: the game scales from soldier to brigade with metre-level
   resolution underneath, so the map carries **objects** and **elevation**,
   not types. Recorded under *do not re-propose*.
2. **Real ground** (`347b3e2`, `56055d7`, `520d527`) — a heightfield cut
   from public terrain tiles by `tools/fetch-dtm.py`, objects with a height on
   it, one binary symmetric sight test from an eye to a silhouette, eye height
   by posture (1.5 / 2.5 / 0.5 m), object cover as the ground's own
   `baseCover`. The review caught the first sight-line exclusion letting a
   force be seen straight through a building; fixed to near faces only.
3. **Naismith** (`34e7e5b`) — 8 m of the bound per metre climbed, descent
   free, vehicles refuse 30° up or down, no hit modifier for now. The review
   caught `reachAlong` judging the climb on the whole order line while
   `moveUnit` costs the bound: one order in 260 on the real map threw out of
   the execution loop. Judged on the bound taken, with a regression test that
   holds the failing field.
4. **The reach drawn** (`7379bbf`) — the movement ring became the true shape
   of the bound over the ground, a fan of `reachAlong` on 72 bearings.
5. **Real objects** (`f19e2a5`, `09c72e6`) — `tools/fetch-osm.py` pulled 249
   houses and two woods from OpenStreetMap; the invented farm and walls went.
   The street names settled where the ground really is: the southern edge of
   Yokneam Illit, not "near Elyakim". The ground taught its own lesson: the
   tank's 2.5 m hatches see over the shoulder to the far low ground 440 m off
   and not the slope just below it. `scenario.test.ts` pins it.
6. **Roads drawn** (`35c1943`) — a line layer the recording carries and no
   rule reads, with a digest-equality test to keep it that way; the licence
   carve-out for the ODbL data (`056d056`) at his word.

Measured and recorded: the demo's dead ground, 0/200 seeds on turn 1 and
200/200 on turn 2. The session's own lesson, twice over: the two halves of a
rule — cover reach and sight exclusion, order-line climb and bound cost — were
where both real bugs lived, and both were found by the reviewer, not the
tests. Run it before committing.

---

## 2026-08-13 — knowledge, posture, ambush and the debrief

Ended at `4c01fa8`, handed over at `e42205e`. 248 tests. One arc in six commits,
each verified in play:

1. **Orders carry a task** (`5b2c660`) — an order is an objective *and* what to
   do about the enemy there: advance, engage a named force, hold fire.
2. **A knowledge model** (`eb5be1b`, `830b510`) — the engine keeps per-side
   contacts (`intel.ts`); the hotseat draws contacts, not forces.
3. **Posture** (`d9a5bfc`, `e88ca59`, `9cc72eb`, `b55b197`) — hidden while
   stationary, continuous observation from position, digging in, camouflage,
   scouting, and the concealed-charge floor under camouflage.
4. **Ambush** (`1c27683`, `056518f`) — hold fire with an engagement range that
   springs itself on the nearest enemy, or on a designated one.
5. **Per-side debrief** (`ca9e18f`, `dd34261`, `901e4a0`) — the review reads
   through the umpire's eyes or either side's, with banded reports, a לקחים
   panel and a truth reveal.
6. **What-if** (`4c01fa8`) — re-fight the same decisions under other dice,
   skipping decisions the alternate history has made impossible and reporting
   how many were skipped.


## 2026-09-16 — the day of the two-halves bugs

Six rulings in one day (decisions 16, 17, 18, and two riders on 12), and almost
every defect found along the way was the same shape: one rule applied in two
places, off different state, each half defensible alone. Kept here because the
pattern is the point, not the individual bugs.

### Covering fire (decision 18)

It was the most expensive feature yet to get right, and every cost was a rule
with two halves:

- The live log keyed *how exactly losses are counted* off the force that
  **fired** rather than the force that was **hit**, so a side read "no
  casualties observed" about its own men. Found by driving it in the browser,
  not by a test.
- The shot was resolved against `unit.cover`, which is written only at
  placement and at upkeep — so a force that had broken out of a prepared
  position was shot at mid-bound as though still in it. Covering fire is the
  exception the end-of-turn cover ruling anticipated, and the README paragraph
  that predicted it had been deleted rather than acted on.
- `MOVEMENT_PROFILES.enemyHitModifier` — the document's own +30%/-20% for
  shooting at a moving force — had **no consumer in the engine** until this.
  Without it, running under covering fire was never worse than walking.
- Three of the four attack paths carried the rule and `fireExplosive` carried
  neither half, so a force could declare חיפוי and still fire an RPG.
- The interrupt was only half built: a bound was interrupted at the point of
  exposure, but a shot and an assault were *replied to* after the fact, so a
  coverer that was itself the target could be dead before it answered. Both
  are interrupts now (author, 2026-09-16).
- "Spends the force's action" was true only on the turn it was declared,
  because `firedThisTurn` is cleared at upkeep while the posture is not. The
  economy is derived now (`Game.actionSpent`), which also stops a watching
  force being treated as one that has fired — that flag is read by two other
  rules, and borrowing it stood the force up and halved its cover.

### The live log's side filter (decision 17)

Chasing it turned up four things the filter alone would not have fixed, each
worth knowing because each was a rule with two halves:

- The log **baked exact-vs-banded losses from whoever was viewing** when the
  line was written, then showed that line to everybody.
- The fire line printed `${shooters} יורים` — the firer's **exact fit
  strength** — to the target, which makes banding its casualties pointless.
- The debrief hid `executeStandingOrders` from the enemy **wholesale**, so a
  force shot at under a standing order was never told; and the **לקחים** panel
  read only explicit `fire` / `assault` actions, so the same ambush left
  `hitByUnseen` at nought.
- Filtering to `viewingSide` at a **handoff** shows the outgoing player the
  incoming side's private log — `viewingSide` is already the incoming side
  there. The panel takes a nullable reader for exactly this.
- **A shot has three readers, not two.** The debrief's `exact` means "the
  reader owns the target", which is true of the umpire *and* of the force being
  shot at — so the side under fire read the firer's exact strength, its hit
  chance and the damage it took. `Lens.side` is required now (`null` is the
  umpire) so a lens has to say which it is; before, a lens built without one
  silently became the umpire.
- **`knows` is not "is looking now".** It says a contact record exists. Reading
  it as a sighting let a side read `נראה מנוטרל` off a three-turn-old mark its
  own map still drew alive — decision 13 had already ruled the other way.

**Backlog 6 is closed.** A battle is laid out by describing it:
`tools/make-scenario.py` takes a JSON spec and writes the scenario module, and
the demo is its output — which is what keeps the tool honest, since the suite
plays the generated battle.

**There are two maps now.** The second, Tel Azeka over the Elah valley
(`tools/scenarios/tel-azeka.json`), was written to test the claim that a
scenario is a spec file and nothing else, and it is also the only run so far of
`--fetch-map` on a window nobody had fetched before. It teaches out of relief
alone — one tree, no buildings — and it teaches the opposite of the demo: the
tel cannot see its own eastern face, so the covered route up is the one
Naismith charges 250–360 m of bound per 100 m of ground. Its test pins those
claims the way the demo's does.

Read the ground before placing anything on it. The lesson that map actually
teaches was the opposite of the one it was picked for, and a throwaway probe
over sight lines, heights and bound costs is what said so — half an hour, and
it changed the whole battle.

**The app still opens exactly one battle**, though: `src/app/scenario.ts` names
the demo, and choosing between scenarios is UI that does not exist. Tel Azeka
is generated, tested and unreachable in the hotseat — the smallest piece of
work on this list, and the one that makes the second map worth having.

Small things noticed and left: for an **ordered tank-round** engagement,
`engaged.newCasualties` sums every unit caught in the blast against the
target's id (`game.ts`), so the firer's own men caught in its own burst land in
the debrief's `inflicted` rather than `suffered` — pre-existing normalisation,
newly visible now that the לקחים panel counts ordered engagements; a tank round
that hits reports no casualties in the live log at all (`handleFireAt`'s `fireExplosive` branch) — pre-existing,
and now a two-line fix since `logLosses` exists; the debrief has no *height*
readout for a force; `fetch-osm.py` keeps a way whole when any vertex is inside, so Route 6
carries 1.3 km of off-map points that the SVG clips — file size only.

Two I would *not* rush: **echelon scaling** (backlog 3) touches the C2 model
everywhere and has since picked up the artillery battery, which makes it larger
rather than more urgent; and **OPORD mode** (backlog 13) is a research project
with a section of its own in the README.


