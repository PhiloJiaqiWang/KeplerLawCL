import type { EventLog, RoomState } from "@/lib/types";

type SummaryDeps = {
  appendEvent: (room: RoomState, event: EventLog) => void;
};

type MonitorTrigger = "message" | "measurement";

export const runControlSummaryOnStuckIfNeeded = (
  _room: RoomState,
  _deps: SummaryDeps,
  _trigger: MonitorTrigger = "message",
) => {
  void _trigger;
};
