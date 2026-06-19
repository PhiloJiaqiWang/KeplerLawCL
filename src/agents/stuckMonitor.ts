import stuckRulesJson from "@/agents/config/stuckRules.json";
import { requestOpenAIJson } from "@/agents/openai";
import type { MonitorDecision, ParticipantRole, RoomState } from "@/lib/types";

const MIN_MESSAGES_BEFORE_MONITOR = 4;

const stuckRules = stuckRulesJson.rules;

const isParticipantRole = (role: string): role is ParticipantRole =>
  role === "participantA" || role === "participantB";

const formatRules = () =>
  stuckRules
    .map((rule) => {
      const signals = rule.monitorSignals.map((signal) => `- ${signal}`).join("\n");
      return `${rule.id} | ${rule.label}\nDefinition: ${rule.definition}\nSignals:\n${signals}`;
    })
    .join("\n\n");

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

  return {
    stage: room.progressBySimulation[room.currentSimulation].currentStage,
    currentActivity: room.currentActivity,
    currentSimulation: room.currentSimulation,
    participantMessageCounts: counts,
    recentMessages: recentMessages.map((message) => ({
      sender: message.senderRole,
      createdAt: message.createdAt,
      content: message.content,
    })),
  };
};

export const hasBothParticipants = (room: RoomState) => Boolean(room.participantA && room.participantB);

export const hasMinimumParticipation = (room: RoomState) => {
  const participantMessages = room.chatMessages.filter((message) => message.senderRole !== "agent");
  if (participantMessages.length < MIN_MESSAGES_BEFORE_MONITOR) return false;
  const roles = new Set(participantMessages.map((message) => message.senderRole).filter(isParticipantRole));
  return roles.has("participantA") && roles.has("participantB");
};

export const monitorConversation = async (room: RoomState): Promise<MonitorDecision | null> => {
  const systemPrompt = [
    "You are NOVA's collaboration monitor.",
    "Decide whether the recent student conversation is stuck according to the supplied rules.",
    "Be conservative: only mark stuck when a rule is clearly present in the recent exchange.",
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
    "Conversation window:",
    JSON.stringify(buildConversationWindow(room), null, 2),
  ].join("\n");

  return requestOpenAIJson<MonitorDecision>({
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
    maxOutputTokens: 220,
    temperature: 0.1,
  });
};
