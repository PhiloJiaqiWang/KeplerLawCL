import stuckRulesJson from "@/agents/config/stuckRules.json";
import { requestOpenAIJson } from "@/agents/openai";
import type { MonitorDecision, ParticipantRole, RoomState } from "@/lib/types";

const stuckRules = stuckRulesJson.rules;
const MONITOR_MESSAGE_WINDOW = 12;
const MONITOR_MEASUREMENT_WINDOW = 8;

const isParticipantRole = (role: string): role is ParticipantRole =>
  role === "participantA" || role === "participantB";

export const getParticipantLabel = (room: RoomState, role: ParticipantRole) =>
  role === "participantA"
    ? (room.participantA?.name?.trim() || "Participant A")
    : (room.participantB?.name?.trim() || "Participant B");

export const getSenderLabel = (room: RoomState, role: string) =>
  isParticipantRole(role) ? getParticipantLabel(room, role) : "NOVA";

const getParticipantMessages = (room: RoomState) =>
  room.chatMessages.filter((message) => isParticipantRole(message.senderRole));

const getAllMeasurements = (room: RoomState) =>
  Object.values(room.progressBySimulation).flatMap((progress) => progress.measurements);

const toTimestamp = (value: string) => new Date(value).getTime();

const formatRules = () =>
  stuckRules
    .map((rule) => {
      const signals = rule.monitorSignals.map((signal) => `- ${signal}`).join("\n");
      return `${rule.id} | ${rule.label}\nDefinition: ${rule.definition}\nSignals:\n${signals}`;
    })
    .join("\n\n");

const getLatestParticipantActivity = (room: RoomState) => {
  const activity = [
    room.participantA ? { kind: "join", createdAt: room.participantA.joinedAt } : null,
    room.participantB ? { kind: "join", createdAt: room.participantB.joinedAt } : null,
    ...getParticipantMessages(room).map((message) => ({
      kind: "message" as const,
      createdAt: message.createdAt,
    })),
    ...getAllMeasurements(room).map((measurement) => ({
      kind: "measurement" as const,
      createdAt: measurement.createdAt,
    })),
  ].filter((entry) => entry !== null);

  if (activity.length === 0) return null;
  return activity.reduce((latest, current) =>
    toTimestamp(current.createdAt) > toTimestamp(latest.createdAt) ? current : latest,
  );
};

const buildDetectionKey = (room: RoomState, ruleId: string | null) => {
  const latestActivity = getLatestParticipantActivity(room);
  const fallbackTimestamp = room.chatMessages.at(-1)?.createdAt ?? room.eventLogs.at(-1)?.createdAt ?? "none";
  return `${ruleId ?? "unknown"}:${latestActivity?.createdAt ?? fallbackTimestamp}`;
};

export const buildConversationWindow = (room: RoomState) => {
  const recentMessages = room.chatMessages.slice(-MONITOR_MESSAGE_WINDOW);
  const participantMessages = recentMessages.filter((message) => message.senderRole !== "agent");
  const counts = participantMessages.reduce(
    (acc, message) => {
      if (isParticipantRole(message.senderRole)) {
        acc[message.senderRole] += 1;
      }
      return acc;
    },
    { participantA: 0, participantB: 0 },
  );
  const latestActivity = getLatestParticipantActivity(room);
  const currentTimestamp = new Date().toISOString();
  const latestParticipantActivityElapsedSeconds = latestActivity
    ? Math.max(0, Math.floor((toTimestamp(currentTimestamp) - toTimestamp(latestActivity.createdAt)) / 1000))
    : null;

  return {
    currentTimestamp,
    stage: room.progressBySimulation[room.currentSimulation].currentStage,
    currentActivity: room.currentActivity,
    currentSimulation: room.currentSimulation,
    participantMessageCounts: counts,
    participantLabels: {
      participantA: getParticipantLabel(room, "participantA"),
      participantB: getParticipantLabel(room, "participantB"),
    },
    latestParticipantActivity: latestActivity,
    latestParticipantActivityElapsedSeconds,
    recentMeasurements: getAllMeasurements(room)
      .slice(-MONITOR_MEASUREMENT_WINDOW)
      .map((measurement) => ({
        role: getParticipantLabel(room, measurement.role),
        point: measurement.point,
        target: measurement.target,
        tool: measurement.tool ?? null,
        createdAt: measurement.createdAt,
      })),
    recentMessages: recentMessages.map((message) => ({
      sender: getSenderLabel(room, message.senderRole),
      createdAt: message.createdAt,
      content: message.content,
    })),
  };
};

export const hasBothParticipants = (room: RoomState) => Boolean(room.participantA && room.participantB);

export const hasMinimumParticipation = (room: RoomState) => hasBothParticipants(room);

export const monitorConversation = async (room: RoomState): Promise<MonitorDecision | null> => {
  const systemPrompt = [
    "You are NOVA's collaboration monitor.",
    "Decide whether the recent collaboration is stuck according to the supplied rules.",
    "Use only the supplied evidence window, including timestamps, recent chat, recent measurements, and participation counts.",
    "Treat measurement activity as active collaboration.",
    "For inactivity, compare the current timestamp against the latest participant activity timestamp.",
    "Be conservative: only mark stuck when a supplied rule is clearly present.",
    "Return JSON only with keys stuck, ruleId, confidence, rationale.",
    "ruleId must be one of the supplied rule ids or null.",
  ].join(" ");

  const userPrompt = [
    "Stuck rules:",
    formatRules(),
    "",
    "Decision guidance:",
    JSON.stringify(stuckRulesJson.decisionGuidance, null, 2),
    "",
    "Collaboration evidence window:",
    JSON.stringify(buildConversationWindow(room), null, 2),
  ].join("\n");

  const decision = await requestOpenAIJson<MonitorDecision>({
    label: "Stuck monitor",
    roomId: room.roomId,
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt,
    userPrompt,
    model: process.env.AGENT_OPENAI_MODEL ?? "gpt-4.1-mini",
    maxOutputTokens: 240,
    temperature: 0.1,
  });

  if (!decision) return null;
  if (!decision.stuck) return decision;

  return {
    ...decision,
    detectionKey: buildDetectionKey(room, decision.ruleId),
  };
};
