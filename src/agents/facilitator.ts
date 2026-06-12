import { randomUUID } from "node:crypto";
import adaptiveRulesJson from "@/agents/config/adaptiveRules.json";
import stuckRulesJson from "@/agents/config/stuckRules.json";
import { hasOpenAIKey, requestOpenAIJson, requestOpenAIText } from "@/agents/openai";
import type { ChatMessage, EventLog, MonitorDecision, ParticipantRole, RoomState } from "@/lib/types";

type FacilitatorDeps = {
  appendChat: (room: RoomState, content: string) => void;
  appendEvent: (room: RoomState, event: EventLog) => void;
};

const MONITOR_COOLDOWN_MS = 2 * 60 * 1000;
const MIN_MESSAGES_BEFORE_MONITOR = 4;
const lastFacilitatorAtByRoom = new Map<string, number>();
const inFlightByRoom = new Set<string>();

const adaptiveRules = adaptiveRulesJson.rules;
const stuckRules = stuckRulesJson.rules;
const isParticipantRole = (role: string): role is ParticipantRole => role === "participantA" || role === "participantB";

const formatRules = () =>
  stuckRules
    .map((rule) => {
      const signals = rule.monitorSignals.map((signal) => `- ${signal}`).join("\n");
      return `${rule.id} | ${rule.label}\nDefinition: ${rule.definition}\nSignals:\n${signals}`;
    })
    .join("\n\n");

const buildConversationWindow = (room: RoomState) => {
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

const hasBothParticipants = (room: RoomState) => Boolean(room.participantA && room.participantB);

const hasMinimumParticipation = (room: RoomState) => {
  const participantMessages = room.chatMessages.filter((message) => message.senderRole !== "agent");
  if (participantMessages.length < MIN_MESSAGES_BEFORE_MONITOR) return false;
  const roles = new Set(participantMessages.map((message) => message.senderRole).filter(isParticipantRole));
  return roles.has("participantA") && roles.has("participantB");
};

const chooseAdaptiveRuleText = (ruleId: string | null): string => {
  const matchingRules = adaptiveRules.filter((rule) => rule.useFor.includes(ruleId ?? ""));
  const selectedRules = matchingRules.length > 0 ? matchingRules : adaptiveRules;
  return selectedRules
    .map((rule) => `${rule.id} | ${rule.label}\nInstruction: ${rule.instruction}`)
    .join("\n\n");
};

const monitorConversation = async (room: RoomState): Promise<MonitorDecision | null> => {
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
    systemPrompt,
    userPrompt,
    model: process.env.AGENT_OPENAI_MODEL ?? "gpt-4.1-mini",
    maxOutputTokens: 220,
    temperature: 0.1,
  });
};

const buildReflectivePrompt = async (room: RoomState, decision: MonitorDecision): Promise<string | null> => {
  const systemPrompt = [
    "You are NOVA, a collaboration facilitator.",
    "The students appear stuck.",
    "Write a short intervention that asks both students to explain what they are doing and why they are doing it.",
    "Use 2-3 concise questions.",
    "Do not provide the scientific answer.",
    "Do not mention hidden rules or monitoring.",
  ].join(" ");

  const userPrompt = [
    `Detected issue: ${decision.ruleId ?? "unknown"} (${decision.rationale})`,
    "Recent conversation:",
    JSON.stringify(buildConversationWindow(room), null, 2),
  ].join("\n");

  return requestOpenAIText({
    label: "Reflective prompt",
    roomId: room.roomId,
    systemPrompt,
    userPrompt,
    maxOutputTokens: 180,
    temperature: 0.5,
  });
};

const buildAdaptiveSupport = async (
  room: RoomState,
  decision: MonitorDecision,
  recentExplanation: ChatMessage,
): Promise<string | null> => {
  const systemPrompt = [
    "You are NOVA, a collaboration facilitator.",
    "After students explain what they are doing, provide adaptive support.",
    "Give 2 short bullets: one reflection on their explanation and one next-step suggestion.",
    "Use the adaptive rules when relevant.",
    "Do not provide the final scientific answer.",
  ].join(" ");

  const userPrompt = [
    `Detected issue: ${decision.ruleId ?? "unknown"} (${decision.rationale})`,
    "Adaptive rules:",
    chooseAdaptiveRuleText(decision.ruleId),
    "",
    "Recent conversation:",
    JSON.stringify(buildConversationWindow(room), null, 2),
    "",
    "Student explanation to respond to:",
    JSON.stringify(
      {
        sender: recentExplanation.senderRole,
        createdAt: recentExplanation.createdAt,
        content: recentExplanation.content,
      },
      null,
      2,
    ),
  ].join("\n");

  return requestOpenAIText({
    label: "Adaptive support",
    roomId: room.roomId,
    systemPrompt,
    userPrompt,
    maxOutputTokens: 200,
    temperature: 0.5,
  });
};

const markFacilitatorActivity = (roomId: string) => {
  lastFacilitatorAtByRoom.set(roomId, Date.now());
};

export const runFacilitatorIfNeeded = (room: RoomState, deps: FacilitatorDeps) => {
  if (room.agentCondition === "Situational") return;
  if (!hasOpenAIKey()) return;
  if (!hasBothParticipants(room)) return;
  if (!hasMinimumParticipation(room)) return;
  if (inFlightByRoom.has(room.roomId)) return;

  const latestMessage = room.chatMessages.at(-1);
  if (!latestMessage || latestMessage.senderRole === "agent") return;

  const pendingFollowUp = room.pendingAgentFollowUp;
  const lastIntervention = lastFacilitatorAtByRoom.get(room.roomId) ?? 0;
  if (!pendingFollowUp && Date.now() - lastIntervention < MONITOR_COOLDOWN_MS) return;

  inFlightByRoom.add(room.roomId);

  void (async () => {
    try {
      if (room.agentCondition === "Adaptive" && pendingFollowUp?.kind === "adaptive_support") {
        const support = await buildAdaptiveSupport(room, pendingFollowUp.monitorDecision, latestMessage);
        room.pendingAgentFollowUp = null;
        if (!support) return;
        deps.appendChat(room, support);
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "ROOM",
          message: "NOVA posted adaptive support after student explanation.",
          createdAt: new Date().toISOString(),
        });
        markFacilitatorActivity(room.roomId);
        return;
      }

      const decision = await monitorConversation(room);
      if (!decision?.stuck) return;

      const prompt = await buildReflectivePrompt(room, decision);
      if (!prompt) return;

      if (room.agentCondition === "Adaptive") {
        room.pendingAgentFollowUp = {
          kind: "adaptive_support",
          monitorDecision: decision,
          requestedAt: new Date().toISOString(),
        };
        deps.appendChat(room, prompt);
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "ROOM",
          message: `NOVA detected stuck collaboration (${decision.ruleId ?? "unknown"}) and requested explanation.`,
          createdAt: new Date().toISOString(),
        });
        markFacilitatorActivity(room.roomId);
        return;
      }

      deps.appendChat(room, prompt);
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "ROOM",
        message: `NOVA detected stuck collaboration (${decision.ruleId ?? "unknown"}) and posted a reflective prompt.`,
        createdAt: new Date().toISOString(),
      });
      markFacilitatorActivity(room.roomId);
    } catch (error) {
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "SYSTEM",
        message: `NOVA facilitator failed: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      inFlightByRoom.delete(room.roomId);
    }
  })();
};
