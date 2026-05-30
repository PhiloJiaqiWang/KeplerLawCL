import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type AgentCondition,
  type EventLog,
  type MeasurementPoint,
  type MeasurementTarget,
  type ParticipantRole,
  type ParticipantSlot,
  type RoomState,
  type Stage,
  type SimulationType,
} from "@/lib/types";
import {
  DEFAULT_MAX_MEASUREMENTS as MAX_MEASUREMENTS_PER_SIMULATION,
  THIRD_LAW_MAX_MEASUREMENTS as MAX_MEASUREMENTS_THIRD_LAW,
  getMaxMeasurementsForSimulation,
} from "@/lib/measurementLimits";

const rooms = new Map<string, RoomState>();
const initialStage: Stage = "Planning";
export { MAX_MEASUREMENTS_PER_SIMULATION, MAX_MEASUREMENTS_THIRD_LAW, getMaxMeasurementsForSimulation };
const EVENT_LOG_DIR = path.join(process.cwd(), "data", "event-logs");

const createInitialProgress = (): RoomState["progressBySimulation"] => ({
  "Kepler First Law": {
    currentStage: initialStage,
    planByRole: {},
    collaborationConfirmedByRole: {},
    measurements: [],
    discussionAnswersByRole: {},
  },
  "Kepler Second Law": {
    currentStage: initialStage,
    planByRole: {},
    collaborationConfirmedByRole: {},
    measurements: [],
    discussionAnswersByRole: {},
  },
  "Kepler Third Law": {
    currentStage: initialStage,
    planByRole: {},
    collaborationConfirmedByRole: {},
    measurements: [],
    discussionAnswersByRole: {},
  },
});

const defaultEvent = (roomId: string): EventLog => ({
  id: randomUUID(),
  type: "SYSTEM",
  message: `Room ${roomId} initialized.`,
  createdAt: new Date().toISOString(),
});

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

const appendEventToCsv = (roomId: string, event: EventLog) => {
  mkdirSync(EVENT_LOG_DIR, { recursive: true });
  const filePath = path.join(EVENT_LOG_DIR, `${roomId}.csv`);
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "id,createdAt,type,message\n", "utf8");
  }
  const line = [
    escapeCsv(event.id),
    escapeCsv(event.createdAt),
    escapeCsv(event.type),
    escapeCsv(event.message),
  ].join(",");
  appendFileSync(filePath, `${line}\n`, "utf8");
};

const addEvent = (room: RoomState, event: EventLog) => {
  room.eventLogs.push(event);
  appendEventToCsv(room.roomId, event);
};

export const createOrGetRoom = (roomId: string): RoomState => {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const room: RoomState = {
    roomId,
    participantA: null,
    participantB: null,
    currentActivity: "Orientation",
    currentSimulation: "Kepler First Law",
    progressBySimulation: createInitialProgress(),
    agentCondition: "Control",
    chatMessages: [],
    eventLogs: [],
  };

  rooms.set(roomId, room);
  addEvent(room, defaultEvent(roomId));
  return room;
};

export const getRoom = (roomId: string): RoomState | null => rooms.get(roomId) ?? null;

const slotKeyByRole: Record<ParticipantRole, "participantA" | "participantB"> = {
  participantA: "participantA",
  participantB: "participantB",
};

export const joinRole = (roomId: string, role: ParticipantRole, name: string): RoomState => {
  const room = createOrGetRoom(roomId);
  const slotKey = slotKeyByRole[role];
  const normalizedName = name.trim();
  const existingParticipant = room[slotKey];

  if (existingParticipant) {
    if (existingParticipant.name.toLowerCase() !== normalizedName.toLowerCase()) {
      throw new Error("ROLE_TAKEN");
    }

    existingParticipant.joinedAt = new Date().toISOString();
    addEvent(room, {
      id: randomUUID(),
      type: "ROOM",
      message: `${normalizedName} rejoined as ${role}.`,
      createdAt: new Date().toISOString(),
    });
        return room;
  }

  const participant: ParticipantSlot = {
    id: randomUUID(),
    name: normalizedName,
    joinedAt: new Date().toISOString(),
  };

  room[slotKey] = participant;
  addEvent(room, {
    id: randomUUID(),
    type: "ROOM",
    message: `${normalizedName} joined as ${role}.`,
    createdAt: new Date().toISOString(),
  });

    return room;
};

export const postMessage = (roomId: string, role: ParticipantRole, content: string): RoomState => {
  const room = createOrGetRoom(roomId);

  const message = {
    id: randomUUID(),
    senderRole: role,
    content,
    createdAt: new Date().toISOString(),
  };

  room.chatMessages.push(message);
  addEvent(room, {
    id: randomUUID(),
    type: "CHAT",
    message: `${role}: ${content}`,
    createdAt: message.createdAt,
  });

    return room;
};

export const updateAgentCondition = (roomId: string, condition: AgentCondition): RoomState => {
  const room = createOrGetRoom(roomId);
  room.agentCondition = condition;
  addEvent(room, {
    id: randomUUID(),
    type: "SYSTEM",
    message: `Agent condition changed to ${condition}.`,
    createdAt: new Date().toISOString(),
  });
    return room;
};

export const updateSimulation = (roomId: string, simulation: SimulationType): RoomState => {
  const room = createOrGetRoom(roomId);
  room.currentSimulation = simulation;
  addEvent(room, {
    id: randomUUID(),
    type: "SYSTEM",
    message: `Simulation changed to ${simulation}.`,
    createdAt: new Date().toISOString(),
  });
    return room;
};

const hasBothParticipantsChatted = (room: RoomState): boolean => {
  const roles = new Set(room.chatMessages.map((message) => message.senderRole));
  return roles.has("participantA") && roles.has("participantB");
};

export const submitPlan = (
  roomId: string,
  role: ParticipantRole,
  planText: string,
  collaborationConfirmed: boolean,
): RoomState => {
  const room = createOrGetRoom(roomId);
  const normalized = planText.trim();
  const simulation = room.currentSimulation;
  const progress = room.progressBySimulation[simulation];
  if (!normalized) {
    throw new Error("INVALID_PLAN");
  }
  if (progress.currentStage !== "Planning") {
    throw new Error("STAGE_LOCKED");
  }
  if (!hasBothParticipantsChatted(room)) {
    throw new Error("DISCUSSION_REQUIRED");
  }
  if (!collaborationConfirmed) {
    throw new Error("COLLABORATION_CONFIRMATION_REQUIRED");
  }

  progress.planByRole[role] = normalized;
  progress.collaborationConfirmedByRole[role] = true;
  addEvent(room, {
    id: randomUUID(),
    type: "ROOM",
    message: `${role} submitted planning notes for ${simulation}.`,
    createdAt: new Date().toISOString(),
  });

  const bothSubmitted = Boolean(progress.planByRole.participantA && progress.planByRole.participantB);
  if (bothSubmitted) {
    progress.currentStage = "Investigation";
    room.currentActivity = "Simulation";
    addEvent(room, {
      id: randomUUID(),
      type: "SYSTEM",
      message: `Both plans submitted for ${simulation}. Stage advanced to Investigation.`,
      createdAt: new Date().toISOString(),
    });
  }

    return room;
};

const pointSides: Record<MeasurementPoint, "left" | "right"> = {
  L1: "left",
  L2: "left",
  L3: "left",
  R1: "right",
  R2: "right",
  R3: "right",
};

const measurementCoordinates: Record<MeasurementTarget, { x: number; y: number }> = (() => {
  const cx = 220;
  const cy = 130;
  const a = 130;
  const b = 122;
  const c = Math.sqrt(a * a - b * b);
  return {
    L1: { x: cx + a * Math.cos((5 * Math.PI) / 6), y: cy + b * Math.sin((5 * Math.PI) / 6) },
    L2: { x: cx - a, y: cy },
    L3: { x: cx + a * Math.cos((7 * Math.PI) / 6), y: cy + b * Math.sin((7 * Math.PI) / 6) },
    R1: { x: cx + a * Math.cos(-Math.PI / 6), y: cy + b * Math.sin(-Math.PI / 6) },
    R2: { x: cx + a, y: cy },
    R3: { x: cx + a * Math.cos(Math.PI / 6), y: cy + b * Math.sin(Math.PI / 6) },
    Center: { x: cx, y: cy },
    "Focus 1": { x: cx - c, y: cy },
    "Focus 2": { x: cx + c, y: cy },
  };
})();

const computeFixedDistance = (from: MeasurementPoint, to: MeasurementTarget): number => {
  const p1 = measurementCoordinates[from];
  const p2 = measurementCoordinates[to];
  const raw = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return Math.round(raw * 10) / 10;
};

const secondLawTimeIntervals = [5, 10, 15] as const;
type SecondLawInterval = (typeof secondLawTimeIntervals)[number];
type SecondLawTool = "Speed Tool" | "Swept Area Tool";
type ThirdLawTool = "Period Tool" | "Axis Tool";
type ThirdLawOrbit = "Orbit 1" | "Orbit 2" | "Orbit 3" | "Orbit 4" | "Orbit 5" | "Orbit 6";

const secondLawBaseSpeedByPoint: Record<MeasurementPoint, number> = {
  L1: 8.1,
  L2: 8.6,
  L3: 8.0,
  R1: 6.9,
  R2: 6.5,
  R3: 7.0,
};

const secondLawAreaRate = 2.48;

const computeSecondLawSpeed = (point: MeasurementPoint, interval: SecondLawInterval): number => {
  const intervalFactor = interval === 5 ? 0.98 : interval === 15 ? 1.02 : 1;
  return Number((secondLawBaseSpeedByPoint[point] * intervalFactor).toFixed(2));
};

const computeSecondLawSweptArea = (_point: MeasurementPoint, interval: SecondLawInterval): number =>
  Number((secondLawAreaRate * interval).toFixed(2));

const thirdLawOrbitData: Record<ThirdLawOrbit, { periodDays: number; semiMajorAxisAU: number }> = {
  "Orbit 1": { periodDays: 0.35, semiMajorAxisAU: 0.5 },
  "Orbit 2": { periodDays: 0.72, semiMajorAxisAU: 0.8 },
  "Orbit 3": { periodDays: 1.0, semiMajorAxisAU: 1.0 },
  "Orbit 4": { periodDays: 1.84, semiMajorAxisAU: 1.5 },
  "Orbit 5": { periodDays: 2.83, semiMajorAxisAU: 2.0 },
  "Orbit 6": { periodDays: 5.2, semiMajorAxisAU: 3.0 },
};

export const addMeasurement = (
  roomId: string,
  role: ParticipantRole,
  point: MeasurementPoint,
  target: MeasurementTarget | null,
  options?: {
    tool?: SecondLawTool;
    timeIntervalSec?: SecondLawInterval;
    thirdLawTool?: ThirdLawTool;
    thirdLawOrbit?: ThirdLawOrbit;
  },
): RoomState => {
  const room = createOrGetRoom(roomId);
  const simulation = room.currentSimulation;
  const progress = room.progressBySimulation[simulation];

  if (progress.currentStage !== "Investigation") {
    throw new Error("MEASUREMENT_STAGE_LOCKED");
  }
  const maxMeasurements = getMaxMeasurementsForSimulation(simulation);
  if (progress.measurements.length >= maxMeasurements) {
    throw new Error("ENERGY_DEPLETED");
  }

  if (simulation === "Kepler Third Law") {
    const tool = options?.thirdLawTool;
    const orbit = options?.thirdLawOrbit;
    if (!tool || (tool !== "Period Tool" && tool !== "Axis Tool")) {
      throw new Error("INVALID_THIRD_LAW_TOOL");
    }
    if (!orbit || !(orbit in thirdLawOrbitData)) {
      throw new Error("INVALID_THIRD_LAW_ORBIT");
    }
    const sourcePoint: MeasurementPoint =
      orbit === "Orbit 1"
        ? "L1"
        : orbit === "Orbit 2"
          ? "L2"
          : orbit === "Orbit 3"
            ? "L3"
            : orbit === "Orbit 4"
              ? "R1"
              : orbit === "Orbit 5"
                ? "R2"
                : "R3";
    const orbitData = thirdLawOrbitData[orbit];
    const value = tool === "Period Tool" ? orbitData.periodDays : orbitData.semiMajorAxisAU;
    const valueUnit = tool === "Period Tool" ? "years" : "AU";

    progress.measurements.push({
      id: randomUUID(),
      role,
      point: sourcePoint,
      target: null,
      distance: 0,
      tool,
      orbitLabel: orbit,
      value,
      valueUnit,
      createdAt: new Date().toISOString(),
    });
    addEvent(room, {
      id: randomUUID(),
      type: "ROOM",
      message: `${role} measured ${tool} on ${orbit}: ${value.toFixed(2)} ${valueUnit}`,
      createdAt: new Date().toISOString(),
    });
        return room;
  }

  const side = pointSides[point];
  const allowed =
    (role === "participantA" && side === "left") ||
    (role === "participantB" && side === "right");
  if (!allowed) {
    throw new Error("POINT_ACCESS_DENIED");
  }

  if (simulation === "Kepler Second Law") {
    const tool = options?.tool;
    const interval = options?.timeIntervalSec;
    if (!tool || (tool !== "Speed Tool" && tool !== "Swept Area Tool")) {
      throw new Error("INVALID_SECOND_LAW_TOOL");
    }
    if (tool === "Swept Area Tool" && (!interval || !secondLawTimeIntervals.includes(interval))) {
      throw new Error("INVALID_TIME_INTERVAL");
    }

    if (tool === "Speed Tool") {
      const speedInterval: SecondLawInterval = interval ?? 10;
      const speed = computeSecondLawSpeed(point, speedInterval);
      progress.measurements.push({
        id: randomUUID(),
        role,
        point,
        target: null,
        distance: 0,
        tool,
        timeIntervalSec: speedInterval,
        value: speed,
        valueUnit: "u/s",
        createdAt: new Date().toISOString(),
      });
      addEvent(room, {
        id: randomUUID(),
        type: "ROOM",
        message: `${role} measured speed at ${point} (${speedInterval}s): ${speed.toFixed(2)} u/s`,
        createdAt: new Date().toISOString(),
      });
            return room;
    }

    if (!interval || !secondLawTimeIntervals.includes(interval)) {
      throw new Error("INVALID_TIME_INTERVAL");
    }
    const area = computeSecondLawSweptArea(point, interval);
    progress.measurements.push({
      id: randomUUID(),
      role,
      point,
      target: null,
      distance: 0,
      tool,
      timeIntervalSec: interval,
      value: area,
      valueUnit: "u^2",
      createdAt: new Date().toISOString(),
    });
    addEvent(room, {
      id: randomUUID(),
      type: "ROOM",
      message: `${role} measured swept area at ${point} (${interval}s): ${area.toFixed(2)} u^2`,
      createdAt: new Date().toISOString(),
    });
        return room;
  }

  if (!target || !measurementCoordinates[point] || !measurementCoordinates[target] || point === target) {
    throw new Error("INVALID_POINT_OR_TARGET");
  }
  if (target in pointSides) {
    const targetSide = pointSides[target as MeasurementPoint];
    const roleAllowedForTarget =
      (role === "participantA" && targetSide === "left") ||
      (role === "participantB" && targetSide === "right");
    if (!roleAllowedForTarget) {
      throw new Error("POINT_ACCESS_DENIED");
    }
  }

  const distance = computeFixedDistance(point, target);
  progress.measurements.push({
    id: randomUUID(),
    role,
    point,
    target,
    distance,
    createdAt: new Date().toISOString(),
  });
  addEvent(room, {
    id: randomUUID(),
    type: "ROOM",
    message: `${role} measured ${point} -> ${target}: ${distance.toFixed(1)}`,
    createdAt: new Date().toISOString(),
  });
    return room;
};

export const advanceToDiscussion = (roomId: string): RoomState => {
  const room = createOrGetRoom(roomId);
  const simulation = room.currentSimulation;
  const progress = room.progressBySimulation[simulation];

  if (progress.currentStage !== "Investigation") {
    throw new Error("STAGE_LOCKED");
  }
  progress.currentStage = "Discussion";
  addEvent(room, {
    id: randomUUID(),
    type: "SYSTEM",
    message: `${simulation} advanced to Discussion.`,
    createdAt: new Date().toISOString(),
  });
    return room;
};

export const submitDiscussionAnswers = (
  roomId: string,
  role: ParticipantRole,
  answers: { q1: string; q2: string },
): RoomState => {
  const room = createOrGetRoom(roomId);
  const simulation = room.currentSimulation;
  const progress = room.progressBySimulation[simulation];

  if (progress.currentStage !== "Discussion") {
    throw new Error("STAGE_LOCKED");
  }
  if (!answers.q1.trim() || !answers.q2.trim()) {
    throw new Error("INVALID_DISCUSSION");
  }

  progress.discussionAnswersByRole[role] = {
    q1: answers.q1.trim(),
    q2: answers.q2.trim(),
  };
  addEvent(room, {
    id: randomUUID(),
    type: "ROOM",
    message: `${role} submitted discussion answers for ${simulation}.`,
    createdAt: new Date().toISOString(),
  });

  const bothSubmitted = Boolean(
    progress.discussionAnswersByRole.participantA && progress.discussionAnswersByRole.participantB,
  );
  if (bothSubmitted) {
    progress.currentStage = "Submission";
    room.currentActivity = "Debrief";
    addEvent(room, {
      id: randomUUID(),
      type: "SYSTEM",
      message: `Discussion complete for ${simulation}. Stage advanced to Submission.`,
      createdAt: new Date().toISOString(),
    });
  }
    return room;
};
