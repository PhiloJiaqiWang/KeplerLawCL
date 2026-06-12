import { randomUUID } from "node:crypto";
import { requestOpenAIText } from "@/agents/openai";
import type { EventLog, RoomState } from "@/lib/types";

type SummaryDeps = {
  appendChat: (room: RoomState, content: string) => void;
  appendEvent: (room: RoomState, event: EventLog) => void;
};

const SUMMARY_INTERVAL_MS = 3 * 60 * 1000;
const SUMMARY_WINDOW_MS = 30 * 60 * 1000;
const lastSummaryAtByRoom = new Map<string, number>();
const inFlightByRoom = new Set<string>();

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
    + "Write 3 short bullet points: progress, collaboration quality, and next-step recommendation. "
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

export const runControlSummaryIfDue = (room: RoomState, deps: SummaryDeps) => {
  if (room.agentCondition !== "Situational") return;
  if (!room.participantA || !room.participantB) return;
  const firstParticipantChat = room.chatMessages.find(
    (message) => message.senderRole === "participantA" || message.senderRole === "participantB",
  );
  if (!firstParticipantChat) return;

  const now = Date.now();
  const firstChatTime = Date.parse(firstParticipantChat.createdAt);
  if (Number.isFinite(firstChatTime) && now - firstChatTime > SUMMARY_WINDOW_MS) return;
  const last = lastSummaryAtByRoom.get(room.roomId) ?? 0;
  if (now - last < SUMMARY_INTERVAL_MS) return;
  if (inFlightByRoom.has(room.roomId)) return;

  lastSummaryAtByRoom.set(room.roomId, now);
  inFlightByRoom.add(room.roomId);

  void (async () => {
    try {
      const summary = await generateSummary(room);
      if (!summary) return;
      deps.appendChat(room, `NOVA Summary\n${summary}`);
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "ROOM",
        message: "NOVA posted control summary to chat.",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      deps.appendEvent(room, {
        id: randomUUID(),
        type: "SYSTEM",
        message: `NOVA summary failed: ${error instanceof Error ? error.message : String(error)}`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      inFlightByRoom.delete(room.roomId);
    }
  })();
};
