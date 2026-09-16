import { useReducer, useRef, useState } from "react";
import {
  ASSAULT_RANGE_M,
  CAMOUFLAGE,
  CHARGE_LAYING,
  DIG_IN,
  MOVEMENT_PROFILES,
  OBSERVATION_SECTOR,
  SCOUTING,
  SMOKE_DURATION_TURNS,
  SMOKE_RADIUS_M,
  camouflageBonus,
  distance,
  fitSoldiers,
  fullStrength,
  orderInterval,
  replayGame,
  sealRecording,
  sectorBonus,
  verifyRecording,
  type ChargeWorkReport,
  type CoveringFireResult,
  type GameRecording,
  type IndirectFireResult,
  type Observation,
  type Side,
  type SmokeScreen,
  type SmokeSource,
  type StandingOrder,
  type Unit,
  coverFromObjects,
  groundHeight,
  type Terrain,
} from "../engine/index.js";
import {
  casualtyReport,
  chargeHe,
  chargeWorkHe,
  coveringFireHe,
  describeExecution,
  describeSector,
  describeBound,
  describeStandingOrder,
  isRoutineOrderReason,
  reasonHe,
  sectorWorthHe,
} from "./debriefText.js";
import { buildDemoScenario, type Scenario } from "./scenario.js";
import {
  buildActivations,
  computeRevealed,
  disclose,
  hasEyesOn,
  isGone,
  sideDefeated,
  sideView,
  SIDES,
  type Activation,
  type ActivationPhase,
  type Audience,
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
 * What an order tells a force to do about the enemy, over and above where to
 * go: nothing in particular, engage a named force, or hold its fire until the
 * order is replaced (rules decisions 6 and 12).
 */
type OrderTask = "advance" | "engage" | "holdFire";

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
      readers: SIDES,
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
  /** Range at which a force holding its fire may open up; null = any range. */
  const [engagementRange, setEngagementRange] = useState<number | null>(null);
  const [grenades, setGrenades] = useState(1);
  /**
   * While on, a click on the map points the selected force's sector of
   * observation instead of ordering it somewhere — the two are both "click a
   * place on the map", so the player has to say which one they mean.
   */
  const [aimingSector, setAimingSector] = useState(false);
  const [sectorWidth, setSectorWidth] = useState<number>(OBSERVATION_SECTOR.defaultWidth);
  const [winner, setWinner] = useState<Side | null>(null);
  /** A loaded recording being reviewed; the game is left untouched behind it. */
  const [debrief, setDebrief] = useState<GameRecording | null>(null);

  // One fire mission and one smoke screen per side per turn (see README rules
  // decision 8) — keyed `SIDE-he` / `SIDE-smoke` to the turn it was spent on.
  const missionsUsed = useRef<Record<string, number>>({});
  const missionSpent = (side: Side, kind: Mission) =>
    missionsUsed.current[`${side}-${kind}`] === game.turn;

  /**
   * Write a line of the live log **and say who may read it** (rules decision
   * 17). The audience is required: both players read this one list across a
   * handoff, so a line without one would be a line the enemy reads by default
   * — which is exactly the hole this closes.
   */
  function pushLog(text: string, kind: LogEntry["kind"], audience: Audience) {
    const { readers, side } = disclose(audience);
    setLog((l) => [
      ...l,
      { id: ++logIdRef.current, turn: game.turn, text, kind, readers, ...(side ? { side } : {}) },
    ]);
  }

  /** The umpire's bookkeeping: the turn, the phase, the result of the battle. */
  const TABLE: Audience = { to: "table" };
  /** Taken behind one side's own lines — orders, postures, what it picked up. */
  const onlyFor = (side: Side): Audience => ({ to: "side", side });
  /** An exchange both sides were in, in words both are entitled to. */
  const sharedBy = (by: Side): Audience => ({ to: "both", by });

  /**
   * One line per reader, worded as each is entitled to read it (rules decisions
   * 13 and 17): the owner of a force that took losses counts them, anybody
   * watching gets a report, and a side that was not watching gets `null` and no
   * line at all. Only one of the copies can ever reach a given screen.
   */
  function pushPerSide(kind: LogEntry["kind"], by: Side, text: (reader: Side) => string | null) {
    for (const reader of SIDES) {
      const line = text(reader);
      if (line != null) pushLog(line, kind, { to: "side", side: reader, by });
    }
  }

  /**
   * Whether `reader` is entitled to know what became of `unit`: its own force
   * always, an enemy's only while it is holding a contact on it. The live
   * counterpart of the debrief's lens (rules decision 13).
   *
   * **A stale mark is not a sighting.** `game.knows` says a contact record
   * exists, not that anybody is looking now — and decision 13 is explicit that
   * a stale contact carries the state it was last seen in, "a squad neutralised
   * after it dropped out of sight still reads as a live mark until somebody
   * looks again". So the enemy branch asks for a report from *this* turn, the
   * same `seenNow` test `sideView` draws the map with. Without it a side would
   * read `נראה מנוטרל` in the log off a three-turn-old mark that its own map
   * still draws alive — two halves of one rule measured off different geometry,
   * which is the trap this repo keeps paying for.
   *
   * Without the knowledge model the ledger is never written, so `knows` would
   * answer "no" forever and a side would be told nothing about a force it can
   * see drawn on its own map. `sideView` has the same fallback for the same
   * reason: the flat spotting radius stands in for the ledger.
   */
  const mayKnowOf = (reader: Side, unit: Unit) => {
    if (unit.side === reader) return true;
    if (!game.trackIntel) return computeRevealed(game, reader).has(unit.id);
    const contact = game.contactFor(reader, unit.id);
    return contact != null && contact.lastSeenTurn >= game.turn;
  };

  const currentActivation =
    stage === "activation" && actIndex < activations.length ? activations[actIndex] : null;
  const viewingSide: Side = currentActivation?.side ?? activations[0]?.side ?? "BLUE";
  const enginePhase: ActivationPhase | "other" = currentActivation?.phase ?? "other";

  // Everything the player sees comes from here: their own forces, plus the
  // enemy they have actually detected, each drawn where it was last seen.
  const { units: visibleUnits, staleIds } = sideView(game, viewingSide);
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
  // `lossesOf` lived here: it worded losses from whoever happened to be at the
  // screen and then wrote that line for the whole table, which is how a RED
  // casualty count reached BLUE. A line both sides read is now worded once per
  // reader instead (`pushPerSide`) — rules decision 17.
  /** Enemies this side can currently see — the only ones an order may name. */
  const visibleEnemies = visibleUnits.filter((u) => u.side !== viewingSide && !u.neutralized);
  const selectedOrder = selectedOwn ? game.standingOrderFor(selectedOwn.id) : undefined;

  /** The engage task the order controls are currently set to, if any. */
  function orderedEngagement(): StandingOrder["engage"] | undefined {
    if (orderTask === "advance" || !orderTargetId) return undefined;
    const target = visibleEnemies.find((u) => u.id === orderTargetId);
    return target ? { targetId: target.id, weapon: orderWeapon } : undefined;
  }

  /** The task part of an order, as the panel currently reads. */
  function orderedTask(): Pick<StandingOrder, "engage" | "holdFire"> {
    if (orderTask !== "holdFire") return { engage: orderedEngagement() };
    // A held force opens up on the nearest enemy inside its line unless the
    // order names one — so the target list is offered here too.
    return {
      holdFire: true,
      ...(engagementRange != null ? { engagementRange } : {}),
      ...(orderedEngagement() ? { engage: orderedEngagement() } : {}),
    };
  }

  /** A scouting force walks, so the range ring must show the walk. */
  const scoutingSelected = selectedOwn?.scouting ?? false;
  const effectiveGait: Gait = scoutingSelected ? "normal" : gait;
  const moveCap =
    selectedOwn && enginePhase === "movement" && selectedCanManoeuvre
      ? Math.max(
          0,
          MOVEMENT_PROFILES[effectiveGait].maxDistance * (selectedOwn.underFire ? 0.5 : 1) -
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
        onlyFor(viewingSide),
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
          // A screen the enemy can see is on the map; that *this* side laid it,
          // from what, and when the next one arrives, is its own fire plan.
          onlyFor(viewingSide),
        );
      } else {
        const m = game.queueIndirectFire(tube, viewingSide, { x, y });
        pushLog(
          `משימת אש — ${tubeHe[tube]}, פגיעה צפויה בתור ${m.resolvesOnTurn}`,
          "fire",
          onlyFor(viewingSide),
        );
      }
      missionsUsed.current[`${viewingSide}-${mission}`] = game.turn;
    } catch (err) {
      pushLog((err as Error).message, "info", onlyFor(viewingSide));
    }
    force();
  }

  /**
   * Report what a side's forces in position have just picked up — first sight
   * only. Standing observation re-finds the same force every turn, so only the
   * first report is news, and without it a contact would appear on the map with
   * nothing in the log to explain it.
   */
  const reported = useRef(new Set<string>());
  function logNewContacts(observed: Observation[]) {
    for (const { observerId, targetId } of observed) {
      const observer = game.units.find((u) => u.id === observerId);
      if (!observer) continue;
      const key = `${observer.side}:${targetId}`;
      if (reported.current.has(key)) continue;
      reported.current.add(key);
      // That it has been spotted, and by whom, is the one thing a force does
      // not learn (rules decision 17).
      pushLog(`${observer.name} איתר את ${nameOf(targetId)}`, "info", onlyFor(observer.side));
    }
  }

  /**
   * Report what became of each force's charge-laying work as the turn closed
   * (rules decision 16) — the charge that went in, or the work that was lost.
   *
   * **And where**, now that the log is filtered (rules decision 17). Decision
   * 16 left the position off this line because every entry was readable from
   * both sides of the table; the line is written for the laying side alone, so
   * it says what the debrief has always been allowed to say.
   */
  function logChargeWork(reports: ChargeWorkReport[]) {
    for (const report of reports) {
      const unit = game.units.find((u) => u.id === report.unitId);
      if (!unit) continue;
      pushLog(chargeWorkHe(report, unit.name), report.mine ? "info" : "fire", onlyFor(unit.side));
    }
  }

  /**
   * Log indirect fire and smoke that arrived while stepping between phases.
   *
   * A screen on the map and a round coming down are plain to the whole table.
   * **How far the round fell from its aim point is not** — that measures the
   * shell against the gunner's own aim, so only the side that called the
   * mission is told it (rules decision 17). Who it caught follows the same rule
   * as any other loss: its owner counts, a watcher gets a report, and a side
   * with no eyes on the force is told nothing about it at all.
   */
  function logCoveringFire(shots: CoveringFireResult[]) {
    for (const shot of shots) {
      if (!shot.result.fired) continue;
      const coverer = game.units.find((u) => u.id === shot.coveringId);
      const target = game.units.find((u) => u.id === shot.targetId);
      if (!coverer || !target) continue;
      // Both forces in it are entitled to a line — the one that fired counts
      // its own effect, the one that walked into it knows it was shot at — and
      // a third side gets nothing (rules decisions 13, 17 and 18). An ambush
      // springing is the loudest thing on the map; what it achieved is still
      // only the firer's to count.
      pushPerSide("fire", coverer.side, (reader) => {
        // Who may *see* the shot is the coverer's business; how exactly the
        // losses are counted is the **target's** owner's, because they are his
        // men (rules decision 13). Keying both off the firer told a side its
        // own casualties were "observed" rather than counted.
        const sawTheFirer = reader === coverer.side || mayKnowOf(reader, coverer);
        if (!sawTheFirer) {
          return reader === target.side ? `${nameOf(shot.targetId)} נתקל באש חיפוי!` : null;
        }
        return coveringFireHe(shot, nameOf, reader === target.side);
      });
    }
  }

  function logImpacts(resolved: IndirectFireResult[], smokeArrived: SmokeScreen[]) {
    for (const s of smokeArrived) {
      pushLog(`מסך עשן ירד — רדיוס ${s.radius}מ', ${s.turnsRemaining} תורות`, "fire", TABLE);
    }
    for (const r of resolved) {
      const off = Math.round(distance(r.aim, r.dispersion.impact));
      const weapon = tubeHe[r.weapon as Tube] ?? r.weapon;
      const fell = `${weapon}: נחיתה`;
      if (r.side) {
        pushPerSide("fire", r.side, (reader) =>
          reader !== r.side
            ? fell
            : off > 0
              ? `${weapon}: נחיתה בסטייה של ${off}מ' מהמטרה`
              : `${weapon}: פגיעה מדויקת במטרה`,
        );
      } else {
        pushLog(fell, "fire", TABLE);
      }
      for (const hit of r.blast.targets) {
        if (!hit.caught) continue;
        const victim = game.units.find((u) => u.id === hit.unitId);
        if (!victim) continue;
        logLosses(victim, hit.newCasualties, hit.damage, hit.neutralized, r.side, `נפגע מ${weapon}`);
      }
    }
    if (resolved.length) checkVictory();
  }

  /**
   * What a force caught, worded for each side that is entitled to hear it
   * (rules decisions 13 and 17): its owner reads the exact damage and count, a
   * side watching it reads a report, and a side with no contact on it reads
   * nothing. `by` is whose colour the line flies — the side that caused it,
   * where there is one.
   */
  function logLosses(
    victim: Unit,
    casualties: number,
    damage: number,
    neutralized: boolean,
    by: Side | undefined,
    what: string,
  ) {
    pushPerSide("casualty", by ?? victim.side, (reader) => {
      if (!mayKnowOf(reader, victim)) return null;
      return victim.side === reader
        ? `${victim.name} ${what}: ${damage} נק"פ, ${casualties} נפגעים`
        : `${victim.name} ${what} — ${casualtyReport(casualties, false)}`;
    });
    if (!neutralized) return;
    pushPerSide("casualty", by ?? victim.side, (reader) => {
      if (!mayKnowOf(reader, victim)) return null;
      return victim.side === reader ? `${victim.name} נוטרל!` : `${victim.name} נראה מנוטרל`;
    });
  }

  const smokeInFlight = game.pendingSmoke.filter((m) => m.side === viewingSide);
  // A side knows its own charges; the enemy's only once they have been spotted.
  const knownMines = game.mines.filter((m) => m.side === viewingSide || m.detected);

  function handleSelect(id: string) {
    const u = game.units.find((x) => x.id === id);
    if (u && u.side === viewingSide) {
      setSelectedId(id);
      // A half-laid sector belongs to the force it was being laid for.
      setAimingSector(false);
    }
  }

  function handleMoveTo(x: number, y: number) {
    if (!selectedOwn || enginePhase !== "movement") return;
    // Same click, two meanings: while the player is laying a sector it points
    // the force's attention rather than sending it anywhere.
    if (aimingSector) {
      aimSectorAt(selectedOwn, x, y);
      return;
    }
    // The חפ"ק is the player's own command post: he moves it himself. Everyone
    // else is given an order, which the engine then carries out — this turn and
    // every turn after, until it is replaced (rules decision 6).
    if (selectedOwn.kind === "command") {
      moveCommandGroup(selectedOwn, x, y);
      return;
    }
    issueOrder(selectedOwn, { gait: effectiveGait, destination: { x, y }, ...orderedTask() });
  }

  /**
   * Tell the selected force which way to look (גזרת תצפית): better inside the
   * arc, worse outside it, so it is an allocation of attention rather than a
   * bonus (rules decision 14). The bearing is taken from the force to the point
   * clicked, and is absolute — displacing does not re-aim it.
   */
  function aimSectorAt(unit: Unit, x: number, y: number) {
    game.watchTowards(unit.id, { x, y }, sectorWidth);
    const sector = game.getUnit(unit.id).observationSector!;
    pushLog(`${unit.name} — גזרת תצפית: ${describeSector(sector)}`, "info", onlyFor(viewingSide));
    setAimingSector(false);
    force();
  }

  /** Release the force to watch all round: no better anywhere, no worse. */
  function handleClearSector() {
    if (!selectedOwn || enginePhase !== "movement") return;
    game.setObservationSector(selectedOwn.id, null);
    pushLog(`${selectedOwn.name} — תצפית מעגלית`, "info", onlyFor(viewingSide));
    setAimingSector(false);
    force();
  }

  /**
   * Set the selected force to work on its camouflage, or stop. It builds up
   * while the force stays put and is thrown away the moment it moves, so this
   * is a posture rather than an action (rules decision 12).
   */
  function handleCamouflage() {
    if (!selectedOwn || enginePhase !== "movement") return;
    const on = !selectedOwn.camouflaging;
    game.setCamouflage(selectedOwn.id, on);
    pushLog(
      on
        ? `${selectedOwn.name} מסווה את עמדתו`
        : `${selectedOwn.name} הפסיק הסוואה — ההסוואה שנצברה אבדה`,
      "info",
      onlyFor(viewingSide),
    );
    force();
  }

  /**
   * Send the selected force out scouting, or call it in (סיור): it looks harder
   * and walks while it does (rules decision 12).
   */
  function handleScouting() {
    if (!selectedOwn || enginePhase !== "movement") return;
    const on = !selectedOwn.scouting;
    game.setScouting(selectedOwn.id, on);
    pushLog(
      on
        ? `${selectedOwn.name} יוצא לסיור — תנועה בהליכה בלבד`
        : `${selectedOwn.name} חוזר מסיור`,
      "info",
      onlyFor(viewingSide),
    );
    force();
  }

  /**
   * Set the selected force to laying a charge where it stands, or call the
   * work off (rules decision 16). It takes {@link CHARGE_LAYING.turnsToLay}
   * turns of standing still and staying out of the fight, and only a force
   * trained for it may start.
   */
  function handleLayCharge(type: "antiPersonnel" | "antiTank") {
    if (!selectedOwn || enginePhase !== "movement") return;
    // The same button calls the work off when it is already laying that kind;
    // the other button switches, which starts the count again from nothing.
    const stopping = selectedOwn.layingCharge?.type === type;
    const switching = selectedOwn.layingCharge && !stopping;
    try {
      game.layCharge(selectedOwn.id, stopping ? null : type);
    } catch (e) {
      pushLog(`${selectedOwn.name} — ${reasonHe((e as Error).message)}`, "info", onlyFor(viewingSide));
      return;
    }
    pushLog(
      stopping
        ? `${selectedOwn.name} הפסיק להניח מטען — העבודה אבדה`
        : switching
          ? `${selectedOwn.name} מחליף ל${chargeHe(type)} — העבודה שנצברה אבדה, ${CHARGE_LAYING.turnsToLay} תורות מחדש`
          : `${selectedOwn.name} מתחיל להניח ${chargeHe(type)} — ${CHARGE_LAYING.turnsToLay} תורות`,
      "info",
      onlyFor(viewingSide),
    );
    force();
  }

  /**
   * Put the selected force into חיפוי, or stand it down (rules decision 18).
   * It spends the turn's action, so standing down does not hand it back — the
   * button only stops the force watching.
   */
  function handleCovering() {
    if (!selectedOwn || enginePhase !== "combat") return;
    const on = !selectedOwn.covering;
    try {
      game.setCovering(selectedOwn.id, on, weapon);
    } catch (e) {
      pushLog(`${selectedOwn.name} — ${reasonHe((e as Error).message)}`, "info", onlyFor(viewingSide));
      return;
    }
    pushLog(
      on
        ? `${selectedOwn.name} בחיפוי — יענה לתנועה, לאש או להסתערות`
        : `${selectedOwn.name} ירד מחיפוי — הפעולה לתור זה כבר נוצלה`,
      "info",
      onlyFor(viewingSide),
    );
    force();
  }

  /** Order the force to stay where it is — and, if a task is set, to fight from there. */
  function handleHoldOrder() {
    if (!selectedOwn || enginePhase !== "movement" || selectedOwn.kind === "command") return;
    issueOrder(selectedOwn, { gait: effectiveGait, ...orderedTask() });
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
        onlyFor(viewingSide),
      );
      return;
    }
    const next = game.nextOrderTurn(unit.id);
    game.setStandingOrder(unit.id, order);
    // An order is not something the enemy can watch being given.
    pushLog(`${unit.name} — פקודה: ${describeStandingOrder(order, nameOf)}`, "move", onlyFor(viewingSide));
    if (next != null && next > game.turn + 1) {
      pushLog(`${unit.name} — פקודה חדשה רק בתור ${next}`, "info", onlyFor(viewingSide));
    }
    runStandingOrders();
    force();
  }

  /** The one force the player still drives by hand. */
  function moveCommandGroup(unit: Unit, x: number, y: number) {
    try {
      const { detection: det, coveringFire } = game.moveUnit(unit.id, { x, y }, gait);
      logCoveringFire(coveringFire);
      pushLog(`${unit.name} נע (${gait === "run" ? "ריצה" : "רגיל"})`, "move", onlyFor(viewingSide));
      if (det.spottedUnitIds.length) {
        pushLog(`גילוי: ${det.spottedUnitIds.map(nameOf).join(", ")}`, "info", onlyFor(viewingSide));
      }
    } catch (err) {
      pushLog((err as Error).message, "info", onlyFor(viewingSide));
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
        // The bound, what it picked up and what it walked onto are this side's
        // own business; the enemy reads a move it was watching off the map,
        // where the mark is properly stale (rules decision 17).
        // The bound only: `describeExecution` reports an engagement ahead of a
        // move, so asking it here would print the shot under the move branch
        // and again below if the engine ever sets both in one execution.
        const bound = describeBound(done, nameOf);
        if (bound) pushLog(bound, "move", onlyFor(side));
        const { detection, mineDetonations, coveringFire } = done.moved.result;
        logCoveringFire(coveringFire);
        if (detection.spottedUnitIds.length) {
          pushLog(`גילוי: ${detection.spottedUnitIds.map(nameOf).join(", ")}`, "info", onlyFor(side));
        }
        if (detection.foundMineIds.length) {
          pushLog(`${name} איתר ${detection.foundMineIds.length} מטענים`, "info", onlyFor(side));
        }
        for (const det of mineDetonations) {
          const kind = det.type === "antiTank" ? 'מטען נ"ט' : 'מטען נ"א';
          if (!det.activated) {
            // Nothing happened and nothing was heard: a dud is noticed only by
            // the force that trod on it.
            pushLog(`${name} דרך על ${kind} — לא הופעל`, "info", onlyFor(side));
            continue;
          }
          // Who it went off *under* is news only to a side holding a contact on
          // that force. **That it went off at all reaches the layer if he can
          // see it happen** — ruled by the author 2026-09-16: line of sight,
          // not ownership. A charge is not a telephone; a layer watching the
          // ground he mined sees the explosion, and one who has moved off
          // behind a crest learns nothing until he goes and looks (rules
          // decision 17). Seeing is weaker than having found the force, so he
          // is told his charge fired and not who trod on it.
          if (unit) {
            pushPerSide("casualty", side, (reader) =>
              mayKnowOf(reader, unit)
                ? `${kind} התפוצץ תחת ${name}!`
                : reader === det.side && hasEyesOn(game, reader, unit)
                  ? `${kind} שהונח הופעל`
                  : null,
            );
          }
          for (const hit of det.blast?.targets ?? []) {
            if (!hit.caught) continue;
            const victim = game.units.find((u) => u.id === hit.unitId);
            if (!victim) continue;
            logLosses(victim, hit.newCasualties, hit.damage, hit.neutralized, side, `נפגע מ${kind}`);
          }
        }
      }
      if (done.engaged) {
        const engagement = done.engaged;
        const engaged = game.units.find((u) => u.id === engagement.targetId);
        // Being fired on is always known, and firing puts the firer on the
        // target's map anyway (rules decision 13) — so an engagement under
        // orders crosses, worded as each side is entitled to read it.
        pushPerSide(engagement.newCasualties > 0 ? "casualty" : "fire", side, (reader) =>
          describeExecution(done, nameOf, engaged?.side === reader ? "target" : "firer"),
        );
        if (engaged?.neutralized) {
          const down = engaged;
          pushPerSide("casualty", side, (reader) =>
            mayKnowOf(reader, down)
              ? `${down.name} ${down.side === reader ? "נוטרל!" : "נראה מנוטרל"}`
              : null,
          );
        }
      }
      if (done.reason && !isRoutineOrderReason(done.reason)) {
        pushLog(`${name}: ${reasonHe(done.reason)}`, "info", onlyFor(side));
      }
    }
    checkVictory();
  }

  function handleFireAt(enemyId: string) {
    if (!selectedOwn || enginePhase !== "combat") return;
    // One action per force per fire phase. (A command group may fire too, but
    // only with its small personnel — i.e. fitSoldiers attack rolls.)
    if (selectedOwn.firedThisTurn) {
      pushLog(`${selectedOwn.name} כבר ביצע פעולה בשלב הירי`, "fire", onlyFor(viewingSide));
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
        // A shot that was never taken is the firer's own bookkeeping; a round
        // going downrange is an exchange both sides are in (decisions 13, 17).
        if (!r.fired) pushLog(`${selectedOwn.name}: ${reasonHe(r.reason)}`, "fire", onlyFor(viewingSide));
        else if (!r.hit) pushLog(`${selectedOwn.name} ירה פגז — החטאה`, "fire", sharedBy(viewingSide));
        else
          pushLog(
            `${selectedOwn.name} פגע ב${target.name} בפגז טנק`,
            "casualty",
            sharedBy(viewingSide),
          );
      } else {
        // Cover is the engine's business: it knows what the target is behind,
        // and the player is not entitled to read it off the map.
        const r = game.fire(selectedOwn.id, target.id, { weapon });
        logCoveringFire(r.coveringFire);
        if (!r.fired) {
          pushLog(`${selectedOwn.name}: ${reasonHe(r.reason)}`, "fire", onlyFor(viewingSide));
        } else {
          // The two readers are told different things, and not just in tone.
          // **How many of its men fired and at what chance is the firer's own
          // business** (rules decision 13) — `shooters` is the force's exact
          // fit strength, so printing it at the target would hand over, every
          // turn, the very state the casualty bands exist to hide. The target
          // is told what landed on its own men instead, which is what
          // `describeExecution` gives it in the debrief.
          const who = `${selectedOwn.name} → ${target.name}`;
          pushPerSide(r.newCasualties > 0 ? "casualty" : "fire", viewingSide, (reader) =>
            target.side === reader
              ? `${who}: ${r.hits} פגיעות — ${casualtyReport(r.newCasualties, true)}`
              : `${who}: ${r.shooters} יורים ב-${Math.round(r.hitChance * 100)}% — ${casualtyReport(
                  r.newCasualties,
                  false,
                )}`,
          );
        }
      }
      if (target.neutralized) {
        pushPerSide("casualty", viewingSide, (reader) =>
          !mayKnowOf(reader, target)
            ? null
            : target.side === reader
              ? `${target.name} נוטרל!`
              : `${target.name} נראה מנוטרל`,
        );
      }
    } catch (err) {
      pushLog((err as Error).message, "fire", onlyFor(viewingSide));
    }
    checkVictory();
    force();
  }

  /** Go in on a neighbouring force: assault fire plus however many grenades. */
  function handleAssault(attacker: Unit, target: Unit) {
    try {
      const r = game.assault(attacker.id, target.id, grenades);
      logCoveringFire(r.coveringFire);
      if (!r.fired) {
        pushLog(`${attacker.name}: ${reasonHe(r.reason)}`, "fire", onlyFor(viewingSide));
      } else {
        // Same split as direct fire: what the attacker threw is its own
        // ammunition state, what landed is the defender's to count.
        const went = `${attacker.name} הסתער על ${target.name}`;
        pushPerSide(r.defenderCasualties > 0 ? "casualty" : "fire", viewingSide, (reader) =>
          target.side === reader
            ? `${went}: ${r.fireHits} פגיעות אש` +
              (r.grenadeHits > 0 ? `, ${r.grenadeHits} פגיעות רימון` : "") +
              `, ${casualtyReport(r.defenderCasualties, true)}`
            : `${went}` +
              (grenades > 0 ? ` עם ${grenades} רימונים` : "") +
              `, ${casualtyReport(r.defenderCasualties, false)}`,
        );
        if (r.selfCasualties > 0) {
          // What a force did to itself with its own grenades is its own to know.
          pushLog(
            `${attacker.name} ספג ${r.selfCasualties} נפגעים מרימוני עצמו`,
            "casualty",
            onlyFor(viewingSide),
          );
        }
        if (r.defenderNeutralized) {
          pushPerSide("casualty", viewingSide, (reader) =>
            !mayKnowOf(reader, target)
              ? null
              : target.side === reader
                ? `${target.name} נוטרל!`
                : `${target.name} נראה מנוטרל`,
          );
        }
      }
    } catch (err) {
      pushLog((err as Error).message, "fire", onlyFor(viewingSide));
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
    pushLog(`הקרב נשמר להקלטה (${recording.actions.length} פעולות)`, "info", TABLE);
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
          TABLE,
        );
      }
      setDebrief(parsed);
    } catch (err) {
      pushLog(`טעינת ההקלטה נכשלה: ${(err as Error).message}`, "info", TABLE);
      force();
    }
  }

  function checkVictory() {
    for (const side of ["RED", "BLUE"] as Side[]) {
      if (sideDefeated(game, side)) {
        const win = side === "RED" ? "BLUE" : "RED";
        setWinner(win);
        setStage("gameover");
        pushLog(`צד ${side} נוטרל — ניצחון ל${win}`, "info", TABLE);
      }
    }
  }

  function handleEndActivation() {
    setSelectedId(null);
    // The task is about the force in front of the player, not a standing panel
    // setting: handing over with "hold fire" still selected would quietly put
    // the next side's forces under it.
    setOrderTask("advance");
    setOrderTargetId(null);
    // …and a sector half-laid belongs to the force that was selected, not to
    // whoever the next side clicks on first.
    setAimingSector(false);
    const next = actIndex + 1;
    if (next < activations.length) {
      const from = activations[actIndex]!.phase;
      const to = activations[next]!.phase;
      if (from !== to) {
        // Stepping into movement crosses resolvePriorArty, where fire missions
        // marked on an earlier turn come down.
        const { resolved, smokeArrived, observed } = game.advanceToPhase(to);
        pushLog(`מעבר ל${phaseLabelHe[to]}`, "phase", TABLE);
        logImpacts(resolved, smokeArrived);
        logNewContacts(observed);
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
      logChargeWork(game.advanceToPhase("initiative").chargeWork);
      const order = game.initiativeOrder;
      setActivations(buildActivations(order));
      setActIndex(0);
      setStage("initiative");
      pushLog(`תור ${game.turn} — יוזמה: ${order.join(" → ")}`, "info", TABLE);
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
          {/* The data terms ask for this on the map itself, not only in a file header. */}
          <div className="attribution">
            © OpenStreetMap contributors (ODbL) · Terrain Tiles courtesy of Mapzen · SRTM (NASA)
          </div>
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
              terrain={game.terrain}
              units={visibleUnits}
              viewingSide={viewingSide}
              selectedId={selectedId}
              phase={enginePhase}
              moveCap={moveCap}
              staleContactIds={staleIds}
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
                .flatMap((u) => orderOverlay(game.standingOrderFor(u.id), u, visibleUnits))}
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
                    <button
                      className={gait === "run" && !scoutingSelected ? "on" : ""}
                      disabled={scoutingSelected}
                      title={scoutingSelected ? "כוח בסיור נע בהליכה בלבד" : undefined}
                      onClick={() => setGait("run")}
                    >
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
                    <button
                      className={orderTask === "holdFire" ? "on" : ""}
                      onClick={() => setOrderTask("holdFire")}
                      title="הכוח לא יפתח באש עד לפקודה חדשה — כך שלא יתגלה בירי"
                    >
                      אחזקת אש
                    </button>
                  </div>

                  {orderTask === "holdFire" && (
                    <>
                      <label>פתיחה באש בטווח:</label>
                      <div className="seg seg-wrap">
                        <button
                          className={engagementRange == null ? "on" : ""}
                          onClick={() => setEngagementRange(null)}
                        >
                          כלל לא
                        </button>
                        {[300, 200, 100, 50].map((r) => (
                          <button
                            key={r}
                            className={engagementRange === r ? "on" : ""}
                            onClick={() => setEngagementRange(r)}
                          >
                            {r}מ'
                          </button>
                        ))}
                      </div>
                      <p className="hint">
                        {engagementRange == null ? (
                          <>
                            הכוח לא יירה כלל — גם לא בלחיצה שלך — עד שתינתן פקודה אחרת.
                            ירי מסגיר את מיקום הכוח לאויב, ולכן זו הפקודה ששומרת על מארב.
                          </>
                        ) : (
                          <>
                            הכוח שותק עד שאויב ייכנס לטווח {engagementRange}מ', ואז יפתח באש
                            מעצמו על {orderTargetId ? "המטרה המיועדת" : "האויב הקרוב ביותר"} —
                            כך נפרץ מארב.
                          </>
                        )}
                      </p>
                    </>
                  )}

                  {orderTask !== "advance" &&
                    (visibleEnemies.length === 0 ? (
                      orderTask === "engage" ? (
                        <p className="hint warn">אין אויב מזוהה — אי אפשר לקבוע מטרה בפקודה.</p>
                      ) : null
                    ) : (
                      <>
                        <label>
                          {orderTask === "holdFire" ? "מטרה מיועדת:" : "מטרה לתקיפה:"}
                        </label>
                        <div className="seg seg-wrap">
                          {orderTask === "holdFire" && (
                            <button
                              className={orderTargetId == null ? "on" : ""}
                              onClick={() => setOrderTargetId(null)}
                            >
                              הקרוב ביותר
                            </button>
                          )}
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
                    {orderTask === "holdFire"
                      ? engagementRange != null
                        ? `ארוב במקום — אש בטווח ${engagementRange}מ'`
                        : "החזק מקום ואל תירה"
                      : orderedEngagement()
                        ? "החזק מקום ותקוף"
                        : "החזק מקום"}
                  </button>

                  <button
                    className={`btn-ghost${scoutingSelected ? " on" : ""}`}
                    disabled={!selectedOwn}
                    onClick={handleScouting}
                    title={`סיור: +${Math.round(SCOUTING.detectionBonus * 100)}% לגילוי, תנועה בהליכה בלבד.`}
                  >
                    {scoutingSelected ? "חזור מסיור" : "צא לסיור"}
                  </button>

                  {/* Where the force is told to look. An arc, not a bearing:
                      a squad watches a frontage (rules decision 14). */}
                  <label>גזרת תצפית:</label>
                  {/* The width is the bet: the same attention over a narrower
                      arc is worth more inside it, so what each button buys is
                      on the button (rules decision 14). */}
                  <div className="seg">
                    {OBSERVATION_SECTOR.widths.map((w) => (
                      <button
                        key={w}
                        className={sectorWidth === w ? "on" : ""}
                        onClick={() => setSectorWidth(w)}
                        title={`גזרה של ${w}° — +${Math.round(sectorBonus(w) * 100)}% לגילוי בתוכה`}
                      >
                        {w}° · +{Math.round(sectorBonus(w) * 100)}%
                      </button>
                    ))}
                  </div>
                  <div className="seg">
                    <button
                      className={aimingSector ? "on" : ""}
                      disabled={!selectedOwn}
                      onClick={() => setAimingSector((on) => !on)}
                      title={`+${Math.round(sectorBonus(sectorWidth) * 100)}% לגילוי בתוך הגזרה, -${Math.round(OBSERVATION_SECTOR.outsidePenalty * 100)}% מחוצה לה. גזרה צרה שווה יותר בתוכה. לחץ ואז סמן על המפה לאן להסתכל.`}
                    >
                      {aimingSector ? "סמן על המפה…" : "קבע גזרה"}
                    </button>
                    <button
                      disabled={!selectedOwn?.observationSector}
                      onClick={handleClearSector}
                      title="ביטול הגזרה: הכוח צופה לכל הכיוונים, ללא תוספת וללא קנס"
                    >
                      תצפית מעגלית
                    </button>
                  </div>

                  <button
                    className={`btn-ghost${selectedOwn?.camouflaging ? " on" : ""}`}
                    disabled={!selectedOwn}
                    onClick={handleCamouflage}
                    title={`הסוואה: -${Math.round(CAMOUFLAGE.perStep * 100)}% לגילוי כל ${CAMOUFLAGE.turnsPerStep} תורות, עד -${Math.round(CAMOUFLAGE.max * 100)}%. תנועה מבטלת אותה.`}
                  >
                    {selectedOwn?.camouflaging ? "הפסק הסוואה" : "הסווה עמדה"}
                  </button>

                  {/* Laying a charge in front of the position (rules decision
                      16). Only a force trained for it — an insurgent or a
                      special force — gets the control at all, so the panel
                      stays as it was for everyone else. */}
                  {selectedOwn?.canLayCharges && (
                    <>
                      <label>הנחת מטען:</label>
                      <div className="seg">
                        {(["antiPersonnel", "antiTank"] as const).map((type) => (
                          <button
                            key={type}
                            className={selectedOwn.layingCharge?.type === type ? "on" : ""}
                            onClick={() => handleLayCharge(type)}
                            title={`${CHARGE_LAYING.turnsToLay} תורות עבודה, והפקודה הקודמת מתבטלת. הכוח חייב לעמוד במקומו ולהישאר מחוץ לקרב — תנועה, ירי או פגיעה בו מאבדות את העבודה.`}
                          >
                            {type === "antiTank" ? 'נ"ט' : 'נ"א'}
                          </button>
                        ))}
                      </div>
                      {selectedOwn.layingCharge && (
                        <p className="hint">
                          מניח {chargeHe(selectedOwn.layingCharge.type)} —{" "}
                          {turnsLeftHe(
                            CHARGE_LAYING.turnsToLay - selectedOwn.layingCharge.turnsWorked,
                          )}
                          . תנועה, ירי או פגיעה בכוח יאבדו את העבודה.
                        </p>
                      )}
                    </>
                  )}

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

                  {/* חיפוי: the document's third action of phase 6. Spends the
                      force's action, and answers the first enemy it sees move,
                      fire or assault (rules decision 18). */}
                  <button
                    className={`btn-ghost${selectedOwn?.covering ? " on" : ""}`}
                    disabled={!selectedOwn || (!selectedOwn.covering && selectedOwn.firedThisTurn)}
                    onClick={handleCovering}
                    title={`חיפוי: הכוח אינו יורה עכשיו, אלא בראשון מאויביו שינוע, יירה או יסתער — בטווח ובקו ראייה. הפעולה של התור מנוצלת על כך, והירי מסיים את החיפוי.`}
                  >
                    {selectedOwn?.covering ? "רד מחיפוי" : "חפה"}
                  </button>

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
                      <p className="hint">
                        בחר כוח, ולחץ על אויב מסומן כדי לירות. מוצגים רק כוחות שזוהו;
                        סימון דהוי הוא דיווח מתור קודם — ייתכן שהכוח כבר אינו שם.
                      </p>
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
                terrain={game.terrain}
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

          {/*
            Nobody owns the screen during a handoff or on the initiative panel:
            `viewingSide` is already the *incoming* side there, while the device
            is still in the outgoing player's hands (rules decision 17).
          */}
          <LogPanel
            log={log}
            reader={stage === "activation" && !showHandoff ? viewingSide : null}
          />
        </aside>
      </div>
    </div>
  );
}

/** "One turn left" reads differently from "two turns left" in Hebrew. */
function turnsLeftHe(turns: number): string {
  return turns === 1 ? "נותר תור אחד" : `נותרו ${turns} תורות`;
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
  terrain,
}: {
  unit: Unit | null;
  orderInfo: OrderInfo | null;
  /** The order the force is working to — what it will do again next turn. */
  order: StandingOrder | undefined;
  nameOf: (id: string) => string;
  terrain: Terrain;
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
      <PostureLine unit={unit} terrain={terrain} />
    </div>
  );
}

const coverHe: Record<string, string> = { full: "מחסה מלא", partial: "מחסה חלקי", none: "בשטח פתוח" };

/**
 * How exposed the force is: what it is behind, whether it is hidden by holding
 * still, and how far its camouflage has got (rules decision 12).
 */
function PostureLine({ unit, terrain }: { unit: Unit; terrain: Terrain }) {
  const camouflage = camouflageBonus(unit);
  const stationary = unit.movedThisTurn === 0;
  const digging =
    stationary && unit.cover !== "full" && unit.stationaryTurns >= DIG_IN.startsAfterTurns;
  // What the ground gives (rules decision 15): where the force stands, and
  // what it stands against — so a player can read a crest off the card, and
  // see that the cover on the line above is the wall's rather than dug.
  const ground = coverFromObjects(terrain, unit.position);
  return (
    <>
      <div className={unit.cover === "none" ? "warn" : "ok"}>
        {coverHe[unit.cover]}
        {digging ? " · מתחפר" : ""}
        {stationary ? ` · חבוי (${unit.stationaryTurns} תורות במקום)` : " · נע — גלוי"}
      </div>
      {terrain.heightfield && (
        <div className="muted">
          גובה {Math.round(groundHeight(terrain, unit.position))} מ'
          {ground !== "none" ? ` · השטח נותן ${coverHe[ground]}` : ""}
        </div>
      )}
      {unit.scouting && (
        <div className="ok">
          בסיור: +{Math.round(SCOUTING.detectionBonus * 100)}% לגילוי · הליכה בלבד
        </div>
      )}
      {unit.observationSector && (
        <div className="ok">
          גזרת תצפית: {describeSector(unit.observationSector)} ·{" "}
          {sectorWorthHe(unit.observationSector)}
        </div>
      )}
      {(unit.camouflaging || camouflage > 0) && (
        <div className="ok">
          הסוואה: {camouflage > 0 ? `-${Math.round(camouflage * 100)}% לגילוי` : "בעבודה"}
          {unit.camouflaging && camouflage < CAMOUFLAGE.max ? ` (${unit.camouflageTurns} תורות)` : ""}
        </div>
      )}
    </>
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
