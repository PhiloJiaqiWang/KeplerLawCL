import stuckRulesJson from "@/agents/config/stuckRules.json";
import { requestOpenAIJson } from "@/agents/openai";
import { agentNameByRole } from "@/lib/agentRoles";
import type { MonitorDecision, ParticipantRole, RoomState } from "@/lib/types";

type MonitorCategory = NonNullable<MonitorDecision["category"]>;

const stuckRules = stuckRulesJson.rules;
const ruleCategoryById = new Map<string, MonitorCategory>(
  stuckRules.map((rule) => [rule.id, rule.category as MonitorCategory]),
);
const MONITOR_MESSAGE_WINDOW = 12;
const MONITOR_MEASUREMENT_WINDOW = 8;

const isParticipantRole = (role: string): role is ParticipantRole =>
  role === "participantA" || role === "participantB";

export const getParticipantLabel = (room: RoomState, role: ParticipantRole) =>
  role === "participantA"
    ? (room.participantA?.name?.trim() || "Participant A")
    : (room.participantB?.name?.trim() || "Participant B");

export const getSenderLabel = (room: RoomState, role: string) =>
  isParticipantRole(role) ? getParticipantLabel(room, role) : agentNameByRole[room.agentRole];

const getMessageSenderLabel = (room: RoomState, message: { senderRole: string; senderName?: string }) =>
  message.senderRole === "agent" && message.senderName ? message.senderName : getSenderLabel(room, message.senderRole);

const getParticipantMessages = (room: RoomState) =>
  room.chatMessages.filter((message) => isParticipantRole(message.senderRole));

const getAllMeasurements = (room: RoomState) =>
  Object.values(room.progressBySimulation).flatMap((progress) => progress.measurements);

const toTimestamp = (value: string) => new Date(value).getTime();

const formatRules = () =>
  stuckRules
    .map((rule) => {
      const signals = rule.monitorSignals.map((signal) => `- ${signal}`).join("\n");
      return `${rule.id} | ${rule.label}\nCategory: ${rule.category}\nDefinition: ${rule.definition}\nSignals:\n${signals}`;
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
  const participantMessageCounts = participantMessages.reduce(
    (acc, message) => {
      if (isParticipantRole(message.senderRole)) {
        acc[message.senderRole] += 1;
      }
      return acc;
    },
    { participantA: 0, participantB: 0 },
  );
  const recentMeasurements = getAllMeasurements(room).slice(-MONITOR_MEASUREMENT_WINDOW);
  const participantMeasurementCounts = recentMeasurements.reduce(
    (acc, measurement) => {
      acc[measurement.role] += 1;
      return acc;
    },
    { participantA: 0, participantB: 0 },
  );
  const latestActivity = getLatestParticipantActivity(room);
  const currentTimestamp = new Date().toISOString();
  const latestParticipantActivityElapsedSeconds = latestActivity
    ? Math.max(0, Math.floor((toTimestamp(currentTimestamp) - toTimestamp(latestActivity.createdAt)) / 1000))
    : null;
  const recentLearnerActions = [
    ...getParticipantMessages(room).map((message) => ({
      kind: "message" as const,
      role: message.senderRole,
      createdAt: message.createdAt,
    })),
    ...getAllMeasurements(room).map((measurement) => ({
      kind: "measurement" as const,
      role: measurement.role,
      createdAt: measurement.createdAt,
    })),
  ]
    .sort((left, right) => toTimestamp(left.createdAt) - toTimestamp(right.createdAt))
    .slice(-20);
  const recentActionGapsSeconds = recentLearnerActions.slice(1).map((action, index) => ({
    from: recentLearnerActions[index].createdAt,
    to: action.createdAt,
    elapsedSeconds: Math.max(
      0,
      Math.floor((toTimestamp(action.createdAt) - toTimestamp(recentLearnerActions[index].createdAt)) / 1000),
    ),
  }));

  return {
    currentTimestamp,
    stage: room.progressBySimulation[room.currentSimulation].currentStage,
    currentActivity: room.currentActivity,
    currentSimulation: room.currentSimulation,
    participantMessageCounts,
    participantMeasurementCounts,
    participantLabels: {
      participantA: getParticipantLabel(room, "participantA"),
      participantB: getParticipantLabel(room, "participantB"),
    },
    latestParticipantActivity: latestActivity,
    latestParticipantActivityElapsedSeconds,
    recentActionGapsSeconds,
    recentMeasurements: recentMeasurements.map((measurement) => ({
      role: getParticipantLabel(room, measurement.role),
      point: measurement.point,
      target: measurement.target,
      tool: measurement.tool ?? null,
      createdAt: measurement.createdAt,
    })),
    recentMessages: recentMessages.map((message) => ({
      sender: getMessageSenderLabel(room, message),
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
    "Decide whether the recent collaboration is stuck according to the supplied stuck types and detection rules.",
    "Use only the supplied evidence window, including timestamps, recent chat, recent measurements, and participation counts.",
    "Treat measurement activity as active collaboration.",
    "For inactivity, compare the current timestamp against the latest participant activity timestamp.",
    "Distinguish Conceptual Problem, Collaborative Problem, and Emotional Problem based on the supplied categories.",
    "Be conservative: only mark stuck when a supplied detection rule is clearly present.",
    "Return JSON only with keys stuck, ruleId, category, confidence, briefSummary, conceptFocus, rationale.",
    "ruleId must be one of the supplied rule ids or null.",
    "category must be one of the supplied rule categories or null.",
    "briefSummary must briefly describe what the stuck situation is about in fewer than 10 words when stuck is true, otherwise null.",
    "conceptFocus must identify the specific learning concept causing difficulty only when category is Conceptual Problem, otherwise null.",
    "Keep conceptFocus concise, preferably 2-6 words, such as ellipse focus relationship, equal areas, period-axis relationship, or proportional powers.",
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
    category: decision.category ?? (decision.ruleId ? ruleCategoryById.get(decision.ruleId) ?? null : null),
    conceptFocus:
      (decision.category ?? (decision.ruleId ? ruleCategoryById.get(decision.ruleId) ?? null : null)) ===
      "Conceptual Problem"
        ? decision.conceptFocus ?? decision.briefSummary ?? null
        : null,
    detectionKey: buildDetectionKey(room, decision.ruleId),
  };
};
