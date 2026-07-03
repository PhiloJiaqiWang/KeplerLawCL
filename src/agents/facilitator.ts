import { randomUUID } from "node:crypto";
import adaptiveRulesJson from "@/agents/config/adaptiveRules.json";
import stuckRulesJson from "@/agents/config/stuckRules.json";
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

type MonitorTrigger = "message" | "activity";
type MonitorCategory = NonNullable<MonitorDecision["category"]>;

const MONITOR_COOLDOWN_MS = 2 * 60 * 1000;
const ADAPTIVE_EXPLANATION_MESSAGE_LIMIT = 4;
const ADAPTIVE_EXPLANATION_TIMEOUT_MS = 90 * 1000;
const TYPE3_EXPLANATION_MESSAGE_LIMIT = 5;
const lastFacilitatorAtByRoom = new Map<string, number>();
const lastHandledDecisionKeyByRoom = new Map<string, string>();
const inFlightByRoom = new Set<string>();
const ruleCategoryById = new Map<string, MonitorCategory>(
  stuckRulesJson.rules.map((rule) => [rule.id, rule.category as MonitorCategory]),
);

const type3HintLibrary = {
  "Kepler First Law": {
    conceptual: [
      "Compare how distances from orbit points relate to the center versus the two foci.",
      "A circle is defined by a constant distance from one center, while an ellipse is defined by a constant sum of distances to two foci.",
      "Use evidence from multiple orbit points to test whether one-center distance or two-foci distance-sum better matches the orbit.",
    ],
    strategic: [
      "Collect center and focus distances from multiple orbit points before deciding which orbit model fits better.",
      "Measure Focus 1 and Focus 2 from the same point so the distance sum can be compared across points.",
      "Compare repeated measurement patterns across several points instead of relying on a single measurement.",
    ],
  },
  "Kepler Second Law": {
    conceptual: [
      "Compare motion using the same time interval at different orbit locations.",
      "Consider whether changes in speed across the orbit can still follow one consistent physical rule.",
      "Look at how speed and swept area behave at locations closer to and farther from the star.",
    ],
    strategic: [
      "Keep the time interval fixed when comparing swept area or motion across locations.",
      "Collect both speed and swept area measurements from multiple orbit regions before drawing a conclusion.",
      "Compare measurements from locations nearer to and farther from the star to test for a consistent pattern.",
    ],
  },
  "Kepler Third Law": {
    conceptual: [
      "Compare how orbital period and semi-major axis change together across different orbits.",
      "Focus on the relationship between orbit size and orbital period across multiple planets, not just one orbit at a time.",
      "Look for a consistent pattern linking larger semi-major axes with longer orbital periods.",
    ],
    strategic: [
      "Collect both Period and Axis measurements for multiple orbits before drawing a conclusion.",
      "Organize measurements so each orbit can be compared on both variables: orbital period and semi-major axis.",
      "Use the plot tool to compare candidate relationships after enough measurements have been collected.",
    ],
  },
} as const;

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

const buildType3Prompt = async (room: RoomState, decision: MonitorDecision): Promise<string | null> => {
  const systemPrompt = [
    "You are NOVA acting like a novice peer in the collaboration.",
    "The group appears stuck.",
    "Write one short chat message that first shows confusion about the situation, then asks both participants to explain what they are thinking or doing.",
    "Sound like a confused peer, not an expert facilitator.",
    "Ask for explanation from both participants.",
    "Use at most 2 concise questions.",
    "Do not provide the scientific answer.",
    "Do not mention hidden rules or monitoring.",
    "Keep it under 60 words.",
  ].join(" ");

  const userPrompt = [
    `Detected issue: ${decision.ruleId ?? "unknown"} (${decision.rationale})`,
    "Recent conversation:",
    JSON.stringify(buildConversationWindow(room), null, 2),
  ].join("\n");

  return requestOpenAIText({
    label: "Type3 novice-peer prompt",
    roomId: room.roomId,
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt,
    userPrompt,
    maxOutputTokens: 160,
    temperature: 0.7,
  });
};

const getType3HintOptions = (room: RoomState, decision: MonitorDecision): string[] => {
  const category = decision.category ?? (decision.ruleId ? ruleCategoryById.get(decision.ruleId) ?? null : null);
  if (category === "Conceptual trouble") {
    return [...type3HintLibrary[room.currentSimulation].conceptual];
  }
  if (category === "Strategic trouble") {
    return [...type3HintLibrary[room.currentSimulation].strategic];
  }
  return [];
};

const buildType3HintFollowUp = async (
  room: RoomState,
  decision: MonitorDecision,
  explanationMessages: ChatMessage[],
): Promise<string | null> => {
  const hintOptions = getType3HintOptions(room, decision);
  if (hintOptions.length === 0) return null;

  const systemPrompt = [
    "You are NOVA acting like a novice peer in the collaboration.",
    "You previously expressed confusion and asked both participants to explain themselves.",
    "You now have their recent explanations and a shortlist of relevant hints.",
    "Decide whether sharing one hint would help right now.",
    "If a hint is not needed or would feel irrelevant, reply with NONE.",
    "If a hint is useful, write one short hesitant peer-style message that shares one hint tentatively.",
    "Sound unsure, brief, and non-authoritative.",
    "Do not reveal the final answer.",
    "Keep the message under 50 words.",
  ].join(" ");

  const userPrompt = [
    `Detected issue: ${decision.ruleId ?? "unknown"} (${decision.rationale})`,
    `Detected category: ${decision.category ?? (decision.ruleId ? ruleCategoryById.get(decision.ruleId) ?? "unknown" : "unknown")}`,
    "Recent conversation:",
    JSON.stringify(buildConversationWindow(room), null, 2),
    "",
    "Student explanations received after NOVA asked for explanation:",
    JSON.stringify(
      explanationMessages.map((message) => ({
        sender: getSenderLabel(room, message.senderRole),
        createdAt: message.createdAt,
        content: message.content,
      })),
      null,
      2,
    ),
    "",
    "Relevant hint options:",
    JSON.stringify(hintOptions, null, 2),
  ].join("\n");

  const response = await requestOpenAIText({
    label: "Type3 novice-peer follow-up",
    roomId: room.roomId,
    context: {
      activity: room.currentActivity,
      simulation: room.currentSimulation,
      stage: room.progressBySimulation[room.currentSimulation].currentStage,
    },
    systemPrompt,
    userPrompt,
    maxOutputTokens: 120,
    temperature: 0.6,
  });

  if (!response) return null;
  return response.trim().toUpperCase() === "NONE" ? null : response;
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
  pendingFollowUp: Extract<NonNullable<RoomState["pendingAgentFollowUp"]>, { kind: "adaptive_support" }>,
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

const shouldTriggerType3Hint = (
  room: RoomState,
  pendingFollowUp: Extract<NonNullable<RoomState["pendingAgentFollowUp"]>, { kind: "type3_hint" }>,
) => {
  const explanationMessages = getExplanationMessages(room, pendingFollowUp.requestedAt);
  const participantReplies = new Set(explanationMessages.map((message) => message.senderRole));

  return {
    explanationMessages,
    ready:
      (participantReplies.has("participantA") && participantReplies.has("participantB"))
      || explanationMessages.length >= pendingFollowUp.explanationMessageLimit,
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

      if (room.agentCondition === "Type3" && pendingFollowUp?.kind === "type3_hint") {
        const { explanationMessages, ready } = shouldTriggerType3Hint(room, pendingFollowUp);
        if (!ready) return;
        const support = await buildType3HintFollowUp(room, pendingFollowUp.monitorDecision, explanationMessages);
        room.pendingAgentFollowUp = null;
        if (!support) return;
        deps.appendChat(room, support);
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "ROOM",
          message: "NOVA posted a Type3 hesitant hint after collecting student explanations.",
          createdAt: new Date().toISOString(),
        });
        markFacilitatorActivity(room.roomId);
        return;
      }

      const decision = await monitorConversation(room);
      if (!decision?.stuck) return;
      if (decision.detectionKey && lastHandledDecisionKeyByRoom.get(room.roomId) === decision.detectionKey) return;

      const prompt = await (room.agentCondition === "Type3"
        ? buildType3Prompt(room, decision)
        : buildReflectivePrompt(room, decision));
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

      if (room.agentCondition === "Type3") {
        room.pendingAgentFollowUp = {
          kind: "type3_hint",
          monitorDecision: decision,
          requestedAt: new Date().toISOString(),
          explanationMessageLimit: TYPE3_EXPLANATION_MESSAGE_LIMIT,
        };
        deps.appendChat(room, prompt);
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "ROOM",
          message: `NOVA detected a collaboration issue (${decision.ruleId ?? "unknown"}) and requested explanation as a novice peer.`,
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
