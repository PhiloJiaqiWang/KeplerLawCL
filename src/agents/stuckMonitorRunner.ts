import { randomUUID } from "node:crypto";
import { buildAdaptiveHintResponse, buildSelfRegulationPrompt } from "@/agents/agentResponse";
import { hasOpenAIKey } from "@/agents/openai";
import { hasBothParticipants, hasMinimumParticipation, monitorConversation } from "@/agents/stuckMonitor";
import { agentNameByRole } from "@/lib/agentRoles";
import type { ChatMessage, EventLog, ParticipantRole, RoomState } from "@/lib/types";

type MonitorDeps = {
  appendChat: (room: RoomState, content: string) => void;
  appendEvent: (room: RoomState, event: EventLog) => void;
};

type MonitorTrigger = "message" | "measurement";

const MONITOR_COOLDOWN_MS = 60 * 1000;
const lastMonitorAtByRoom = new Map<string, number>();
const lastHandledDecisionKeyByRoom = new Map<string, string>();
const inFlightByRoom = new Set<string>();

const markMonitorActivity = (roomId: string) => {
  lastMonitorAtByRoom.set(roomId, Date.now());
};

const getExplanationMessages = (room: RoomState, requestedAt: string) =>
  room.chatMessages.filter(
    (message) =>
      message.senderRole !== "agent" && new Date(message.createdAt).getTime() > new Date(requestedAt).getTime(),
  );

const hasExternalizedReasoning = (message: ChatMessage) =>
  message.content.trim().split(/\s+/).length >= 3 && message.content.trim().length >= 12;

const isParticipantRole = (role: ChatMessage["senderRole"]): role is ParticipantRole =>
  role === "participantA" || role === "participantB";

const getReadyExplanationMessages = (room: RoomState, requestedAt: string) => {
  const explanationMessages = getExplanationMessages(room, requestedAt);
  const explainedByRole = new Set<ParticipantRole>();
  for (const message of explanationMessages) {
    if (isParticipantRole(message.senderRole) && hasExternalizedReasoning(message)) {
      explainedByRole.add(message.senderRole);
    }
  }
  return {
    explanationMessages,
    ready: explainedByRole.has("participantA") && explainedByRole.has("participantB"),
  };
};

export const runStuckMonitorIfNeeded = (
  room: RoomState,
  deps: MonitorDeps,
  trigger: MonitorTrigger = "message",
) => {
  if (!hasOpenAIKey()) return;
  if (!hasBothParticipants(room)) return;
  if (!hasMinimumParticipation(room)) return;
  if (inFlightByRoom.has(room.roomId)) return;

  const latestMessage = room.chatMessages.at(-1);
  if (trigger === "message" && (!latestMessage || latestMessage.senderRole === "agent")) return;

  if (room.pendingAgentResponse?.kind === "awaiting_explanations") {
    const pendingResponse = room.pendingAgentResponse;
    const agentName = agentNameByRole[pendingResponse.agentRole];
    const { explanationMessages, ready } = getReadyExplanationMessages(room, pendingResponse.requestedAt);
    if (!ready) return;
    if (inFlightByRoom.has(room.roomId)) return;

    inFlightByRoom.add(room.roomId);
    void (async () => {
      try {
        const hint = await buildAdaptiveHintResponse(
          room,
          pendingResponse.monitorDecision,
          pendingResponse.agentRole,
          explanationMessages,
        );
        room.pendingAgentResponse = null;
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "ROOM",
          message: "Both learners explained their reasoning after the agent prompt.",
          createdAt: new Date().toISOString(),
        });
        if (hint) {
          deps.appendChat(room, hint);
          deps.appendEvent(room, {
            id: randomUUID(),
            type: "ROOM",
            message: `${agentName} posted an adaptive hint after learner explanations.`,
            createdAt: new Date().toISOString(),
          });
        } else {
          deps.appendEvent(room, {
            id: randomUUID(),
            type: "ROOM",
            message: `${agentName} skipped the hint because learners appear ready to continue.`,
            createdAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        deps.appendEvent(room, {
          id: randomUUID(),
          type: "SYSTEM",
          message: `Agent response step 2 failed: ${error instanceof Error ? error.message : String(error)}`,
          createdAt: new Date().toISOString(),
        });
      } finally {
        inFlightByRoom.delete(room.roomId);
      }
    })();
    return;
  }

  const lastMonitor = lastMonitorAtByRoom.get(room.roomId) ?? 0;
  if (Date.now() - lastMonitor < MONITOR_COOLDOWN_MS) return;

  inFlightByRoom.add(room.roomId);

  void (async () => {
    try {
      const decision = await monitorConversation(room);
      markMonitorActivity(room.roomId);
      if (!decision?.stuck) return;
      if (decision.detectionKey && lastHandledDecisionKeyByRoom.get(room.roomId) === decision.detectionKey) return;
      if (decision.detectionKey) {
        lastHandledDecisionKeyByRoom.set(room.roomId, decision.detectionKey);
      }

      deps.appendEvent(room, {
        id: randomUUID(),
        type: "ROOM",
        message: `Stuck monitor classified ${decision.category ?? "unknown"} (${decision.ruleId ?? "unknown"}): ${decision.briefSummary ?? decision.rationale}`,
        createdAt: new Date().toISOString(),
      });

      const prompt = await buildSelfRegulationPrompt(room, decision, room.agentRole);
      if (!prompt) return;
      const agentName = agentNameByRole[room.agentRole];

      room.pendingAgentResponse = {
        kind: "awaiting_explanations",
        agentRole: room.agentRole,
        monitorDecision: decision,
        requestedAt: new Date().toISOString(),
      };
      deps.appendChat(room, prompt);
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "ROOM",
        message: `${agentName} posted Step 1 as ${room.agentRole} and requested learner explanations.`,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "SYSTEM",
        message: `Stuck monitor failed: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      inFlightByRoom.delete(room.roomId);
    }
  })();
};
