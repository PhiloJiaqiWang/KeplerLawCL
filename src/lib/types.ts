export type ParticipantRole = "participantA" | "participantB";

export type ParticipantSlot = {
  id: string;
  name: string;
  joinedAt: string;
};

export type Activity = "Orientation" | "Simulation" | "Debrief";
export type Stage = "Stage 1" | "Stage 2" | "Stage 3";
export type AgentCondition = "Control" | "Assistive" | "Observation";

export type ChatMessage = {
  id: string;
  senderRole: ParticipantRole;
  content: string;
  createdAt: string;
};

export type EventLog = {
  id: string;
  type: "SYSTEM" | "CHAT" | "ROOM";
  message: string;
  createdAt: string;
};

export type RoomState = {
  roomId: string;
  participantA: ParticipantSlot | null;
  participantB: ParticipantSlot | null;
  currentActivity: Activity;
  currentStage: Stage;
  agentCondition: AgentCondition;
  chatMessages: ChatMessage[];
  eventLogs: EventLog[];
};
