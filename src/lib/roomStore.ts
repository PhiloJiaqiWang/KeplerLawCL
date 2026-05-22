import { randomUUID } from "node:crypto";
import {
  type AgentCondition,
  type EventLog,
  type ParticipantRole,
  type ParticipantSlot,
  type RoomState,
} from "@/lib/types";

const rooms = new Map<string, RoomState>();

const defaultEvent = (roomId: string): EventLog => ({
  id: randomUUID(),
  type: "SYSTEM",
  message: `Room ${roomId} initialized.`,
  createdAt: new Date().toISOString(),
});

export const createOrGetRoom = (roomId: string): RoomState => {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const room: RoomState = {
    roomId,
    participantA: null,
    participantB: null,
    currentActivity: "Orientation",
    currentStage: "Stage 1",
    agentCondition: "Control",
    chatMessages: [],
    eventLogs: [defaultEvent(roomId)],
  };

  rooms.set(roomId, room);
  return room;
};

export const getRoom = (roomId: string): RoomState | null => rooms.get(roomId) ?? null;

const slotKeyByRole: Record<ParticipantRole, "participantA" | "participantB"> = {
  participantA: "participantA",
  participantB: "participantB",
};

export const joinRole = (roomId: string, role: ParticipantRole, name: string): RoomState => {
  const room = createOrGetRoom(roomId);
  const slotKey = slotKeyByRole[role];

  if (room[slotKey]) {
    throw new Error("ROLE_TAKEN");
  }

  const participant: ParticipantSlot = {
    id: randomUUID(),
    name,
    joinedAt: new Date().toISOString(),
  };

  room[slotKey] = participant;
  room.eventLogs.push({
    id: randomUUID(),
    type: "ROOM",
    message: `${name} joined as ${role}.`,
    createdAt: new Date().toISOString(),
  });

  return room;
};

export const postMessage = (roomId: string, role: ParticipantRole, content: string): RoomState => {
  const room = createOrGetRoom(roomId);

  const message = {
    id: randomUUID(),
    senderRole: role,
    content,
    createdAt: new Date().toISOString(),
  };

  room.chatMessages.push(message);
  room.eventLogs.push({
    id: randomUUID(),
    type: "CHAT",
    message: `${role}: ${content}`,
    createdAt: message.createdAt,
  });

  return room;
};

export const updateAgentCondition = (roomId: string, condition: AgentCondition): RoomState => {
  const room = createOrGetRoom(roomId);
  room.agentCondition = condition;
  room.eventLogs.push({
    id: randomUUID(),
    type: "SYSTEM",
    message: `Agent condition changed to ${condition}.`,
    createdAt: new Date().toISOString(),
  });
  return room;
};
