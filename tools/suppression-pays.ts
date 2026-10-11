/**
 * Does suppression pay? (the open rules question of 2026-10-11)
 *
 * Every doctrinal drill that holds an assault until the firefight is won
 * is betting that a suppressed defender is much less dangerous. This
 * measures that bet directly, in isolation, rather than through a whole
 * battle: one defending squad dug in, one attacking force in the open at a
 * given range, one combat phase, many seeds — and what the defender's fire
 * costs the attacker at each level of suppression.
 *
 *   npm run suppression-pays
 *   npm run suppression-pays -- --n 400 --range 150
 */
import { Game, makeInfantry, suppressionLevel } from "../src/engine/index.js";

const args = process.argv.slice(2);
const value = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const NL = String.fromCharCode(10);
const N = Number(value("--n") ?? 300);
const RANGES = (value("--range") ?? "100,200,300").split(",").map(Number);
// 0 none; 20 suppressed (>=15); 50 pinned (>=40); 85 pinned hard.
const LEVELS = [0, 20, 50, 85];

/** One combat phase: the dug-in defender fires at the attacker in the open. */
function round(seed: number, range: number, suppression: number): { down: number; level: string } {
  const g = new Game({ seed, morale: true, lethality: "research" });
  const def = makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8, "RED-1");
  def.baseCover = "full";
  def.cover = "full";
  g.addUnit(def);
  g.addUnit(makeInfantry("BLUE-1", "BLUE", "squad", { x: range, y: 0 }, 8, "BLUE-1"));
  g.beginTurn();
  const red = g.getUnit("RED-1");
  red.suppression = suppression;
  const level = suppressionLevel(red);
  g.advanceToPhase("combat");
  try {
    g.fire("RED-1", "BLUE-1", { weapon: "smallArms" });
  } catch {
    // Heads down and out of reach: that is itself an answer.
  }
  const blue = g.getUnit("BLUE-1");
  return { down: (blue.soldiers ?? []).filter((s) => s.neutralized).length, level };
}

console.log(`${N} rounds a cell, a dug-in squad firing at eight men in the open, research figures.\n`);
console.log("| Range | Defender | Attacker's men down a turn | Relative to unsuppressed |");
console.log("|---|---|---|---|");
for (const range of RANGES) {
  const base: number[] = [];
  for (const sup of LEVELS) {
    let total = 0;
    let level = "";
    for (let s = 1; s <= N; s++) {
      const r = round(1000 + s, range, sup);
      total += r.down;
      level = r.level;
    }
    const mean = total / N;
    if (sup === 0) base.push(mean);
    const rel = base[0] ? (mean / base[0]) : 1;
    console.log(
      `| ${range} m | ${level}${sup ? ` (${sup})` : ""} | **${mean.toFixed(3)}** | ${sup === 0 ? "\u2014" : `\u00d7${rel.toFixed(2)}`} |`,
    );
  }
}

// ---------------------------------------------------------------------------
// Part two: can the attacker get it?
//
// Suppression halves every turn (resolveMorale, step 8), so a sustained
// input of X a turn settles at about 2X. Pinned is 40 and suppressed is
// 15, so holding a defender pinned needs roughly 20 a turn landing on
// *that* force. A firing squad delivers 10 plus 5 a hit. This measures what
// a base of fire of a given size actually achieves against one dug-in
// squad, turn by turn.

function baseOfFire(seed: number, firers: number, range: number, turns: number, mg: boolean): number[] {
  const g = new Game({ seed, morale: true, lethality: "research" });
  const def = makeInfantry("RED-1", "RED", "squad", { x: 0, y: 0 }, 8, "RED-1");
  def.baseCover = "full";
  def.cover = "full";
  g.addUnit(def);
  for (let i = 0; i < firers; i++) {
    // On an arc at exactly `range`, not strung out along y: spacing them
    // by 30 m of y put the second squad 401 m away and out of the rifle
    // table's last band, so every "400 m" row measured one squad firing.
    const theta = ((i - (firers - 1) / 2) * 8 * Math.PI) / 180;
    const at = { x: range * Math.cos(theta), y: range * Math.sin(theta) };
    const u = mg
      ? { ...makeInfantry(`BLUE-MG${i}`, "BLUE", "team", at, 3, `MG${i}`), mediumMg: true }
      : makeInfantry(`BLUE-${i}`, "BLUE", "squad", at, 8, `BLUE-${i}`);
    g.addUnit(u);
  }
  const seen: number[] = [];
  g.beginTurn();
  for (let t = 0; t < turns; t++) {
    g.advanceToPhase("combat");
    for (let i = 0; i < firers; i++) {
      try {
        g.fire(mg ? `BLUE-MG${i}` : `BLUE-${i}`, "RED-1", { weapon: "smallArms" });
      } catch {
        /* out of range or refused */
      }
    }
    seen.push(g.getUnit("RED-1").suppression ?? 0);
    g.advanceToPhase("initiative");
  }
  return seen;
}

console.log("\n\nCan the attacker get it? One dug-in squad under a base of fire, 60 seeds.\n");
console.log("| Base of fire | Range | Suppression held (mean of turns 4-8) | Level |");
console.log("|---|---|---|---|");
for (const [label, firers, mg] of [["1 rifle squad", 1, false], ["2 rifle squads", 2, false], ["3 rifle squads", 3, false], ["2 machine gun teams", 2, true], ["4 rifle squads", 4, false]] as [string, number, boolean][]) {
  for (const range of [200, 400, 600]) {
    let total = 0;
    let n = 0;
    for (let s = 1; s <= 60; s++) {
      const series = baseOfFire(2000 + s, firers, range, 8, mg);
      for (let t = 3; t < 8; t++) {
        total += series[t]!;
        n++;
      }
    }
    const mean = total / n;
    const level = mean >= 40 ? "**pinned**" : mean >= 15 ? "suppressed" : "none";
    console.log(`| ${label} | ${range} m | ${mean.toFixed(1)} | ${level} |`);
  }
}


// ---------------------------------------------------------------------------
// Part three: who wins the exchange?
//
// Parts one and two say suppression pays and that two squads can impose it.
// So the question is not whether either side *can* suppress, but who comes
// out of a mutual firefight more suppressed — because that is what the
// doctrinal gate actually waits for. Equal numbers, one side dug in, the
// other in the open, both firing every turn.

function exchange(seed: number, squads: number, range: number, turns: number): { attacker: number; defender: number } {
  const g = new Game({ seed, morale: true, lethality: "research" });
  for (let i = 0; i < squads; i++) {
    const theta = ((i - (squads - 1) / 2) * 8 * Math.PI) / 180;
    const dug = makeInfantry(`RED-${i}`, "RED", "squad", { x: 0, y: i * 40 }, 8, `RED-${i}`);
    dug.baseCover = "full";
    dug.cover = "full";
    g.addUnit(dug);
    g.addUnit(
      makeInfantry(`BLUE-${i}`, "BLUE", "squad", { x: range * Math.cos(theta), y: range * Math.sin(theta) }, 8, `BLUE-${i}`),
    );
  }
  g.beginTurn();
  let a = 0;
  let d = 0;
  let n = 0;
  for (let t = 0; t < turns; t++) {
    g.advanceToPhase("combat");
    for (let i = 0; i < squads; i++) {
      for (const [from, to] of [[`BLUE-${i}`, `RED-${i}`], [`RED-${i}`, `BLUE-${i}`]]) {
        try {
          g.fire(from!, to!, { weapon: "smallArms" });
        } catch {
          /* refused */
        }
      }
    }
    if (t >= 3) {
      for (let i = 0; i < squads; i++) {
        a += g.getUnit(`BLUE-${i}`).suppression ?? 0;
        d += g.getUnit(`RED-${i}`).suppression ?? 0;
        n++;
      }
    }
    g.advanceToPhase("initiative");
  }
  return { attacker: a / n, defender: d / n };
}

console.log(NL + NL + "Who wins the exchange? Equal squads, one dug in, one in the open, 60 seeds." + NL);
console.log("| Squads a side | Range | Attacker's suppression | Defender's | Who is worse off |");
console.log("|---|---|---|---|---|");
for (const squads of [1, 2, 3]) {
  for (const range of [200, 400]) {
    let a = 0;
    let d = 0;
    for (let s = 1; s <= 60; s++) {
      const r = exchange(3000 + s, squads, range, 8);
      a += r.attacker;
      d += r.defender;
    }
    a /= 60;
    d /= 60;
    const worse = a > d ? `**the attacker**, by ×${(a / Math.max(d, 0.1)).toFixed(2)}` : `the defender, by ×${(d / Math.max(a, 0.1)).toFixed(2)}`;
    console.log(`| ${squads} | ${range} m | ${a.toFixed(1)} | ${d.toFixed(1)} | ${worse} |`);
  }
}


// ---------------------------------------------------------------------------
// Part four: do the odds buy a suppression advantage?
//
// Part three had equal numbers and came out almost symmetric, which is as
// it should be. The attack's whole case is that it comes at 3:1 — so the
// question is whether those odds turn into the suppression advantage the
// doctrinal gate is waiting for. Every attacking squad fires at the
// defender nearest it, as `pickTarget` does; every defender fires back.

function odds(seed: number, attackers: number, defenders: number, range: number, turns: number) {
  const g = new Game({ seed, morale: true, lethality: "research" });
  for (let i = 0; i < defenders; i++) {
    const dug = makeInfantry(`RED-${i}`, "RED", "squad", { x: 0, y: i * 60 }, 8, `RED-${i}`);
    dug.baseCover = "full";
    dug.cover = "full";
    g.addUnit(dug);
  }
  for (let i = 0; i < attackers; i++) {
    const theta = ((i - (attackers - 1) / 2) * 7 * Math.PI) / 180;
    g.addUnit(makeInfantry(`BLUE-${i}`, "BLUE", "squad", { x: range * Math.cos(theta), y: range * Math.sin(theta) }, 8, `BLUE-${i}`));
  }
  g.beginTurn();
  let a = 0, d = 0, na = 0, nd = 0;
  for (let t = 0; t < turns; t++) {
    g.advanceToPhase("combat");
    for (let i = 0; i < attackers; i++) {
      try { g.fire(`BLUE-${i}`, `RED-${i % defenders}`, { weapon: "smallArms" }); } catch { /* refused */ }
    }
    for (let i = 0; i < defenders; i++) {
      try { g.fire(`RED-${i}`, `BLUE-${i % attackers}`, { weapon: "smallArms" }); } catch { /* refused */ }
    }
    if (t >= 3) {
      for (let i = 0; i < attackers; i++) { a += g.getUnit(`BLUE-${i}`).suppression ?? 0; na++; }
      for (let i = 0; i < defenders; i++) { d += g.getUnit(`RED-${i}`).suppression ?? 0; nd++; }
    }
    g.advanceToPhase("initiative");
  }
  return { attacker: a / na, defender: d / nd };
}

console.log(NL + NL + "Do the odds buy it? Attacking squads against one dug-in squad each, 60 seeds." + NL);
console.log("| Odds | Range | Attacker's suppression | Defender's | Defender's level |");
console.log("|---|---|---|---|---|");
for (const [atk, def] of [[1, 1], [2, 1], [3, 1], [6, 2], [9, 3]] as [number, number][]) {
  for (const range of [200, 400]) {
    let a = 0, d = 0;
    for (let s = 1; s <= 60; s++) {
      const r = odds(4000 + s, atk, def, range, 8);
      a += r.attacker; d += r.defender;
    }
    a /= 60; d /= 60;
    const level = d >= 40 ? "**pinned**" : d >= 15 ? "suppressed" : "none";
    console.log(`| ${atk}:${def} | ${range} m | ${a.toFixed(1)} | ${d.toFixed(1)} | ${level} |`);
  }
}
