import { useReducer, useRef, useState } from "react";
import {
  ASSAULT_RANGE_M,
  MOVEMENT_PROFILES,
  SMOKE_DURATION_TURNS,
  SMOKE_RADIUS_M,
  distance,
  fitSoldiers,
  fullStrength,
  orderInterval,
  replayGame,
  sealRecording,
  verifyRecording,
  type GameRecording,
  type IndirectFireResult,
  type Side,
  type SmokeScreen,
  type SmokeSource,
  type StandingOrder,
  type Unit,
} from "../engine/index.js";
import {
  describeExecution,
  describeStandingOrder,
  isRoutineOrderReason,
  reasonHe,
} from "./debriefText.js";
import { buildDemoScenario, type Scenario } from "./scenario.js";
import {
  buildActivations,
  computeRevealed,
  isGone,
  sideDefeated,
  type Activation,
  type ActivationPhase,
  type LogEntry,
} from "./hotseat.js";
import { MapView, orderOverlay } from "./components/MapView.js";
import { Debrief } from "./Debrief.js";
import { LogPanel } from "./components/LogPanel.js";
import { Handoff } from "./components/Handoff.js";

type Gait = "normal" | "run";
type SmallArm = "smallArms" | "sustainedMg";
type Stage = "initiative" | "activation" | "gameover";
/** Indirect-fire tube the player is marking with. */
type Tube = "mortar" | "artillery";
/** What the marked point is for: high explosive, or a smoke screen. */
type Mission = "he" | "smoke";
/** What a force does in the fire phase: shoot, or go in. */
type CombatAction = "fire" | "assault";
/**
 * What an order tells a force to do at its objective — the task, over and above
 * where to go. The engine's standing order carries an `engage` task
 * (rules decision 6); this is the player's way of setting one.
 */
type OrderTask = "advance" | "engage";

const phaseLabelHe: Record<ActivationPhase, string> = {
  targeting: "שלב סימון מטרות",
  movement: "שלב תנועה",
  combat: "שלב ירי",
};

const tubeHe: Record<Tube, string> = { mortar: "מרגמה", artillery: "ארטילריה" };

/** Smoke by delivery means, in the document's own words (the עשן table). */
const smokeSourceHe: Record<SmokeSource, string> = {
  grenade: "רימון",
  mortar: 'פצמ"ר',
  artillery: "פגז ארטילריה",
};

export function App() {
  // The engine lives in a ref (mutable, imperative); React state mirrors it.
  const initRef = useRef<{ scn: Scenario; order: Side[] } | null>(null);
  if (!initRef.current) {
    const scn = buildDemoScenario();
    const { initiativeOrder } = scn.game.beginTurn();
    initRef.current = { scn, order: initiativeOrder };
  }
  const { scn, order: initialOrder } = initRef.current;
  const game = scn.game;

  const [, force] = useReducer((x: number) => x + 1, 0);
  const logIdRef = useRef(0);
  const [log, setLog] = useState<LogEntry[]>(() => [
    {
      id: ++logIdRef.current,
      turn: game.turn,
      kind: "info",
      text: `תור ${game.turn} — יוזמה: ${initialOrder.join(" → ")}`,
    },
  ]);

  const [stage, setStage] = useState<Stage>("initiative");
  const [activations, setActivations] = useState<Activation[]>(() =>
    buildActivations(initialOrder),
  );
  const [actIndex, setActIndex] = useState(0);
  const [handoffTo, setHandoffTo] = useState<Side | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gait, setGait] = useState<Gait>("normal");
  const [weapon, setWeapon] = useState<SmallArm>("smallArms");
  const [tube, setTube] = useState<Tube>("mortar");
  const [mission, setMission] = useState<Mission>("he");
  const [smokeSource, setSmokeSource] = useState<SmokeSource>("mortar");
  const [combatAction, setCombatAction] = useState<CombatAction>("fire");
  const [orderTask, setOrderTask] = useState<OrderTask>("advance");
  const [orderTargetId, setOrderTargetId] = useState<string | null>(null);
  const [orderWeapon, setOrderWeapon] = useState<SmallArm>("smallArms");
  const [grenades, setGrenades] = useState(1);
  const [winner, setWinner] = useState<Side | null>(null);
  /** A loaded recording being reviewed; the game is left untouched behind it. */
  const [debrief, setDebrief] = useState<GameRecording | null>(null);

  // One fire mission and one smoke screen per side per turn (see README rules
  // decision 8) — keyed `SIDE-he` / `SIDE-smoke` to the turn it was spent on.
  const missionsUsed = useRef<Record<string, number>>({});
  const missionSpent = (side: Side, kind: Mission) =>
    missionsUsed.current[`${side}-${kind}`] === game.turn;

  function pushLog(text: string, kind: LogEntry["kind"], side?: Side) {
    setLog((l) => [...l, { id: ++logIdRef.current, turn: game.turn, text, kind, ...(side ? { side } : {}) }]);
  }

  const currentActivation =
    stage === "activation" && actIndex < activations.length ? activations[actIndex] : null;
  const viewingSide: Side = currentActivation?.side ?? activations[0]?.side ?? "BLUE";
  const enginePhase: ActivationPhase | "other" = currentActivation?.phase ?? "other";

  const revealed = computeRevealed(game, viewingSide);
  const visibleUnits = game.units.filter(
    (u) => !isGone(u) && (u.side === viewingSide || revealed.has(u.id)),
  );
  const selected = visibleUnits.find((u) => u.id === selectedId) ?? null;
  const selectedOwn = selected && selected.side === viewingSide ? selected : null;

  // The viewing side's command group is the C2 reference for its subordinates.
  // A force too far from it may not be given new orders — and without orders it
  // cannot manoeuvre (it may still fire; see handleFireAt).
  const commandGroup = game.commandGroupFor(viewingSide) ?? null;
  const awaitingOrders = new Set(
    enginePhase === "movement"
      ? game.units.filter((u) => u.side === viewingSide && !game.canManoeuvre(u.id)).map((u) => u.id)
      : [],
  );
  const selectedCanManoeuvre = selectedOwn ? !awaitingOrders.has(selectedOwn.id) : false;

  const nameOf = (id: string) => game.units.find((u) => u.id === id)?.name ?? id;
  /** Enemies this side can currently see — the only ones an order may name. */
  const visibleEnemies = visibleUnits.filter((u) => u.side !== viewingSide && !u.neutralized);
  const selectedOrder = selectedOwn ? game.standingOrderFor(selectedOwn.id) : undefined;

  /** The engage task the order controls are currently set to, if any. */
  function orderedEngagement(): StandingOrder["engage"] | undefined {
    if (orderTask !== "engage" || !orderTargetId) return undefined;
    const target = visibleEnemies.find((u) => u.id === orderTargetId);
    return target ? { targetId: target.id, weapon: orderWeapon } : undefined;
  }

  const moveCap =
    selectedOwn && enginePhase === "movement" && selectedCanManoeuvre
      ? Math.max(
          0,
          MOVEMENT_PROFILES[gait].maxDistance * (selectedOwn.underFire ? 0.5 : 1) -
            selectedOwn.movedThisTurn,
        )
      : null;

  const orderInfo: OrderInfo | null =
    selectedOwn && selectedOwn.kind !== "command" && commandGroup
      ? {
          distance: distance(selectedOwn.position, commandGroup.position),
          interval: orderInterval(
            selectedOwn.echelon,
            distance(selectedOwn.position, commandGroup.position),
          ),
          underOrders: game.isUnderOrders(selectedOwn.id),
          canManoeuvre: game.canManoeuvre(selectedOwn.id),
          nextOrderTurn: game.nextOrderTurn(selectedOwn.id),
        }
      : null;

  // ---- actions ----

  function handleContinue() {
    game.advanceToPhase("targeting");
    setStage("activation");
    setActIndex(0);
    setHandoffTo(activations[0]!.side);
    force();
  }

  /** Mark an aim point: a fire mission that lands later, or a smoke screen. */
  function handleTargetAt(x: number, y: number) {
    if (enginePhase !== "targeting") return;
    if (missionSpent(viewingSide, mission)) {
      pushLog(
        mission === "smoke"
          ? "כבר הונח מסך עשן בתור זה"
          : "כבר סומנה משימת אש בתור זה",
        "info",
        viewingSide,
      );
      return;
    }
    try {
      if (mission === "smoke") {
        const order = game.deploySmoke(smokeSource, viewingSide, { x, y });
        const what = `מסך עשן (${smokeSourceHe[smokeSource]}, רדיוס ${order.radius}מ')`;
        pushLog(
          order.screen
            ? `${what} הונח — ${order.durationTurns} תורות`
            : `${what} סומן — יגיע בתור ${order.arrivesOnTurn}`,
          "fire",
          viewingSide,
        );
      } else {
        const m = game.queueIndirectFire(tube, viewingSide, { x, y });
        pushLog(
          `משימת אש — ${tubeHe[tube]}, פגיעה צפויה בתור ${m.resolvesOnTurn}`,
          "fire",
          viewingSide,
        );
      }
      missionsUsed.current[`${viewingSide}-${mission}`] = game.turn;
    } catch (err) {
      pushLog((err as Error).message, "info", viewingSide);
    }
    force();
  }

  /** Log indirect fire and smoke that arrived while stepping between phases. */
  function logImpacts(resolved: IndirectFireResult[], smokeArrived: SmokeScreen[]) {
    for (const s of smokeArrived) {
      pushLog(`מסך עשן ירד — רדיוס ${s.radius}מ', ${s.turnsRemaining} תורות`, "fire");
    }
    for (const r of resolved) {
      const off = Math.round(distance(r.aim, r.dispersion.impact));
      const weapon = tubeHe[r.weapon as Tube] ?? r.weapon;
      pushLog(
        off > 0 ? `${weapon}: נחיתה בסטייה של ${off}מ' מהמטרה` : `${weapon}: פגיעה מדויקת במטרה`,
        "fire",
      );
      for (const hit of r.blast.targets) {
        if (!hit.caught) continue;
        const name = game.units.find((u) => u.id === hit.unitId)?.name ?? hit.unitId;
        pushLog(`${name} נפגע מ${weapon}: ${hit.damage} נק"פ, ${hit.newCasualties} נפגעים`, "casualty");
        if (hit.neutralized) pushLog(`${name} נוטרל!`, "casualty");
      }
    }
    if (resolved.length) checkVictory();
  }

  const smokeInFlight = game.pendingSmoke.filter((m) => m.side === viewingSide);
  // A side knows its own charges; the enemy's only once they have been spotted.
  const knownMines = game.mines.filter((m) => m.side === viewingSide || m.detected);

  function handleSelect(id: string) {
    const u = game.units.find((x) => x.id === id);
    if (u && u.side === viewingSide) setSelectedId(id);
  }

  function handleMoveTo(x: number, y: number) {
    if (!selectedOwn || enginePhase !== "movement") return;
    // The חפ"ק is the player's own command post: he moves it himself. Everyone
    // else is given an order, which the engine then carries out — this turn and
    // every turn after, until it is replaced (rules decision 6).
    if (selectedOwn.kind === "command") {
      moveCommandGroup(selectedOwn, x, y);
      return;
    }
    issueOrder(selectedOwn, { gait, destination: { x, y }, engage: orderedEngagement() });
  }

  /** Order the force to stay where it is — and, if a task is set, to fight from there. */
  function handleHoldOrder() {
    if (!selectedOwn || enginePhase !== "movement" || selectedOwn.kind === "command") return;
    issueOrder(selectedOwn, { gait, engage: orderedEngagement() });
  }

  /**
   * Hand a force its orders and let the engine start on them. An order replaces
   * the one before it whole — objective *and* task — so what the panel shows is
   * exactly what the force is now working to.
   */
  function issueOrder(unit: Unit, order: Omit<StandingOrder, "issuedTurn">) {
    if (awaitingOrders.has(unit.id)) {
      const next = game.nextOrderTurn(unit.id);
      pushLog(
        `${unit.name} מחוץ למחזור הפקודות — ממשיך בפקודה הקודמת` +
          (next != null ? ` (פקודה חדשה: תור ${next})` : ""),
        "info",
        viewingSide,
      );
      return;
    }
    const next = game.nextOrderTurn(unit.id);
    game.setStandingOrder(unit.id, order);
    pushLog(`${unit.name} — פקודה: ${describeStandingOrder(order, nameOf)}`, "move", viewingSide);
    if (next != null && next > game.turn + 1) {
      pushLog(`${unit.name} — פקודה חדשה רק בתור ${next}`, "info", viewingSide);
    }
    runStandingOrders();
    force();
  }

  /** The one force the player still drives by hand. */
  function moveCommandGroup(unit: Unit, x: number, y: number) {
    try {
      const { detection: det } = game.moveUnit(unit.id, { x, y }, gait);
      pushLog(`${unit.name} נע (${gait === "run" ? "ריצה" : "רגיל"})`, "move", viewingSide);
      if (det.spottedUnitIds.length) {
        pushLog(`גילוי: ${det.spottedUnitIds.map(nameOf).join(", ")}`, "info", viewingSide);
      }
    } catch (err) {
      pushLog((err as Error).message, "info", viewingSide);
    }
    force();
  }

  /** Let the engine carry out this side's orders for the current phase. */
  function runStandingOrders() {
    runStandingOrdersFor(viewingSide);
  }

  function runStandingOrdersFor(side: Side) {
    for (const done of game.executeStandingOrders(side)) {
      const unit = game.units.find((u) => u.id === done.unitId);
      const name = unit?.name ?? done.unitId;
      if (done.moved) {
        pushLog(describeExecution(done, nameOf), "move", side);
        const { detection, mineDetonations } = done.moved.result;
        if (detection.spottedUnitIds.length) {
          pushLog(`גילוי: ${detection.spottedUnitIds.map(nameOf).join(", ")}`, "info", side);
        }
        if (detection.foundMineIds.length) {
          pushLog(`${name} איתר ${detection.foundMineIds.length} מטענים`, "info", side);
        }
        for (const det of mineDetonations) {
          const kind = det.type === "antiTank" ? 'מטען נ"ט' : 'מטען נ"א';
          if (!det.activated) {
            pushLog(`${name} דרך על ${kind} — לא הופעל`, "info", side);
            continue;
          }
          pushLog(`${kind} התפוצץ תחת ${name}!`, "casualty", side);
          for (const hit of det.blast?.targets ?? []) {
            if (!hit.caught) continue;
            const victim = game.units.find((u) => u.id === hit.unitId)?.name ?? hit.unitId;
            pushLog(`${victim}: ${hit.damage} נק"פ, ${hit.newCasualties} נפגעים`, "casualty", side);
            if (hit.neutralized) pushLog(`${victim} נוטרל!`, "casualty", side);
          }
        }
      }
      if (done.engaged) {
        pushLog(
          describeExecution(done, nameOf),
          done.engaged.newCasualties > 0 ? "casualty" : "fire",
          side,
        );
        const target = game.units.find((u) => u.id === done.engaged!.targetId);
        if (target?.neutralized) pushLog(`${target.name} נוטרל!`, "casualty", side);
      }
      if (done.reason && !isRoutineOrderReason(done.reason)) {
        pushLog(`${name}: ${reasonHe(done.reason)}`, "info", side);
      }
    }
    checkVictory();
  }

  function handleFireAt(enemyId: string) {
    if (!selectedOwn || enginePhase !== "combat") return;
    // One action per force per fire phase. (A command group may fire too, but
    // only with its small personnel — i.e. fitSoldiers attack rolls.)
    if (selectedOwn.firedThisTurn) {
      pushLog(`${selectedOwn.name} כבר ביצע פעולה בשלב הירי`, "fire", viewingSide);
      return;
    }
    const target = game.units.find((u) => u.id === enemyId);
    if (!target) return;

    if (combatAction === "assault") {
      handleAssault(selectedOwn, target);
      return;
    }

    try {
      // Line of sight is left to the engine, which checks the shot against the
      // smoke on the map.
      if (selectedOwn.kind === "vehicle") {
        const r = game.fireExplosive("tankRound", selectedOwn.id, target.id);
        if (!r.fired) pushLog(`${selectedOwn.name}: ${reasonHe(r.reason)}`, "fire", viewingSide);
        else if (!r.hit) pushLog(`${selectedOwn.name} ירה פגז — החטאה`, "fire", viewingSide);
        else pushLog(`${selectedOwn.name} פגע ב${target.name} בפגז טנק`, "casualty", viewingSide);
      } else {
        const r = game.fire(selectedOwn.id, target.id, {
          weapon,
          cover: target.inFullCover ? "full" : "none",
        });
        if (!r.fired) {
          pushLog(`${selectedOwn.name}: ${reasonHe(r.reason)}`, "fire", viewingSide);
        } else {
          pushLog(
            `${selectedOwn.name} → ${target.name}: ${r.hits} פגיעות (${Math.round(r.hitChance * 100)}%), ${r.newCasualties} נפגעים`,
            r.newCasualties > 0 ? "casualty" : "fire",
            viewingSide,
          );
        }
      }
      if (target.neutralized) pushLog(`${target.name} נוטרל!`, "casualty", viewingSide);
    } catch (err) {
      pushLog((err as Error).message, "fire", viewingSide);
    }
    checkVictory();
    force();
  }

  /** Go in on a neighbouring force: assault fire plus however many grenades. */
  function handleAssault(attacker: Unit, target: Unit) {
    try {
      const r = game.assault(attacker.id, target.id, grenades);
      if (!r.fired) {
        pushLog(`${attacker.name}: ${reasonHe(r.reason)}`, "fire", viewingSide);
      } else {
        pushLog(
          `${attacker.name} הסתער על ${target.name}: ${r.fireHits} פגיעות אש` +
            (grenades > 0 ? `, ${r.grenadeHits}/${grenades} רימונים` : "") +
            `, ${r.defenderCasualties} נפגעים`,
          r.defenderCasualties > 0 ? "casualty" : "fire",
          viewingSide,
        );
        if (r.selfCasualties > 0) {
          pushLog(
            `${attacker.name} ספג ${r.selfCasualties} נפגעים מרימוני עצמו`,
            "casualty",
            viewingSide,
          );
        }
        if (r.defenderNeutralized) pushLog(`${target.name} נוטרל!`, "casualty", viewingSide);
      }
    } catch (err) {
      pushLog((err as Error).message, "fire", viewingSide);
    }
    checkVictory();
    force();
  }

  /**
   * Download the battle as a recording — seed plus the action log, which
   * replayGame() reconstructs exactly. The seed-driven engine is what makes
   * this a few hundred bytes rather than a state dump.
   */
  function handleSaveRecording() {
    // Sealed on the way out: the fingerprints let a later load tell whether
    // the rules have moved under the recording since.
    const recording = sealRecording(game.toRecording());
    const blob = new Blob([JSON.stringify(recording, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${scn.title} — תור ${game.turn}.json`;
    link.click();
    URL.revokeObjectURL(url);
    pushLog(`הקרב נשמר להקלטה (${recording.actions.length} פעולות)`, "info");
  }

  /** Read a saved recording and hand it to the debrief view. */
  async function loadRecording(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as GameRecording;
      // Fail here rather than halfway through a replay.
      replayGame(parsed, { upToAction: 0 });
      const check = verifyRecording(parsed);
      if (check.checked && !check.ok) {
        pushLog(
          `אזהרה: ההקלטה נוצרה תחת חוקים אחרים — התוצאות משתנות מפעולה ${
            (check.firstDivergence?.index ?? 0) + 1
          }`,
          "info",
        );
      }
      setDebrief(parsed);
    } catch (err) {
      pushLog(`טעינת ההקלטה נכשלה: ${(err as Error).message}`, "info");
      force();
    }
  }

  function checkVictory() {
    for (const side of ["RED", "BLUE"] as Side[]) {
      if (sideDefeated(game, side)) {
        const win = side === "RED" ? "BLUE" : "RED";
        setWinner(win);
        setStage("gameover");
        pushLog(`צד ${side} נוטרל — ניצחון ל${win}`, "info");
      }
    }
  }

  function handleEndActivation() {
    setSelectedId(null);
    const next = actIndex + 1;
    if (next < activations.length) {
      const from = activations[actIndex]!.phase;
      const to = activations[next]!.phase;
      if (from !== to) {
        // Stepping into movement crosses resolvePriorArty, where fire missions
        // marked on an earlier turn come down.
        const { resolved, smokeArrived } = game.advanceToPhase(to);
        pushLog(`מעבר ל${phaseLabelHe[to]}`, "phase");
        logImpacts(resolved, smokeArrived);
      }
      setActIndex(next);
      setHandoffTo(activations[next]!.side);
      // The side taking over acts on the orders it already holds before the
      // player touches anything.
      const opening = activations[next]!;
      if (opening.phase === "movement" || opening.phase === "combat") {
        runStandingOrdersFor(opening.side);
      }
    } else {
      // End of turn: run upkeep + begin the next turn.
      game.advanceToPhase("initiative");
      const order = game.initiativeOrder;
      setActivations(buildActivations(order));
      setActIndex(0);
      setStage("initiative");
      pushLog(`תור ${game.turn} — יוזמה: ${order.join(" → ")}`, "info");
    }
    force();
  }

  // ---- render ----

  const showHandoff = stage === "activation" && handoffTo != null;

  if (debrief) return <Debrief recording={debrief} onClose={() => setDebrief(null)} />;

  return (
    <div className="app">
      <header className="topbar">
        <h1>{scn.title}</h1>
        <div className="turn-info">
          <span>תור {game.turn}</span>
          <span className="sep">·</span>
          <span>יוזמה: {activations.map((a) => a.side).filter((s, i, arr) => arr.indexOf(s) === i).join(" → ")}</span>
        </div>
        <button className="btn-ghost" onClick={handleSaveRecording} title="שמירת הקרב לקובץ לצורך שחזור ותחקיר">
          שמור הקלטה
        </button>
        <label className="btn-ghost" title="טעינת הקלטה שמורה לתחקיר">
          טען לתחקיר
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-loading the same file
              if (file) void loadRecording(file);
            }}
          />
        </label>
      </header>

      <div className="main">
        <div className="map-wrap">
          {showHandoff ? (
            <Handoff
              side={handoffTo!}
              phaseLabel={phaseLabelHe[currentActivation!.phase]}
              onReady={() => setHandoffTo(null)}
            />
          ) : (
            <MapView
              width={scn.mapWidth}
              height={scn.mapHeight}
              units={visibleUnits}
              viewingSide={viewingSide}
              selectedId={selectedId}
              phase={enginePhase}
              moveCap={moveCap}
              revealedEnemyIds={revealed}
              awaitingOrderIds={awaitingOrders}
              assaultReach={
                enginePhase === "combat" && combatAction === "assault" && selectedOwn
                  ? ASSAULT_RANGE_M
                  : null
              }
              smoke={game.smoke}
              pendingFire={game.pendingFire.filter((m) => m.side === viewingSide)}
              pendingSmoke={smokeInFlight}
              mines={knownMines}
              standingOrders={game.units
                .filter((u) => u.side === viewingSide)
                .flatMap((u) => orderOverlay(game.standingOrderFor(u.id), u, game.units))}
              onSelectUnit={handleSelect}
              onFireAt={handleFireAt}
              onMoveTo={handleMoveTo}
              onTargetAt={handleTargetAt}
            />
          )}
        </div>

        <aside className="sidebar">
          {stage === "initiative" && (
            <div className="panel">
              <h3>שלב יוזמה — תור {game.turn}</h3>
              <p>סדר פעולה: {activations.map((a) => a.side).filter((s, i, arr) => arr.indexOf(s) === i).join(" → ")}</p>
              <button className="btn-primary" onClick={handleContinue}>
                התחל תור
              </button>
            </div>
          )}

          {stage === "activation" && !showHandoff && currentActivation && (
            <div className="panel">
              <h3>
                <span className={`chip chip-${viewingSide.toLowerCase()}`}>{viewingSide}</span>{" "}
                {phaseLabelHe[currentActivation.phase]}
              </h3>

              {currentActivation.phase === "targeting" && (
                <div className="controls">
                  <label>משימה:</label>
                  <div className="seg">
                    <button className={mission === "he" ? "on" : ""} onClick={() => setMission("he")}>
                      פגז
                    </button>
                    <button
                      className={mission === "smoke" ? "on" : ""}
                      onClick={() => setMission("smoke")}
                    >
                      עשן
                    </button>
                  </div>

                  <label>אמצעי:</label>
                  {mission === "he" ? (
                    <div className="seg">
                      <button
                        className={tube === "mortar" ? "on" : ""}
                        onClick={() => setTube("mortar")}
                      >
                        מרגמה
                      </button>
                      <button
                        className={tube === "artillery" ? "on" : ""}
                        onClick={() => setTube("artillery")}
                      >
                        ארטילריה
                      </button>
                    </div>
                  ) : (
                    <div className="seg">
                      {(["grenade", "mortar", "artillery"] as SmokeSource[]).map((s) => (
                        <button
                          key={s}
                          className={smokeSource === s ? "on" : ""}
                          onClick={() => setSmokeSource(s)}
                        >
                          {smokeSourceHe[s]}
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="hint">
                    {mission === "he" ? (
                      <>
                        לחץ על המפה כדי לסמן מטרה. הפגז נוחת כעבור{" "}
                        {tube === "mortar" ? "תור" : "שני תורות"} ומפוזר לפי טבלת הפגיעה.
                      </>
                    ) : (
                      <>
                        עשן חוסם ירי לתוכו ודרכו. {smokeSourceHe[smokeSource]}: רדיוס{" "}
                        {SMOKE_RADIUS_M[smokeSource]}מ',{" "}
                        {SMOKE_DURATION_TURNS[smokeSource]} תורות,{" "}
                        {smokeSource === "grenade"
                          ? "יורד מייד"
                          : smokeSource === "mortar"
                            ? "יורד כעבור תור"
                            : "יורד כעבור שני תורות"}
                        .
                      </>
                    )}
                  </p>
                  <div className="unit-card">
                    <div className={missionSpent(viewingSide, "he") ? "warn" : "ok"}>
                      משימת אש: {missionSpent(viewingSide, "he") ? "נוצלה בתור זה" : "זמינה"}
                    </div>
                    <div className={missionSpent(viewingSide, "smoke") ? "warn" : "ok"}>
                      מסך עשן: {missionSpent(viewingSide, "smoke") ? "נוצל בתור זה" : "זמין"}
                    </div>
                  </div>
                </div>
              )}

              {currentActivation.phase === "movement" && (
                <div className="controls">
                  <label>קצב תנועה:</label>
                  <div className="seg">
                    <button className={gait === "normal" ? "on" : ""} onClick={() => setGait("normal")}>
                      רגיל (≤50מ')
                    </button>
                    <button className={gait === "run" ? "on" : ""} onClick={() => setGait("run")}>
                      ריצה (≤100מ')
                    </button>
                  </div>
                  <label>משימה:</label>
                  <div className="seg">
                    <button
                      className={orderTask === "advance" ? "on" : ""}
                      onClick={() => setOrderTask("advance")}
                    >
                      תנועה בלבד
                    </button>
                    <button
                      className={orderTask === "engage" ? "on" : ""}
                      onClick={() => setOrderTask("engage")}
                    >
                      תנועה ותקיפה
                    </button>
                  </div>

                  {orderTask === "engage" &&
                    (visibleEnemies.length === 0 ? (
                      <p className="hint warn">אין אויב מזוהה — אי אפשר לקבוע מטרה בפקודה.</p>
                    ) : (
                      <>
                        <label>מטרה לתקיפה:</label>
                        <div className="seg seg-wrap">
                          {visibleEnemies.map((u) => (
                            <button
                              key={u.id}
                              className={orderTargetId === u.id ? "on" : ""}
                              onClick={() => setOrderTargetId(u.id)}
                            >
                              {u.name}
                            </button>
                          ))}
                        </div>
                        <label>אמצעי ירי בפקודה:</label>
                        <div className="seg">
                          <button
                            className={orderWeapon === "smallArms" ? "on" : ""}
                            onClick={() => setOrderWeapon("smallArms")}
                          >
                            נק"ל
                          </button>
                          <button
                            className={orderWeapon === "sustainedMg" ? "on" : ""}
                            onClick={() => setOrderWeapon("sustainedMg")}
                          >
                            מקלע
                          </button>
                        </div>
                      </>
                    ))}

                  <button
                    className="btn-ghost"
                    disabled={!selectedOwn || selectedOwn.kind === "command"}
                    onClick={handleHoldOrder}
                    title="פקודה ללא תנועה: הכוח נשאר במקומו ומבצע את המשימה שנקבעה"
                  >
                    {orderedEngagement() ? "החזק מקום ותקוף" : "החזק מקום"}
                  </button>

                  <p className="hint">
                    בחר כוח, ולחץ על המפה כדי לתת פקודה (בתוך הטווח המסומן). הפקודה
                    נשארת בתוקף — הכוח ממשיך אליה ומבצע את משימתו בכל תור עד שתוחלף.
                    כוח המסומן בעיגול מקווקו מחוץ למחזור הפקודות: הוא ממשיך בפקודה
                    הקודמת ואי אפשר לשנות לו אותה — קרב את החפ"ק אליו.
                  </p>
                </div>
              )}

              {currentActivation.phase === "combat" && (
                <div className="controls">
                  <label>פעולה:</label>
                  <div className="seg">
                    <button
                      className={combatAction === "fire" ? "on" : ""}
                      onClick={() => setCombatAction("fire")}
                    >
                      ירי
                    </button>
                    <button
                      className={combatAction === "assault" ? "on" : ""}
                      onClick={() => setCombatAction("assault")}
                    >
                      הסתערות
                    </button>
                  </div>

                  {combatAction === "fire" ? (
                    <>
                      <label>אמצעי ירי:</label>
                      <div className="seg">
                        <button
                          className={weapon === "smallArms" ? "on" : ""}
                          onClick={() => setWeapon("smallArms")}
                        >
                          נק"ל
                        </button>
                        <button
                          className={weapon === "sustainedMg" ? "on" : ""}
                          onClick={() => setWeapon("sustainedMg")}
                        >
                          מקלע
                        </button>
                      </div>
                      <p className="hint">בחר כוח, ולחץ על אויב מסומן כדי לירות.</p>
                    </>
                  ) : (
                    <>
                      <label>רימונים:</label>
                      <div className="seg">
                        {[0, 1, 2, 3].map((n) => (
                          <button
                            key={n}
                            className={grenades === n ? "on" : ""}
                            onClick={() => setGrenades(n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="hint">
                        הסתערות עד {ASSAULT_RANGE_M}מ' (מסומן סביב הכוח הנבחר): אש הסתערות 70%
                        לכל לוחם כשיר, וכל רימון 30% פגיעה באויב · 5% פגיעה עצמית.
                      </p>
                    </>
                  )}
                </div>
              )}

              <SelectedUnitCard
                unit={selectedOwn}
                orderInfo={orderInfo}
                order={selectedOrder}
                nameOf={nameOf}
              />

              <button className="btn-primary" onClick={handleEndActivation}>
                סיים {phaseLabelHe[currentActivation.phase]} ({viewingSide})
              </button>

              <Roster
                units={game.units.filter((u) => u.side === viewingSide)}
                selectedId={selectedId}
                awaitingOrders={awaitingOrders}
                onSelect={handleSelect}
              />
            </div>
          )}

          {stage === "gameover" && (
            <div className="panel">
              <h3>סיום</h3>
              <p className="victory">ניצחון לצד {winner}!</p>
            </div>
          )}

          <LogPanel log={log} />
        </aside>
      </div>
    </div>
  );
}

interface OrderInfo {
  /** Distance from the force to its command group, in metres. */
  distance: number;
  /** Order interval in turns from the פו"ש table (null = unconstrained). */
  interval: number | null;
  /** The force already received its orders this turn. */
  underOrders: boolean;
  /** It may be moved this turn (already ordered, or new orders are due). */
  canManoeuvre: boolean;
  /** Turn its next orders arrive (null = they are due now). */
  nextOrderTurn: number | null;
}

/** "כל תור" / "כל 2 תורות" — order frequency in readable Hebrew. */
function everyNTurns(interval: number): string {
  return interval === 1 ? "כל תור" : `כל ${interval} תורות`;
}

function SelectedUnitCard({
  unit,
  orderInfo,
  order,
  nameOf,
}: {
  unit: Unit | null;
  orderInfo: OrderInfo | null;
  /** The order the force is working to — what it will do again next turn. */
  order: StandingOrder | undefined;
  nameOf: (id: string) => string;
}) {
  if (!unit) return <div className="unit-card empty">לא נבחר כוח</div>;
  return (
    <div className="unit-card">
      <div className="unit-name">
        {unit.name}
        {unit.kind === "command" && <span className="tag">חפ"ק</span>}
      </div>
      {unit.kind === "vehicle" ? (
        <div>
          טנק{unit.vehicle?.destroyed ? " — הושמד" : unit.vehicle?.mobilityKilled ? " — נכשל ניוד" : ""}
        </div>
      ) : (
        <div>כשירים: {fitSoldiers(unit)}/{fullStrength(unit)}</div>
      )}
      {order && (
        <div className="order-line-text">פקודה: {describeStandingOrder(order, nameOf)}</div>
      )}
      {orderInfo && orderInfo.interval != null && (
        <>
          <div className="c2-line">
            מרחק מהחפ"ק: {Math.round(orderInfo.distance)}מ' · פקודות {everyNTurns(orderInfo.interval)}
          </div>
          <div className={orderInfo.canManoeuvre ? "ok" : "warn"}>
            {orderInfo.underOrders
              ? "פועל לפי פקודות התור"
              : orderInfo.canManoeuvre
                ? "ניתן לפקד כעת"
                : `ממשיך בפקודה הקודמת — אין קשר לפקודה חדשה${
                    orderInfo.nextOrderTurn != null ? ` (פקודה חדשה: תור ${orderInfo.nextOrderTurn})` : ""
                  }`}
          </div>
        </>
      )}
      {unit.neutralized && <div className="warn">מנוטרל</div>}
      {unit.movementBlocked && <div className="warn">נפגע — לא יכול לנוע</div>}
      {unit.firedThisTurn && <div className="warn">בוצעה פעולת ירי בתור זה</div>}
      {unit.inFullCover && <div className="ok">במחסה מלא</div>}
    </div>
  );
}

function Roster({
  units,
  selectedId,
  awaitingOrders,
  onSelect,
}: {
  units: Unit[];
  selectedId: string | null;
  awaitingOrders: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="roster">
      <h4>הכוחות שלי</h4>
      <ul>
        {units.map((u) => (
          <li
            key={u.id}
            className={`${u.id === selectedId ? "sel" : ""} ${u.neutralized ? "dead" : ""} ${
              awaitingOrders.has(u.id) ? "no-orders" : ""
            }`}
            onClick={() => onSelect(u.id)}
          >
            {u.name} —{" "}
            {u.kind === "vehicle" ? "טנק" : `${fitSoldiers(u)}/${fullStrength(u)}`}
            {u.firedThisTurn && " · ירה"}
            {awaitingOrders.has(u.id) && ' · בפקודה קודמת'}
          </li>
        ))}
      </ul>
    </div>
  );
}
