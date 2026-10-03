# Doctrine handoff — the drills from the manuals (backlog 21)

The brief for the session that replaces the game's drills with doctrine.
**It waits for the author's manuals** (author, 2026-10-02): a good number of
open-source manuals collected over the years, kept on the author's computer
and to be embedded alongside the ones named below — so the work starts when
the author brings them into a session. It is **commercial-edition work
and belongs in this public repository**: the commercial edition is built on
open-source manuals only. (The 2026-10-01 note that it was local work, with
the author's material in a private package, is superseded.) The cloud
sessions' proxy refuses most military sites (handoff.md, *Traps*), so the
manuals arrive as files, not downloads. The cloud handoff is
[handoff.md](handoff.md); read its *Start here* first.

## Why

The rules are tuned against real outcomes (validation.md). The **drills** —
how a squad, platoon or company carries out an order — have so far been ours
and tuned too, so a quirk in one hid a fault in the other: the calibrated
plan "won" by keeping a third scout squad off a killing ground, not by
scouting (balance.md, forty-fourth round). From now on the layers divide:

| Layer | Set by | Tuned against |
|---|---|---|
| Rules | research | real outcomes (wins, losses, pace) |
| **Drills** | **the manuals, fixed** | nothing — they are the reference |
| Plans | players, or the AI | whatever wins |

If doctrinal drills do not give real outcomes, the **rules** are what is
wrong — and that is a decision for the author, made on the numbers.

## Which doctrine (author, 2026-10-01)

- **Civilian (commercial) edition: US doctrine in open sources**
  (Distribution A, public domain): **ATP 3-21.8** *Infantry Platoon and
  Squad* (its battle drills), **ATP 3-21.10** *Infantry Rifle Company*,
  **FM 3-90** *Tactics* (forms of manoeuvre, hasty and deliberate attack, the
  defence). Check the current edition of each and record it.
- **Institutional edition: the doctrine engine adapted to the customer's
  doctrine and material** (business-plan.md, *Editions*).
- **Every manual embedded must be cleared for public release** — for US
  doctrine, *Distribution A* on its cover. Some older or restricted editions
  are not, even where copies circulate; check each before it is committed,
  and record its title, edition, marking and source, so the commercial
  edition can show where every TTP detail came from (business-plan.md).
- **Also from doctrine** (author, 2026-10-02), so in scope here:
  - **mission and victory conditions** (backlog 18) — the manuals'
    definitions of mission accomplishment (seize, secure, defend, delay…);
  - **the MOS list and each squad's and platoon's makeup** — who carries
    what, for README decision 73 (every soldier an MOS, with kit and a
    skill), and what the manuals say about taking up a fallen gunner's
    weapon;
  - **reserves for the other layouts** — which squad each defending
    platoon holds back (the platoon battle, the company battle's platoon B,
    Yokneam);
  - **the OPORD** (`src/sim/opord.ts`) — rewritten in the manuals'
    five-paragraph form; ours until then, and not to be used again before;
  - **fire on the move** (`GameOptions.fireOnTheMove`, off) — kept until
    doctrine says whether infantry fires while moving (assault fire);
  - **the hasty attack at 45% and the flank plan at 25%** (balance.md,
    forty-fifth round) — no ruling until the reference plans are measured
    again on the doctrinal drill (Step 3).

## Step 1 — the inventory (no code)

Map every drill the game plays to its manual paragraph, in a new
`docs/doctrine.md`, one row each:

| Drill | Where in the code | Value now | Manual (publication, paragraph) | What doctrine says | Verdict | Proposed |
|---|---|---|---|---|---|---|

Verdicts: **matches**, **ours and differs**, **ours, doctrine silent**. A
manual gives procedures more than numbers ("bound when the overwatch is set";
"as METT-TC dictates"): where we must still choose a number, the row says
*the manual says X, our value Y*, as balance.md marks what is ours.

What the game plays today (`src/app/drill.ts`, `src/app/company.ts`,
`src/sim/scenarioBattle.ts`; the harness uses `PLAIN_SCRIPT`, and
`WESTERN_DRILL` is a first draft of ours):

**Attacking company and its squads**
- **Scouting** — how many squads, chosen as those nearest the plan's enemy;
  each to an observation point 350–550 m from it (`VANTAGE_RING_M`), halting
  to watch (`scouting.watchTurns`), giving up a point after 6 turns of nothing
  (`SCOUT_GIVE_UP_TURNS`); the enemy counts as found within 250 m of the plan
  (`FIND_WITHIN_M`). Binoculars for scouts (decision 54).
- **Waiting** — in the nearest dead ground out of sight of the plan's enemy
  (`waitIn: "deadGround"`), until sent.
- **When the company goes** — today a plan's choice (the scripted company: 4
  turns with the enemy in sight).
- **The approach** — a bound of 100 m at a run in contact (`bound`; the
  Western draft 50 m), half the squads moving while half fire (`overwatch`);
  covered steps out of sight of the known enemy, up to 60° off the line,
  straight within 150 m (`COVERED`); command groups 80 m behind
  (`commandGroupBehind`).
- **Bounding by platoon** — one assaulting platoon moves while the others halt
  and fire, within 400 m of a known enemy; the moving platoon's squads go
  together (`boundByPlatoon`).
- **Closing together** — a platoon within 300 m of the enemy waits at the
  last cover while another is 100 m further back, at most 5 turns
  (`TOGETHER`).
- **Moving up to an assault position** — dead ground 250 m short of the
  enemy as found (`ASSAULT_POSITION_M`, sought within 150 m); **going round a
  flank** — dead ground 200 m to the side and 100 m back (`FLANK_*`).
- **Base of fire** — a platoon halts within its fire range (400 m,
  `attackFireRange`; Western 300) and fires. **Open (author, 2026-10-03):** a
  platoon or company commander can pull some of his machine guns to form
  it; today it is riflemen only, and costs the deliberate plan about ten
  points (balance.md, fifty-sixth round). Who, with which weapons, where and
  for how long — from the manuals.
- **Holding short and lifting the fires** — squads stop 200 m from the enemy
  under their own mortars until the fires lift (`HOLD_SHORT_M`).
- **The assault** — at 25 m, with grenades (`assault`); grenadiers one
  launcher per four men.
- **Breaking contact** — none in the plain script; Western: at half strength,
  150 m back (`breakContact`).
- **Fire** — sectors (360° plain, 60° Western); the nearest enemy in reach.

**Defending platoon and company**
- **Fire discipline** — hold fire to 400 m (`openFireRange`; Western 200);
  covering fire when idle (`coverWhenIdle`).
- **Displacement** under shelling (`displace`), to an alternate position if
  one was prepared (decision 38).
- **The reserve's counterattack** on a position lost within 50 m, at a run
  (`counterattack`, decision 60).
- **The fire plan** — six mortar targets on the dead ground 100–400 m in
  front, 120 m apart (`planDefenderFires`; doctrine's target reference points
  and final protective fires); the command post stays where it was set up.

## Step 2 — the doctrinal drill

Write it as a named drill beside the others (`DOCTRINE_US`: `SquadDrill` data
plus the company behaviours), keeping `PLAIN_SCRIPT` for comparison. A drill
decides and the engine resolves (README, backlog 20): no drill changes a
rule or an outcome's odds. Where doctrine branches on events ("if pinned,
suppress and flank"), say so in the inventory before building it — backlog
20 leaves open whether a drill can branch.

## Step 3 — measure, then the author decides

Run the reference plans on the doctrinal drill, 100 seeds a scenario from
1000, on both tel assaults (handoff.md, *Start here*, lists them; about an
hour, four at a time, no tokens), and the standard measurement. Compare with
decision 68's targets (3:1 40–55%, 2:1 20–35%) and with losses against the
sources (validation.md, *Loss exchange in attacks*). If they miss, the
question is which **rule** — for the author, with the numbers. Record a new
balance round.

## Running it locally

```bash
git clone https://github.com/shmuelsh23a/Tactical.git && cd Tactical
nvm use            # Node 24 (.nvmrc)
npm ci && npm run check
npm run jev-sim -- --rule basefire,bound,holdshort --scenario telAzekaAssault --seed 1000 --n 100 --out jev-runs/B
npm run scenario-sim -- --recon 3 --watch 1 --look 4 --wait-for-contact --aim 40 --scout-from vantage --wait-in dead-ground --n 200 --target-first squads
```

`jev-runs/` and any `--out` directory under it are not committed.
