import { useReducer, useRef, useState } from "react";
import {
  MOVEMENT_PROFILES,
  distance,
  fitSoldiers,
  fullStrength,
  orderInterval,
  type Side,
  type Unit,
} from "../engine/index.js";
import { buildDemoScenario, type Scenario } from "./scenario.js";
import {
  buildActivations,
  computeRevealed,
  isGone,
  sideDefeated,
  type Activation,
  type LogEntry,
} from "./hotseat.js";
import { MapView } from "./components/MapView.js";
import { LogPanel } from "./components/LogPanel.js";
import { Handoff } from "./components/Handoff.js";

type Gait = "normal" | "run";
type SmallArm = "smallArms" | "sustainedMg";
type Stage = "initiative" | "activation" | "gameover";

const phaseLabelHe: Record<"movement" | "combat", string> = {
  movement: "שלב תנועה",
  combat: "שלב ירי",
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
  const [winner, setWinner] = useState<Side | null>(null);

  function pushLog(text: string, kind: LogEntry["kind"], side?: Side) {
    setLog((l) => [...l, { id: ++logIdRef.current, turn: game.turn, text, kind, ...(side ? { side } : {}) }]);
  }

  const currentActivation =
    stage === "activation" && actIndex < activations.length ? activations[actIndex] : null;
  const viewingSide: Side = currentActivation?.side ?? activations[0]?.side ?? "BLUE";
  const enginePhase: "movement" | "combat" | "other" = currentActivation?.phase ?? "other";

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
    game.advanceToPhase("movement");
    setStage("activation");
    setActIndex(0);
    setHandoffTo(activations[0]!.side);
    force();
  }

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
      if (selectedOwn.kind === "vehicle") {
        const r = game.fireExplosive("tankRound", selectedOwn.id, target.id, {
          hasLineOfSight: true,
        });
        if (!r.fired) pushLog(`${selectedOwn.name}: ${reason(r.reason)}`, "fire", viewingSide);
        else if (!r.hit) pushLog(`${selectedOwn.name} ירה פגז — החטאה`, "fire", viewingSide);
        else pushLog(`${selectedOwn.name} פגע ב${target.name} בפגז טנק`, "casualty", viewingSide);
      } else {
        const r = game.fire(selectedOwn.id, target.id, {
          weapon,
          cover: target.inFullCover ? "full" : "none",
          hasLineOfSight: true,
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
      if (activations[actIndex]!.phase === "movement" && activations[next]!.phase === "combat") {
        game.advanceToPhase("combat");
        pushLog("מעבר לשלב ירי", "phase");
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
              onSelectUnit={handleSelect}
              onFireAt={handleFireAt}
              onMoveTo={handleMoveTo}
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
