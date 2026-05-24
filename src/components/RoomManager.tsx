"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentController } from "@/components/AgentController";
import { ChatRoom } from "@/components/ChatRoom";
import { EventLogger } from "@/components/EventLogger";
import { MissionBriefing } from "@/components/MissionBriefing";
import { SimulationRunner } from "@/components/SimulationRunner";
import { StagePanel } from "@/components/StagePanel";
import { StagePlaceholder } from "@/components/StagePlaceholder";
import { WORKFLOW_V2_ENABLED } from "@/lib/flags";
import type {
  AgentCondition,
  MeasurementPoint,
  MeasurementTarget,
  ParticipantRole,
  RoomState,
  SimulationType,
} from "@/lib/types";

type RoomManagerProps = {
  roomId: string;
  role: ParticipantRole;
};

export function RoomManager({ roomId, role }: RoomManagerProps) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [briefingAccepted, setBriefingAccepted] = useState(false);
  const briefingKey = `briefing-accepted:${roomId}:${role}`;

  const loadRoom = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
    const payload = (await response.json()) as { room: RoomState };
    setRoom(payload.room);
  }, [roomId]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadRoom();
    }, 0);
    const interval = setInterval(() => void loadRoom(), 2000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadRoom]);

  useEffect(() => {
    const init = setTimeout(() => {
      const saved = localStorage.getItem(briefingKey);
      setBriefingAccepted(saved === "true");
    }, 0);
    return () => clearTimeout(init);
  }, [briefingKey]);

  const sendMessage = async (content: string) => {
    const response = await fetch(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
    if (!response.ok) throw new Error("Message send failed");
    await loadRoom();
  };

  const setAgentCondition = async (condition: AgentCondition) => {
    const response = await fetch(`/api/rooms/${roomId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ condition }),
    });
    if (!response.ok) throw new Error("Agent update failed");
    await loadRoom();
  };

  const setSimulation = async (simulation: SimulationType) => {
    const response = await fetch(`/api/rooms/${roomId}/simulation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulation }),
    });
    if (!response.ok) throw new Error("Simulation update failed");
    await loadRoom();
  };

  const submitPlanning = async (planText: string, collaborationConfirmed: boolean) => {
    const response = await fetch(`/api/rooms/${roomId}/planning/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, planText, collaborationConfirmed }),
    });
    if (response.status === 409) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Planning stage is already closed.");
    }
    if (response.status === 400) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Invalid plan submission.");
    }
    if (!response.ok) throw new Error("Plan submission failed");
    await loadRoom();
  };

  const addMeasurement = async (point: MeasurementPoint, target: MeasurementTarget | null) => {
    const response = await fetch(`/api/rooms/${roomId}/measurements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, point, target }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Measurement failed");
    }
    await loadRoom();
  };

  const proceedToDiscussion = async () => {
    const response = await fetch(`/api/rooms/${roomId}/stage/discussion`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to proceed to Discussion.");
    }
    await loadRoom();
  };

  const submitDiscussion = async (q1: string, q2: string) => {
    const response = await fetch(`/api/rooms/${roomId}/discussion/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, q1, q2 }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? "Unable to submit discussion answers.");
    }
    await loadRoom();
  };

  const currentRoleName = useMemo(() => {
    if (!room) return role;
    return role === "participantA" ? room.participantA?.name : room.participantB?.name;
  }, [room, role]);
  if (!room) {
    return <p className="p-6 text-sm text-slate-600">Loading room...</p>;
  }
  const currentStage = room.progressBySimulation[room.currentSimulation].currentStage;
  const currentProgress = room.progressBySimulation[room.currentSimulation];
  const maxMeasurements = 6;
  const measurementRemaining = Math.max(0, maxMeasurements - currentProgress.measurements.length);
  const displayNameByRole: Record<ParticipantRole, string> = {
    participantA: room.participantA?.name ?? "Participant A",
    participantB: room.participantB?.name ?? "Participant B",
  };

  const acceptBriefing = () => {
    localStorage.setItem(briefingKey, "true");
    setBriefingAccepted(true);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {!briefingAccepted ? <MissionBriefing onProceed={acceptBriefing} /> : null}
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
        <span>
          <strong>Room:</strong> {room.roomId}
        </span>
        <span>
          <strong>Role:</strong> {role} {currentRoleName ? `(${currentRoleName})` : ""}
        </span>
        <span>
          <strong>Activity:</strong> {room.currentActivity}
        </span>
        <span>
          <strong>Stage:</strong> {currentStage}
        </span>
        <span>
          <strong>Simulation:</strong> {room.currentSimulation}
        </span>
        <AgentController value={room.agentCondition} onChange={setAgentCondition} />
      </header>

      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        <SimulationRunner
          simulation={room.currentSimulation}
          onChange={setSimulation}
          onMeasure={addMeasurement}
          role={role}
          currentStage={currentStage}
          measurementRemaining={measurementRemaining}
        />
        {WORKFLOW_V2_ENABLED ? (
          <StagePanel
            room={room}
            role={role}
            onSubmitPlan={submitPlanning}
            onProceedToDiscussion={proceedToDiscussion}
            onSubmitDiscussion={submitDiscussion}
          />
        ) : (
          <StagePlaceholder />
        )}
        <ChatRoom
          role={role}
          messages={room.chatMessages}
          displayNameByRole={displayNameByRole}
          onSend={sendMessage}
        />
      </main>

      <div className="border-t border-slate-300 bg-white p-3">
        <EventLogger eventLogs={room.eventLogs} />
      </div>
    </div>
  );
}
