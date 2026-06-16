import { randomUUID } from "node:crypto";
import { hasOpenAIKey, requestOpenAIText } from "@/agents/openai";
import { hasBothParticipants, hasMinimumParticipation, monitorConversation } from "@/agents/stuckMonitor";
import type { EventLog, RoomState } from "@/lib/types";

type SummaryDeps = {
  appendChat: (room: RoomState, content: string) => void;
  appendEvent: (room: RoomState, event: EventLog) => void;
};

const STUCK_SUMMARY_COOLDOWN_MS = 2 * 60 * 1000;
const lastSummaryAtByRoom = new Map<string, number>();
const inFlightByRoom = new Set<string>();
const lastStuckSummaryAtByRoom = new Map<string, number>();

const buildPromptPayload = (room: RoomState) => {
  const progress = room.progressBySimulation[room.currentSimulation];
  const chatTail = room.chatMessages.slice(-30).map((m) => ({
    sender: m.senderRole,
    content: m.content,
    createdAt: m.createdAt,
  }));
  const eventTail = room.eventLogs.slice(-40).map((e) => ({
    type: e.type,
    message: e.message,
    createdAt: e.createdAt,
  }));

  return JSON.stringify(
    {
      roomId: room.roomId,
      stage: progress.currentStage,
      simulation: room.currentSimulation,
      activity: room.currentActivity,
      measurementCount: progress.measurements.length,
      recentChat: chatTail,
      recentEvents: eventTail,
    },
    null,
    2,
  );
};

const generateSummary = async (room: RoomState): Promise<string | null> => {
  const systemPrompt =
    "You are NOVA, a collaboration facilitator. Summarize what has happened so far for two participants. "
    + "Write 2 short bullet points: progress and collaboration quality. "
    + "Do not reveal final scientific answers.";
  const userPayload = buildPromptPayload(room);
  return requestOpenAIText({
    label: "Situational summary",
    roomId: room.roomId,
    systemPrompt,
    userPrompt: userPayload,
    maxOutputTokens: 220,
    temperature: 0.4,
  });
};

const postSummary = async (
  room: RoomState,
  deps: SummaryDeps,
  eventMessage: string,
) => {
  const summary = await generateSummary(room);
  if (!summary) return;
  deps.appendChat(room, `NOVA Summary\n${summary}`);
  deps.appendEvent(room, {
    id: randomUUID(),
    type: "ROOM",
    message: eventMessage,
    createdAt: new Date().toISOString(),
  });
};

export const runControlSummaryOnStuckIfNeeded = (room: RoomState, deps: SummaryDeps) => {
  if (room.agentCondition !== "Situational") return;
  if (!hasOpenAIKey()) return;
  if (!hasBothParticipants(room)) return;
  if (!hasMinimumParticipation(room)) return;
  if (inFlightByRoom.has(room.roomId)) return;

  const latestMessage = room.chatMessages.at(-1);
  if (!latestMessage || latestMessage.senderRole === "agent") return;

  const lastStuckSummaryAt = lastStuckSummaryAtByRoom.get(room.roomId) ?? 0;
  if (Date.now() - lastStuckSummaryAt < STUCK_SUMMARY_COOLDOWN_MS) return;

  inFlightByRoom.add(room.roomId);

  void (async () => {
    try {
      const decision = await monitorConversation(room);
      if (!decision?.stuck) return;

      lastStuckSummaryAtByRoom.set(room.roomId, Date.now());
      lastSummaryAtByRoom.set(room.roomId, Date.now());
      await postSummary(room, deps, `NOVA posted situational summary after stuck detection (${decision.ruleId ?? "unknown"}).`);
    } catch (error) {
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "SYSTEM",
        message: `NOVA stuck-triggered summary failed: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      inFlightByRoom.delete(room.roomId);
    }
  })();
};
