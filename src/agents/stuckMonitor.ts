import stuckRulesJson from "@/agents/config/stuckRules.json";
import { requestOpenAIJson } from "@/agents/openai";
import type { MonitorDecision, ParticipantRole, RoomState } from "@/lib/types";

const INACTIVITY_WINDOW_MS = 2 * 60 * 1000;
const UNBALANCED_WINDOW_SIZE = 12;
const UNCERTAINTY_WINDOW_SIZE = 10;
const ACKNOWLEDGEMENT_RE =
  /^(ok(?:ay)?|yes|yeah|yep|sure|got it|makes sense|sounds good|alright|fine|kk?|i agree|let'?s do that)\W*$/i;

const stuckRules = stuckRulesJson.rules;

const isParticipantRole = (role: string): role is ParticipantRole =>
  role === "participantA" || role === "participantB";

const getParticipantMessages = (room: RoomState) =>
  room.chatMessages.filter((message) => isParticipantRole(message.senderRole));

const getAllMeasurements = (room: RoomState) =>
  Object.values(room.progressBySimulation).flatMap((progress) => progress.measurements);

const toTimestamp = (value: string) => new Date(value).getTime();

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

const isMinimalContribution = (content: string) => {
  const normalized = content.trim();
  if (!normalized) return true;
  if (ACKNOWLEDGEMENT_RE.test(normalized)) return true;
  const wordCount = normalized.split(/\s+/).length;
  return normalized.length <= 24 || wordCount <= 4;
};

const detectInactivity = (room: RoomState): MonitorDecision | null => {
  const latestActivity = getLatestParticipantActivity(room);
  if (!latestActivity) return null;

  const elapsedMs = Date.now() - toTimestamp(latestActivity.createdAt);
  if (elapsedMs < INACTIVITY_WINDOW_MS) return null;

  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);
  return {
    stuck: true,
    ruleId: "inactivity_2min",
    confidence: "high",
    rationale: `No participant activity for ${elapsedMinutes}m ${elapsedSeconds}s after the last ${latestActivity.kind}.`,
    detectionKey: `inactivity_2min:${latestActivity.createdAt}`,
  };
};

const detectUnbalancedParticipation = (room: RoomState): MonitorDecision | null => {
  const participantMessages = getParticipantMessages(room).slice(-UNBALANCED_WINDOW_SIZE);
  if (participantMessages.length < 6) return null;

  const counts = participantMessages.reduce(
    (acc, message) => {
      acc[message.senderRole] += 1;
      return acc;
    },
    { participantA: 0, participantB: 0 },
  );

  const dominantRole = counts.participantA >= counts.participantB ? "participantA" : "participantB";
  const quieterRole = dominantRole === "participantA" ? "participantB" : "participantA";
  const dominantCount = counts[dominantRole];
  const quieterCount = counts[quieterRole];
  const gap = dominantCount - quieterCount;
  const ratio = quieterCount === 0 ? Number.POSITIVE_INFINITY : dominantCount / quieterCount;
  const quieterMessages = participantMessages.filter((message) => message.senderRole === quieterRole);
  const minimalShare =
    quieterMessages.length === 0
      ? 1
      : quieterMessages.filter((message) => isMinimalContribution(message.content)).length / quieterMessages.length;

  if (dominantCount < 4 || gap < 3 || ratio < 2 || minimalShare < 0.67) return null;

  const latestMessageAt = participantMessages.at(-1)?.createdAt ?? "none";
  return {
    stuck: true,
    ruleId: "unbalanced_participation",
    confidence: quieterCount === 0 ? "high" : "medium",
    rationale: `${dominantRole} contributed ${dominantCount} of the last ${participantMessages.length} participant messages while ${quieterRole} contributed ${quieterCount}, mostly with minimal replies.`,
    detectionKey: `unbalanced_participation:${latestMessageAt}:${dominantCount}:${quieterCount}`,
  };
};

const detectSharedUncertainty = async (room: RoomState): Promise<MonitorDecision | null> => {
  const participantMessages = getParticipantMessages(room).slice(-UNCERTAINTY_WINDOW_SIZE);
  if (participantMessages.length < 4) return null;

  const roles = new Set(participantMessages.map((message) => message.senderRole));
  if (!roles.has("participantA") || !roles.has("participantB")) return null;

  const decision = await requestOpenAIJson<Pick<MonitorDecision, "stuck" | "confidence" | "rationale">>({
    label: "Shared uncertainty monitor",
    roomId: room.roomId,
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt: [
      "You are NOVA's collaboration monitor.",
      "Decide whether both students are uncertain about the same question, interpretation, or next step.",
      "Be conservative: mark stuck only when both participants clearly share the same unresolved uncertainty.",
      "Do not mark stuck when only one participant is uncertain, when they are uncertain about different things, or when the uncertainty is already resolved.",
      "Return JSON only with keys stuck, confidence, rationale.",
    ].join(" "),
    userPrompt: [
      "Shared uncertainty rule:",
      JSON.stringify(stuckRules.find((rule) => rule.id === "shared_uncertainty"), null, 2),
      "",
      "Decision guidance:",
      JSON.stringify(stuckRulesJson.decisionGuidance, null, 2),
      "",
      "Recent collaboration window:",
      JSON.stringify(
        {
          stage: room.progressBySimulation[room.currentSimulation].currentStage,
          currentActivity: room.currentActivity,
          currentSimulation: room.currentSimulation,
          recentMessages: participantMessages.map((message) => ({
            sender: message.senderRole,
            createdAt: message.createdAt,
            content: message.content,
          })),
          recentMeasurements: getAllMeasurements(room)
            .slice(-6)
            .map((measurement) => ({
              role: measurement.role,
              tool: measurement.tool ?? null,
              point: measurement.point,
              target: measurement.target,
              createdAt: measurement.createdAt,
            })),
        },
        null,
        2,
      ),
    ].join("\n"),
    model: process.env.AGENT_OPENAI_MODEL ?? "gpt-4.1-mini",
    maxOutputTokens: 220,
    temperature: 0.1,
  });

  if (!decision?.stuck) return null;

  return {
    stuck: true,
    ruleId: "shared_uncertainty",
    confidence: decision.confidence,
    rationale: decision.rationale,
    detectionKey: `shared_uncertainty:${participantMessages.at(-1)?.createdAt ?? "none"}:${participantMessages.length}`,
  };
};

export const buildConversationWindow = (room: RoomState) => {
  const recentMessages = room.chatMessages.slice(-12);
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

  return {
    stage: room.progressBySimulation[room.currentSimulation].currentStage,
    currentActivity: room.currentActivity,
    currentSimulation: room.currentSimulation,
    participantMessageCounts: counts,
    latestParticipantActivity: latestActivity,
    recentMeasurements: getAllMeasurements(room)
      .slice(-6)
      .map((measurement) => ({
        role: measurement.role,
        point: measurement.point,
        target: measurement.target,
        tool: measurement.tool ?? null,
        createdAt: measurement.createdAt,
      })),
    recentMessages: recentMessages.map((message) => ({
      sender: message.senderRole,
      createdAt: message.createdAt,
      content: message.content,
    })),
  };
};

export const hasBothParticipants = (room: RoomState) => Boolean(room.participantA && room.participantB);

export const hasMinimumParticipation = (room: RoomState) => hasBothParticipants(room);

export const monitorConversation = async (room: RoomState): Promise<MonitorDecision | null> => {
  const inactivityDecision = detectInactivity(room);
  if (inactivityDecision) return inactivityDecision;

  const unbalancedDecision = detectUnbalancedParticipation(room);
  if (unbalancedDecision) return unbalancedDecision;

  return detectSharedUncertainty(room);
};
