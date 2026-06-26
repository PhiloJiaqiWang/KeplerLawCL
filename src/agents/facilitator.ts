import { randomUUID } from "node:crypto";
import adaptiveRulesJson from "@/agents/config/adaptiveRules.json";
import { hasOpenAIKey, requestOpenAIText } from "@/agents/openai";
import {
  buildConversationWindow,
  getSenderLabel,
  hasBothParticipants,
  hasMinimumParticipation,
  monitorConversation,
} from "@/agents/stuckMonitor";
import type { ChatMessage, EventLog, MonitorDecision, RoomState } from "@/lib/types";

type FacilitatorDeps = {
  appendChat: (room: RoomState, content: string) => void;
  appendEvent: (room: RoomState, event: EventLog) => void;
};

type MonitorTrigger = "message" | "poll";

const MONITOR_COOLDOWN_MS = 2 * 60 * 1000;
const ADAPTIVE_EXPLANATION_MESSAGE_LIMIT = 4;
const ADAPTIVE_EXPLANATION_TIMEOUT_MS = 90 * 1000;
const lastFacilitatorAtByRoom = new Map<string, number>();
const lastHandledDecisionKeyByRoom = new Map<string, string>();
const inFlightByRoom = new Set<string>();

const buildAdaptivePolicyText = () => JSON.stringify(adaptiveRulesJson, null, 2);

const buildReflectivePrompt = async (room: RoomState, decision: MonitorDecision): Promise<string | null> => {
  const systemPrompt = [
    "You are NOVA, a collaboration facilitator.",
    "The students appear to need support.",
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
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt,
    userPrompt,
    maxOutputTokens: 180,
    temperature: 0.5,
  });
};

const buildAdaptiveSupport = async (
  room: RoomState,
  decision: MonitorDecision,
  explanationMessages: ChatMessage[],
): Promise<string | null> => {
  const systemPrompt = [
    "You are NOVA, a collaboration facilitator.",
    "This is Stage 2: Adaptive Facilitation.",
    "After receiving the students' explanations, infer the primary regulation problem.",
    "Decide whether intervention is necessary.",
    "If the students are already regulating effectively, briefly encourage them to continue.",
    "If intervention is needed, generate exactly one concise facilitator message.",
    "The message must encourage self-regulation, discussion, and explanation when useful.",
    "Encourage planning or reflection when appropriate.",
    "Never reveal the answer.",
    "Never solve the task.",
    "Keep the message under 80 words.",
  ].join(" ");

  const userPrompt = [
    `Detected issue: ${decision.ruleId ?? "unknown"} (${decision.rationale})`,
    "Adaptive facilitation policy:",
    buildAdaptivePolicyText(),
    "",
    "Recent conversation:",
    JSON.stringify(buildConversationWindow(room), null, 2),
    "",
    "Student explanations received after NOVA asked for explanation:",
    JSON.stringify(
      explanationMessages.length > 0
        ? explanationMessages.map((message) => ({
            sender: getSenderLabel(room, message.senderRole),
            createdAt: message.createdAt,
            content: message.content,
          }))
        : [{ sender: "None", createdAt: null, content: "No student explanation was received before the timeout." }],
      null,
      2,
    ),
  ].join("\n");

  return requestOpenAIText({
    label: "Adaptive support",
    roomId: room.roomId,
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt,
    userPrompt,
    maxOutputTokens: 200,
    temperature: 0.5,
  });
};

const markFacilitatorActivity = (roomId: string) => {
  lastFacilitatorAtByRoom.set(roomId, Date.now());
};

const getExplanationMessages = (room: RoomState, requestedAt: string) =>
  room.chatMessages.filter(
    (message) =>
      message.senderRole !== "agent" && new Date(message.createdAt).getTime() > new Date(requestedAt).getTime(),
  );

const shouldTriggerAdaptiveSupport = (
  room: RoomState,
  pendingFollowUp: NonNullable<RoomState["pendingAgentFollowUp"]>,
) => {
  const explanationMessages = getExplanationMessages(room, pendingFollowUp.requestedAt);
  const participantReplies = new Set(explanationMessages.map((message) => message.senderRole));
  const timeoutReached = Date.now() - new Date(pendingFollowUp.requestedAt).getTime() >= pendingFollowUp.explanationTimeoutMs;

  return {
    explanationMessages,
    ready:
      participantReplies.has("participantA") && participantReplies.has("participantB")
      || explanationMessages.length >= pendingFollowUp.explanationMessageLimit
      || timeoutReached,
  };
};

export const runFacilitatorIfNeeded = (
  room: RoomState,
  deps: FacilitatorDeps,
  trigger: MonitorTrigger = "message",
) => {
  if (room.agentCondition === "No agent") return;
  if (!hasOpenAIKey()) return;
  if (!hasBothParticipants(room)) return;
  if (!hasMinimumParticipation(room)) return;
  if (inFlightByRoom.has(room.roomId)) return;

  const latestMessage = room.chatMessages.at(-1);
  if (trigger === "message" && (!latestMessage || latestMessage.senderRole === "agent")) return;

  const pendingFollowUp = room.pendingAgentFollowUp;
  const lastIntervention = lastFacilitatorAtByRoom.get(room.roomId) ?? 0;
  if (!pendingFollowUp && Date.now() - lastIntervention < MONITOR_COOLDOWN_MS) return;

  inFlightByRoom.add(room.roomId);

  void (async () => {
    try {
      if (room.agentCondition === "Adaptive" && pendingFollowUp?.kind === "adaptive_support") {
        const { explanationMessages, ready } = shouldTriggerAdaptiveSupport(room, pendingFollowUp);
        if (!ready) return;
        const support = await buildAdaptiveSupport(room, pendingFollowUp.monitorDecision, explanationMessages);
        room.pendingAgentFollowUp = null;
        if (!support) return;
        deps.appendChat(room, support);
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "ROOM",
          message: "NOVA posted adaptive support after collecting student explanations.",
          createdAt: new Date().toISOString(),
        });
        markFacilitatorActivity(room.roomId);
        return;
      }

      const decision = await monitorConversation(room);
      if (!decision?.stuck) return;
      if (decision.detectionKey && lastHandledDecisionKeyByRoom.get(room.roomId) === decision.detectionKey) return;

      const prompt = await buildReflectivePrompt(room, decision);
      if (!prompt) return;
      if (decision.detectionKey) {
        lastHandledDecisionKeyByRoom.set(room.roomId, decision.detectionKey);
      }

      if (room.agentCondition === "Adaptive") {
        room.pendingAgentFollowUp = {
          kind: "adaptive_support",
          monitorDecision: decision,
          requestedAt: new Date().toISOString(),
          explanationMessageLimit: ADAPTIVE_EXPLANATION_MESSAGE_LIMIT,
          explanationTimeoutMs: ADAPTIVE_EXPLANATION_TIMEOUT_MS,
        };
        deps.appendChat(room, prompt);
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "ROOM",
          message: `NOVA detected a collaboration issue (${decision.ruleId ?? "unknown"}) and requested explanation.`,
          createdAt: new Date().toISOString(),
        });
        markFacilitatorActivity(room.roomId);
        return;
      }

      deps.appendChat(room, prompt);
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "ROOM",
        message: `NOVA detected a collaboration issue (${decision.ruleId ?? "unknown"}) and posted a reflective prompt.`,
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
