/**
 * The smart attacker: a scripted player that fights a scenario through the
 * browser UI, as a person would, and reports the result as the umpire sees it
 * (the recording saved in-page and replayed).
 *
 * It plays the attacking side of a scenario (`GameOptions.attackers`):
 *   - plans a fire plan on the objective area — its centre and 90 m to either
 *     side, not where each defending squad lies — and registers it. The
 *     centre is where its start line would judge the defence to be, off by a
 *     fifth of the range along the line of sight (rules decision 51's eye),
 *     not where the umpire has it;
 *   - bounds by halves, 50 m at a walk, the other half holding and firing; a
 *     squad the command group could not reach last turn bounds on the next;
 *   - moves its command groups behind their squads, to keep them in the
 *     every-turn band of C2;
 *   - fires the mortars on the fire plan until a squad is within 150 m of it,
 *     then lays mortar smoke on the objective from 400 m;
 *   - runs in and assaults inside 80 m / 25 m.
 * With RECON=1 it reconnoitres first (rules decision 52): the squad nearest
 * the objective goes out scouting, holding its fire, while the rest of the
 * company waits at its start line; the mortars fire only on what the scout
 * has found, and the attack goes in once it has found something (or the
 * scout is lost, or reaches the objective). The scout then lies up and
 * watches.
 * The defender fights by the app's own drill and standing orders.
 *
 * Usage — start the dev server first (`npx vite --port 5199`), then:
 *
 *   node tools/smart-attacker.mjs [scenario] [maxTurns]
 *   SEED=12 node tools/smart-attacker.mjs telAzekaAssault2 30
 *
 * Env: SEED (plays on other dice, via `?seed=`), NOFIRE (no fire plan),
 * PLANNING_ERROR (the share of range the fire plan's centre is off by,
 * default 0.2; 0 plans on the truth, as every run before 2026-09-28),
 * NOSMOKE (no smoke), RECON (send a scout ahead first), WATCH (the scout halts
 * this many turns to watch after each bound), AIM (with RECON, fire only on a
 * mark whose ring on the map is within this many metres), LOOK (with RECON,
 * the company waits this many turns after the scout's first contact), SHOT (a screenshot of the last screen, to this path;
 * with SHOT_TURN, of the attacker's map at its fire phase on that turn),
 * BASE_URL (default http://localhost:5199),
 * PLAYWRIGHT_DIR (where `playwright` resolves; default the global
 * node_modules of this container), CHROMIUM (the browser binary).
 *
 * Output: `RESULT` (casualties and how they fell, by the umpire), `FORCES`
 * (each force's position and losses at the end), `END` (the log's verdict).
 * Results and what they showed: docs/validation.md, *The design principles,
 * measured*.
 */

import { createRequire } from "node:module";
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR ?? "/opt/node22/lib/node_modules/")("playwright");
const scenario = process.argv[2] ?? "telAzekaAssault";
const maxTurns = Number(process.argv[3] ?? 30);
const style = "smart";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
await p.goto(`${process.env.BASE_URL ?? "http://localhost:5199"}/?scenario=${scenario}${process.env.SEED ? `&seed=${process.env.SEED}` : ""}`); await p.waitForTimeout(2500);
const tick = (ms = 120) => p.waitForTimeout(ms);
const buttons = () => p.evaluate(() => [...document.querySelectorAll("button")].filter((x) => x.offsetParent && !x.disabled).map((x) => x.innerText.trim().replace(/\s+/g, " ")));
const clickBtn = async (re) => { const l = p.getByRole("button", { name: re }); if (await l.count() && (await l.first().isEnabled())) { await l.first().click(); await tick(); return true; } return false; };
const clickWorld = (pt) => p.evaluate(({ x, y }) => {
  const svg = document.querySelector("svg.map"); const q = svg.createSVGPoint(); q.x = x; q.y = y;
  const c = q.matrixTransform(svg.getScreenCTM());
  svg.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: c.x, clientY: c.y }));
}, pt);
const select = async (name) => { await p.evaluate((n) => [...document.querySelectorAll(".roster li")].find((x) => x.innerText.trim().startsWith(n + " "))?.click(), name); await tick(80); };
// The selection ring is drawn at the unit's true position; the symbol image is
// not centred on it (APP-6 amplifiers sit above the frame). The ring gives the
// position, and the image-to-ring offset it shows is carried to enemy symbols.
let symOffset = { x: 0, y: 0 };
const selectedAt = async () => {
  const r = await p.evaluate(() => {
    const g = document.querySelector("g.token-selected"); if (!g) return null;
    const ring = g.querySelector("circle.selection-ring"); const img = g.querySelector("image");
    if (!ring || !img) return null;
    const x = +ring.getAttribute("cx"), y = +ring.getAttribute("cy");
    const ix = +img.getAttribute("x") + +img.getAttribute("width") / 2, iy = +img.getAttribute("y") + +img.getAttribute("height") / 2;
    return { x, y, dx: x - ix, dy: y - iy, noOrders: g.classList.contains("token-no-orders") };
  });
  if (!r) return null;
  symOffset = { x: r.dx, y: r.dy };
  return { x: r.x, y: r.y, noOrders: r.noOrders };
};
const enemies = async () => {
  const off = symOffset;
  return p.evaluate((off) => [...document.querySelectorAll("g.token-enemy:not(.token-neutralised) image")].map((e, i) => ({
    i, x: +e.getAttribute("x") + +e.getAttribute("width") / 2 + off.x, y: +e.getAttribute("y") + +e.getAttribute("height") / 2 + off.y,
  })), off);
};
const clickEnemy = (i) => p.evaluate((i) => [...document.querySelectorAll("g.token-enemy:not(.token-neutralised) image")][i]?.dispatchEvent(new MouseEvent("click", { bubbles: true })), i);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const toward = (a, b, d) => { const r = dist(a, b); return r <= d ? { ...b } : { x: a.x + (b.x - a.x) * d / r, y: a.y + (b.y - a.y) * d / r }; };
const rosterEntries = () => p.evaluate(() => [...document.querySelectorAll(".roster li")].map((li) => li.innerText.trim().replace(/\s+/g, " ")));
const alive = (entry) => !/0\/|נוטרל|נשבר|נכנע|בורח/.test(entry);

const setup = await p.evaluate(async ({ scenario, seed, share }) => {
  const mod = await import(`/src/app/scenarios/${scenario}.ts`);
  const { Rng, unitSeed, distance, locationSigma, LOCATION_ERROR } = await import("/src/engine/index.ts");
  const build = Object.values(mod).find((f) => typeof f === "function" && /Scenario$/.test(f.name));
  const { game } = build(seed);
  const att = game.attackers[0] ?? "BLUE"; const def = att === "BLUE" ? "RED" : "BLUE";
  const d = game.units.filter((u) => u.side === def && u.kind !== "command");
  const a = game.units.filter((u) => u.side === att && u.kind !== "command");
  const mean = (us) => ({ x: us.reduce((t, u) => t + u.position.x, 0) / us.length, y: us.reduce((t, u) => t + u.position.y, 0) / us.length });
  // Where the defence truly is, and where the attacker's start line judges it
  // to be: the umpire's centre, off along the sight line by `share` of the
  // range and across it by the compass (rules decision 51's figures).
  const truth = mean(d), from = mean(a);
  const range = distance(from, truth);
  const s = locationSigma(range, { ...LOCATION_ERROR.eye, rangeShare: share });
  const rng = new Rng(unitSeed(game.seed, "#planning-error"));
  const normal = () => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
  const along = share > 0 ? normal() * s.along : 0, across = share > 0 ? normal() * s.across : 0;
  const ux = (truth.x - from.x) / range, uy = (truth.y - from.y) / range;
  return {
    attacker: att,
    truth,
    estimate: { x: truth.x + along * ux - across * uy, y: truth.y + along * uy + across * ux },
    units: game.units.map((u) => ({ id: u.id, name: u.name, side: u.side, kind: u.kind })),
    // The attacker's own squad nearest the defence: its scout, if it sends one.
    scout: a.slice().sort((p, q) => Math.hypot(p.position.x - truth.x, p.position.y - truth.y) - Math.hypot(q.position.x - truth.x, q.position.y - truth.y))[0]?.name,
  };
}, { scenario, seed: process.env.SEED ? Number(process.env.SEED) : undefined, share: Number(process.env.PLANNING_ERROR ?? 0.2) });
const byName = Object.fromEntries(setup.units.map((u) => [u.name, u]));
const objective = setup.estimate;
console.log(`PLAN centre off the defence by ${Math.round(Math.hypot(objective.x - setup.truth.x, objective.y - setup.truth.y))} m`);
// Realistic intelligence: the tasking names the area, not where each squad lies.
// The registered targets are the objective's centre and two points 90 m to either side.
setup.targets = [objective, { x: objective.x - 90, y: objective.y }, { x: objective.x + 90, y: objective.y }];
const stats = { assaults: 0, bounds: 0, holds: 0, hqMoves: 0, fireCalls: 0, smoke: 0, registered: 0, lifted: null, released: null };
// Reconnaissance (RECON): the scout's name, and whether the main body has been let go.
const scout = process.env.RECON ? setup.scout : null;
let released = !scout;
// WATCH=n: the scout bounds and observes — halts n turns to watch after each bound (rules decision 53).
const watchTurns = Number(process.env.WATCH ?? 0);
let scoutWatched = 0;
// LOOK=n: find, fix, then assault — the company waits n turns after the scout's first contact.
const lookTurns = Number(process.env.LOOK ?? 0);
let foundOn = null;
const known = {}; // last known own positions by name
const missed = {}; // squads that could not be ordered last time
let turnNo = 0;

async function ownPositions(side) {
  const out = {};
  for (const entry of await rosterEntries()) {
    const name = entry.split(" — ")[0]; const u = byName[name];
    if (!u || u.side !== side || !alive(entry)) continue;
    await select(name); const at = await selectedAt(); if (at) out[name] = { ...u, at: { x: at.x, y: at.y }, noOrders: at.noOrders };
  }
  Object.assign(known, out);
  return out;
}

async function plan(side) {
  if (side !== setup.attacker) return;
  await clickBtn(/^מטרה רשומה$/); await clickBtn(/^מרגמה$/);
  for (const t of setup.targets) { await clickWorld(t); stats.registered++; await tick(120); }
}

async function targeting(side) {
  const foes = await enemies();
  if (side !== setup.attacker) {
    // The defender: fire for effect on the nearest attacker it sees.
    if (!foes.length || !(await p.getByRole("button", { name: /^פגז$/ }).count())) return;
    const own = Object.values(await ownPositions(side)).filter((u) => u.kind !== "command");
    if (!own.length) return;
    let best = null, bd = Infinity;
    for (const f of foes) for (const u of own) { const d = dist(f, u.at); if (d < bd) { bd = d; best = f; } }
    await clickBtn(/^פגז$/); await clickBtn(/^מרגמה$/); await clickBtn(/אש לאפקט מייד/); await clickWorld(best); return;
  }
  // The scout is out there on purpose: it neither lifts the fires nor counts as the lead.
  const own = Object.values(await ownPositions(side)).filter((u) => u.kind === "infantry" && u.name !== scout);
  if (!own.length) return;
  const nearestOwn = (pt) => Math.min(...own.map((u) => dist(u.at, pt)));
  // Fire plan: the registered positions, while no squad of ours is within 150 m of one (danger close).
  // With a scout out, only what it has found — the enemy it has seen, nearest the objective.
  // AIM=n: only a mark the side is sure of to within n metres — the ring the
  // map draws round it (rules decision 54), which narrows as the scout watches.
  const aimWithin = process.env.AIM ? Number(process.env.AIM) : null;
  const rings = aimWithin == null ? [] : await p.evaluate(() => [...document.querySelectorAll("circle.report-spread")].map((c) => ({ x: +c.getAttribute("cx"), y: +c.getAttribute("cy"), r: +c.getAttribute("r") })));
  const sureOf = (f) => aimWithin == null || rings.some((g) => Math.hypot(g.x - f.x, g.y - f.y) < 5 && g.r <= aimWithin);
  const seen = foes.filter(sureOf).sort((p, q) => dist(p, objective) - dist(q, objective));
  const safe = scout ? seen.filter((t) => nearestOwn(t) > 150) : setup.targets.filter((t) => nearestOwn(t) > 150);
  if (!process.env.NOFIRE && safe.length && await p.getByRole("button", { name: /^פגז$/ }).count()) {
    const t = safe[stats.fireCalls % safe.length];
    await clickBtn(/^פגז$/); await clickBtn(/^מרגמה$/); await clickBtn(/אש לאפקט מייד/); await clickWorld(t); stats.fireCalls++;
  } else if (!safe.length && (!scout || seen.length) && stats.lifted == null) stats.lifted = turnNo;
  // Smoke for the last stretch: once the lead squad is within 400 m of the
  // objective, screen it — the nearest enemy seen, else the target areas in
  // turn (a mortar screen is 50 m across and lasts 2 turns). Not at assault range.
  const lead = nearestOwn(objective);
  let best = null, bd = Infinity;
  for (const f of foes) { const d = nearestOwn(f); if (d < bd) { bd = d; best = f; } }
  const aim = best && bd < 300 && bd > 60 ? best : lead < 400 && lead > 60 ? setup.targets[stats.smoke % setup.targets.length] : null;
  if (!process.env.NOSMOKE && aim && await p.getByRole("button", { name: /^עשן$/ }).count()) {
    await clickBtn(/^עשן$/);
    if (await clickBtn(/^פצמ"ר$/)) { await clickWorld(aim); stats.smoke++; }
    await clickBtn(/^פגז$/); // back to HE for the next call
  }
}

async function movement(side) {
  if (side !== setup.attacker) return;
  const pos = await ownPositions(side);
  const foes = await enemies();
  if (scout) {
    const s = pos[scout];
    if (foes.length && foundOn == null) foundOn = turnNo;
    const looked = foundOn != null && turnNo - foundOn >= lookTurns;
    if (!released && (looked || !s || dist(s.at, objective) <= 50)) { released = true; stats.released = turnNo; }
    if (s) {
      await select(scout);
      if (!stats.scouting) { await clickBtn(/^צא לסיור$/); stats.scouting = true; }
      await clickBtn(/^אחזקת אש$/);
      // Walk on until something is found; then lie up and watch.
      const halt = released || foundOn != null || scoutWatched < watchTurns;
      scoutWatched = halt ? scoutWatched + 1 : 0;
      if (halt) await clickBtn(/^החזק מקום ואל תירה$/);
      else await clickWorld(toward(s.at, objective, 50));
      await tick(100);
    }
    if (!released) return; // the rest wait at the start line for the scout's report
  }
  const squads = Object.values(pos).filter((u) => u.kind === "infantry" && u.name !== scout).sort((a, b) => a.id.localeCompare(b.id));
  // Command groups first, so their squads stay in the every-turn band of C2.
  for (const hq of Object.values(pos).filter((u) => u.kind === "command")) {
    const prefix = hq.id.replace(/-HQ$/, "-").replace(/-COY$/, "-");
    const mine = squads.filter((s) => hq.id.endsWith("-COY") || s.id.startsWith(prefix));
    if (!mine.length) continue;
    const c = { x: mine.reduce((s, u) => s + u.at.x, 0) / mine.length, y: mine.reduce((s, u) => s + u.at.y, 0) / mine.length };
    const behind = toward(c, objective, hq.id.endsWith("-COY") ? -150 : -80);
    if (dist(hq.at, behind) < 10) continue;
    await select(hq.name); await clickWorld(toward(hq.at, behind, 45)); stats.hqMoves++; await tick(100);
  }
  squads.forEach((s, k) => (s.group = k % 2));
  for (const s of squads) {
    let near = null, nd = Infinity;
    for (const f of foes) { const d = dist(f, s.at); if (d < nd) { nd = d; near = f; } }
    // Out of the order cycle this turn (far from its command group): it goes
    // on with its last order. It bounds on the next turn it can be reached.
    if (s.noOrders) { missed[s.name] = true; continue; }
    await select(s.name);
    await clickBtn(/^תנועה ותקיפה$/);
    const boundNow = missed[s.name] || (turnNo + s.group) % 2 === 0;
    missed[s.name] = false;
    if (near && nd <= 80) {
      // Close with it, to assault range.
      await clickBtn(/^ריצה/); await clickWorld(toward(s.at, near, Math.max(0, nd - 20))); stats.bounds++;
    } else if (boundNow) {
      // This half bounds; the other half holds and shoots.
      await clickBtn(/^רגיל/); await clickWorld(toward(s.at, near && nd < 400 ? near : objective, 50)); stats.bounds++;
    } else {
      await clickBtn(/^החזק מקום$/); stats.holds++;
    }
    await tick(100);
  }
}

async function combat(side) {
  for (const entry of await rosterEntries()) {
    const name = entry.split(" — ")[0]; const u = byName[name];
    if (!u || u.side !== side || !alive(entry)) continue;
    if (side === setup.attacker && (u.kind === "command" || name === scout)) continue;
    await select(name); const at = await selectedAt(); if (!at) continue;
    const foes = await enemies(); if (!foes.length) return;
    let near = null, nd = Infinity;
    for (const f of foes) { const d = dist(f, at); if (d < nd) { nd = d; near = f; } }
    const assault = side === setup.attacker && u.kind === "infantry" && nd <= 25;
    if (assault) { await clickBtn(/^הסתערות$/); await clickBtn(/^1$/); stats.assaults++; }
    await clickEnemy(near.i); await tick(150);
    if (assault) await clickBtn(/^ירי$/);
  }
}

let over = false, steps = 0, turn = 0;
while (!over && steps < maxTurns * 30) {
  steps++;
  const bs = await buttons();
  const log = await p.evaluate(() => [...document.querySelectorAll(".log li, .log div")].map((x) => x.innerText.trim()).slice(0, 3).join(" | "));
  if (/ניצחון ל|יצאו מהקרב/.test(log)) { over = true; break; }
  if (bs.some((x) => /^התחל תור/.test(x))) { turn++; turnNo = turn; if (turn > maxTurns) break; await clickBtn(/^התחל תור/); continue; }
  if (bs.some((x) => /מוכן — הצג/.test(x))) { await clickBtn(/מוכן — הצג/); continue; }
  const endPlan = bs.find((x) => /סיים תכנון/.test(x));
  if (endPlan) { const side = /\((RED|BLUE)\)/.exec(endPlan)?.[1]; if (side) await plan(side); await clickBtn(/סיים תכנון/); continue; }
  const end = bs.find((x) => /^סיים שלב/.test(x));
  if (end) {
    const side = /\((RED|BLUE)\)/.exec(end)?.[1];
    if (/תנועה/.test(end)) await movement(side);
    else if (/סימון מטרות/.test(end)) await targeting(side);
    else if (/ירי/.test(end)) {
      // SHOT_TURN: the attacker's own map at its fire phase that turn — enemies where it judges them.
      if (process.env.SHOT && Number(process.env.SHOT_TURN) === turn && side === setup.attacker) await p.screenshot({ path: process.env.SHOT });
      await combat(side);
    }
    await clickBtn(/^סיים שלב/); continue;
  }
  console.log("stuck with buttons", JSON.stringify(bs)); break;
}
const calls = { made: stats.fireCalls };
if (process.env.SHOT && !process.env.SHOT_TURN) await p.screenshot({ path: process.env.SHOT });
// The umpire's account: save the recording in-page and replay it.
const umpire = await p.evaluate(async () => {
  let blob; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { blob = b; return "blob:x"; };
  [...document.querySelectorAll("button")].find((x) => /שמור הקלטה/.test(x.innerText))?.click();
  await new Promise((r) => setTimeout(r, 300)); URL.createObjectURL = orig;
  const rec = JSON.parse(await blob.text());
  const eng = await import("/src/engine/index.ts");
  const { game, steps } = eng.replayWithOutcomes(rec);
  const sides = {};
  for (const u of game.units) {
    const s = (sides[u.side] ??= { men: 0, down: 0, broken: 0, forces: [] });
    const men = u.soldiers ?? []; s.men += men.length;
    const down = men.filter((m) => m.neutralized).length, broken = men.filter((m) => !m.neutralized && m.morale?.state === "broken").length;
    s.down += down; s.broken += broken;
    s.forces.push(`${u.id}@${Math.round(u.position.x)},${Math.round(u.position.y)} ${down}d/${broken}b/${men.length}${u.routing ? " ROUT" : ""}${u.surrendered ? " SURR" : ""}${u.vehicle?.destroyed ? " DESTROYED" : ""}`);
  }
  const kinds = {}; for (const a of rec.actions) kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
  let he = 0, sa = 0; for (const u of game.units) for (const m of u.soldiers ?? []) if (m.neutralized) m.outBy === "explosive" ? he++ : sa++;
  const fires = steps.filter((s) => s.outcome?.kind === "fire" || s.outcome?.kind === "fireExplosive").map((s) => {
    const r = s.outcome.result; return `${s.action.kind}:${s.action.attackerId}->${s.action.targetId} ${r.fired ? (r.hits ?? (r.hit ? 1 : 0)) + "h/" + (r.newCasualties ?? (r.blast?.targets ?? []).reduce((n, t) => n + t.newCasualties, 0)) + "c" : "no:" + r.reason}`;
  });
  // How far each side's picture was from the truth at the end (rules decision 51).
  const off = {};
  for (const s of ["BLUE", "RED"]) {
    off[s] = game.contactsFor(s).map((c) => {
      const u = game.units.find((x) => x.id === c.unitId);
      return Math.round(Math.hypot(c.lastKnownPosition.x - u.position.x, c.lastKnownPosition.y - u.position.y));
    });
  }
  return { lethality: rec.lethality, locationError: rec.locationError ?? false, contactsOff: off, attackers: rec.attackers, turn: game.turn, sides, kinds, outBy: { he, sa }, fires: fires.slice(0, 40) };
});
const side = (x) => `${x.down} down ${x.broken} broken of ${x.men}`;
console.log("SMART " + JSON.stringify(stats)); console.log(`RESULT ${scenario} [${style}] turn ${umpire.turn}: BLUE ${side(umpire.sides.BLUE)} | RED ${side(umpire.sides.RED)} | out by HE ${umpire.outBy.he}, small arms ${umpire.outBy.sa} | actions ${JSON.stringify(umpire.kinds)} | player ${JSON.stringify(stats)} fire calls ${calls.made}`);
console.log(`CONTACTS locationError ${umpire.locationError}, each side's reports off the truth by (m): ${JSON.stringify(umpire.contactsOff)}`);
console.log("FORCES " + JSON.stringify(Object.fromEntries(Object.entries(umpire.sides).map(([k, v]) => [k, v.forces]))));
const result = await p.evaluate(() => ({
  log: [...document.querySelectorAll(".log li, .log div")].map((x) => x.innerText.trim().replace(/\s+/g, " ")).filter(Boolean),
  turnInfo: document.querySelector(".turn-info")?.innerText.replace(/\s+/g, " "),
}));
console.log("fire calls", calls.made); console.log("turns", turn, "over", over, "turnInfo", result.turnInfo);
console.log("END " + result.log.filter((l) => /ניצחון ל|יצאו מהקרב/.test(l)).join(" | "));
console.log("ERRORS", JSON.stringify(errors.slice(0, 10)));
await b.close();
