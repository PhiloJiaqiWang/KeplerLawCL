import type { EventLog, RoomState } from "@/lib/types";

type SummaryDeps = {
  appendChat: (room: RoomState, content: string) => void;
  appendEvent: (room: RoomState, event: EventLog) => void;
};

type MonitorTrigger = "message" | "poll";

export const runControlSummaryOnStuckIfNeeded = (
  _room: RoomState,
  _deps: SummaryDeps,
  _trigger: MonitorTrigger = "message",
) => {
  void _trigger;
};
