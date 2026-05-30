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
import { getMaxMeasurementsForSimulation } from "@/lib/measurementLimits";
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
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
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

  const addMeasurement = async (
    point: MeasurementPoint,
    target: MeasurementTarget | null,
    options?: {
      tool?: "Speed Tool" | "Swept Area Tool";
      timeIntervalSec?: 5 | 10 | 15;
      thirdLawTool?: "Period Tool" | "Axis Tool";
      thirdLawOrbit?: "Orbit 1" | "Orbit 2" | "Orbit 3" | "Orbit 4" | "Orbit 5" | "Orbit 6";
    },
  ) => {
    const response = await fetch(`/api/rooms/${roomId}/measurements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, point, target, ...options }),
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
  const maxMeasurements = getMaxMeasurementsForSimulation(room.currentSimulation);
  const measurementRemaining = Math.max(0, maxMeasurements - currentProgress.measurements.length);
  const displayNameByRole: Record<ParticipantRole, string> = {
    participantA: room.participantA?.name ?? "Participant A",
    participantB: room.participantB?.name ?? "Participant B",
  };
  const knowledgeBySimulation: Record<SimulationType, { title: string; basics: string[]; tips: string[] }> = {
    "Kepler First Law": {
      title: "Kepler First Law Essentials",
      basics: [
        "Test two competing hypotheses using measurements.",
        "Hypothesis A (Circle): distances from orbit points to one shared center are roughly constant.",
        "Hypothesis B (Ellipse): (distance to Focus 1 + distance to Focus 2) is roughly constant across points.",
      ],
      tips: [
        "If focus sums stay similar across points, that supports Hypothesis B.",
        "If center distances stay similar across points, that supports a circle model.",
        "Use both participants' measurements to avoid one-sided sampling.",
      ],
    },
    "Kepler Second Law": {
      title: "Kepler Second Law Essentials",
      basics: [
        "Hold time interval constant when comparing swept areas.",
        "Compare speed at near-star points vs far-star points.",
        "Use multiple locations before claiming a trend.",
      ],
      tips: [
        "Use `Swept Area Tool` with one fixed interval (e.g., always 10s) across points.",
        "Pair each area observation with speed observations from similar regions.",
        "If equal-time areas are similar while speed changes by position, your evidence is strong.",
      ],
    },
    "Kepler Third Law": {
      title: "Kepler Third Law Essentials",
      basics: [
        "Collect both period (P) and semi-major axis (a) for multiple orbits.",
        "Use cross-orbit comparison instead of one-orbit reasoning.",
      ],
      tips: [
        "For each selected orbit, complete both `Period` and `Axis` measurements.",
        "Use the plot tool to compare exponent pairs (a, a^2, a^3) vs (P, P^2, P^3).",
        "The best-supported model is the one with the clearest across-orbit consistency.",
      ],
    },
  };
  const knowledge = knowledgeBySimulation[room.currentSimulation];

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
          <strong>Stage:</strong> {currentStage}
        </span>
        <span>
          <strong>Simulation:</strong> {room.currentSimulation}
        </span>
        <button
          onClick={() => setKnowledgeOpen(true)}
          className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-200"
        >
          Knowledge Base
        </button>
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
          maxMeasurements={maxMeasurements}
          measurements={currentProgress.measurements}
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
      {knowledgeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-300 bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-slate-900">{knowledge.title}</h3>
              <button
                onClick={() => setKnowledgeOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Current module: {room.currentSimulation}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">Core Basics</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {knowledge.basics.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-900">How To Use In Game</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {knowledge.tips.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
