export type ParticipantRole = "participantA" | "participantB";

export type ParticipantSlot = {
  id: string;
  name: string;
  joinedAt: string;
};

export type Activity = "Orientation" | "Simulation" | "Debrief";
export type Stage = "Planning" | "Investigation" | "Discussion" | "Submission";
export type AgentCondition = "Control" | "Assistive" | "Observation";
export type SimulationType = "Kepler First Law" | "Kepler Second Law" | "Kepler Third Law";

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

export type MeasurementPoint = "L1" | "L2" | "L3" | "R1" | "R2" | "R3";
export type MeasurementTarget =
  | "L1"
  | "L2"
  | "L3"
  | "R1"
  | "R2"
  | "R3"
  | "Center"
  | "Focus 1"
  | "Focus 2";

export type MeasurementRecord = {
  id: string;
  role: ParticipantRole;
  point: MeasurementPoint;
  target: MeasurementTarget | null;
  distance: number;
  createdAt: string;
};

export type DiscussionAnswers = {
  q1: string;
  q2: string;
};

export type SimulationProgress = {
  currentStage: Stage;
  planByRole: Partial<Record<ParticipantRole, string>>;
  collaborationConfirmedByRole: Partial<Record<ParticipantRole, boolean>>;
  measurements: MeasurementRecord[];
  discussionAnswersByRole: Partial<Record<ParticipantRole, DiscussionAnswers>>;
};

export type RoomState = {
  roomId: string;
  participantA: ParticipantSlot | null;
  participantB: ParticipantSlot | null;
  currentActivity: Activity;
  currentSimulation: SimulationType;
  progressBySimulation: Record<SimulationType, SimulationProgress>;
  agentCondition: AgentCondition;
  chatMessages: ChatMessage[];
  eventLogs: EventLog[];
};
