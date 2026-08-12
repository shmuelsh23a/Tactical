import { useReducer, useRef, useState } from "react";
import {
  MOVEMENT_PROFILES,
  SMOKE_DURATION_TURNS,
  SMOKE_RADIUS_M,
  distance,
  fitSoldiers,
  fullStrength,
  orderInterval,
  type IndirectFireResult,
  type Side,
  type SmokeScreen,
  type SmokeSource,
  type Unit,
} from "../engine/index.js";
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
import { MapView } from "./components/MapView.js";
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
  const [grenades, setGrenades] = useState(1);
  const [winner, setWinner] = useState<Side | null>(null);

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
    if (!selectedCanManoeuvre) {
      const next = game.nextOrderTurn(selectedOwn.id);
      pushLog(
        `${selectedOwn.name} ממתין לפקודות מהחפ"ק — לא ניתן לתמרן בתור זה` +
          (next != null ? ` (פקודה הבאה: תור ${next})` : ""),
        "info",
        viewingSide,
      );
      return;
    }
    const hadOrders = game.isUnderOrders(selectedOwn.id);
    try {
      const det = game.moveUnit(selectedOwn.id, { x, y }, gait);
      pushLog(`${selectedOwn.name} נע (${gait === "run" ? "ריצה" : "רגיל"})`, "move", viewingSide);
      // Moving consumes the force's orders; say so when the next set is not due
      // straight away, so the player can plan the חפ"ק's position around it.
      const next = game.nextOrderTurn(selectedOwn.id);
      if (!hadOrders && next != null && next > game.turn + 1) {
        pushLog(`${selectedOwn.name} קיבל פקודות — הבאות בתור ${next}`, "info", viewingSide);
      }
      if (det.spottedUnitIds.length) {
        pushLog(`גילוי: ${det.spottedUnitIds.join(", ")}`, "info", viewingSide);
      }
      if (det.foundMineIds.length) {
        pushLog(`התגלו מטענים: ${det.foundMineIds.length}`, "info", viewingSide);
      }
    } catch (err) {
      pushLog((err as Error).message, "info", viewingSide);
    }
    force();
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

    try {
      // Line of sight is left to the engine, which checks the shot against the
      // smoke on the map.
      if (selectedOwn.kind === "vehicle") {
        const r = game.fireExplosive("tankRound", selectedOwn.id, target.id);
        if (!r.fired) pushLog(`${selectedOwn.name}: ${reason(r.reason)}`, "fire", viewingSide);
        else if (!r.hit) pushLog(`${selectedOwn.name} ירה פגז — החטאה`, "fire", viewingSide);
        else pushLog(`${selectedOwn.name} פגע ב${target.name} בפגז טנק`, "casualty", viewingSide);
      } else {
        const r = game.fire(selectedOwn.id, target.id, {
          weapon,
          cover: target.inFullCover ? "full" : "none",
        });
        if (!r.fired) {
          pushLog(`${selectedOwn.name}: ${reason(r.reason)}`, "fire", viewingSide);
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

  return (
    <div className="app">
      <header className="topbar">
        <h1>{scn.title}</h1>
        <div className="turn-info">
          <span>תור {game.turn}</span>
          <span className="sep">·</span>
          <span>יוזמה: {activations.map((a) => a.side).filter((s, i, arr) => arr.indexOf(s) === i).join(" → ")}</span>
        </div>
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
              smoke={game.smoke}
              pendingFire={game.pendingFire.filter((m) => m.side === viewingSide)}
              pendingSmoke={smokeInFlight}
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
                  <p className="hint">
                    בחר כוח, ולחץ על המפה כדי לנוע (בתוך הטווח המסומן). כוח המסומן
                    בעיגול מקווקו ממתין לפקודות ואינו יכול לתמרן — קרב את החפ"ק אליו.
                  </p>
                </div>
              )}

              {currentActivation.phase === "combat" && (
                <div className="controls">
                  <label>אמצעי ירי:</label>
                  <div className="seg">
                    <button className={weapon === "smallArms" ? "on" : ""} onClick={() => setWeapon("smallArms")}>
                      נק"ל
                    </button>
                    <button className={weapon === "sustainedMg" ? "on" : ""} onClick={() => setWeapon("sustainedMg")}>
                      מקלע
                    </button>
                  </div>
                  <p className="hint">בחר כוח, ולחץ על אויב מסומן כדי לירות.</p>
                </div>
              )}

              <SelectedUnitCard unit={selectedOwn} orderInfo={orderInfo} />

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

function reason(r?: string): string {
  switch (r) {
    case "out of range":
      return "מחוץ לטווח";
    case "no line of sight":
      return "אין קו ראייה";
    case "small arms ineffective vs armour":
      return "נשק קל לא יעיל מול שריון";
    case "below minimum range":
      return "מתחת לטווח מינימלי";
    case "no fit shooters":
      return "אין יורים כשירים";
    default:
      return r ?? "לא ניתן לירות";
  }
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

function SelectedUnitCard({ unit, orderInfo }: { unit: Unit | null; orderInfo: OrderInfo | null }) {
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
      {orderInfo && orderInfo.interval != null && (
        <>
          <div className="c2-line">
            מרחק מהחפ"ק: {Math.round(orderInfo.distance)}מ' · פקודות {everyNTurns(orderInfo.interval)}
          </div>
          <div className={orderInfo.canManoeuvre ? "ok" : "warn"}>
            {orderInfo.underOrders
              ? "פועל לפי פקודות התור"
              : orderInfo.canManoeuvre
                ? "ממתין לפקודה — ניתן לתמרן"
                : `ממתין לפקודות — לא ניתן לתמרן${
                    orderInfo.nextOrderTurn != null ? ` (פקודה הבאה: תור ${orderInfo.nextOrderTurn})` : ""
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
            {awaitingOrders.has(u.id) && ' · ממתין לפקודות'}
          </li>
        ))}
      </ul>
    </div>
  );
}
