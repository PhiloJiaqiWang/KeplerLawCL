import { randomUUID } from "node:crypto";
import adaptiveRulesJson from "@/agents/config/adaptiveRules.json";
import { hasOpenAIKey, requestOpenAIText } from "@/agents/openai";
import {
  buildConversationWindow,
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
const lastFacilitatorAtByRoom = new Map<string, number>();
const lastHandledDecisionKeyByRoom = new Map<string, string>();
const inFlightByRoom = new Set<string>();

const buildAdaptivePolicyText = () => JSON.stringify(adaptiveRulesJson, null, 2);

const buildReflectivePrompt = async (room: RoomState, decision: MonitorDecision): Promise<string | null> => {
  if (decision.ruleId === "inactivity_2min") {
    return [
      "NOVA check-in:",
      "What should each of you do next?",
      "Share one measurement or idea you can contribute in the next minute.",
    ].join("\n");
  }

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
  recentExplanation: ChatMessage,
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
  if (trigger === "poll" && pendingFollowUp) return;
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
