"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentController } from "@/components/AgentController";
import { ChatRoom } from "@/components/ChatRoom";
import { DeveloperPanel } from "@/components/DeveloperPanel";
import { EventLogger } from "@/components/EventLogger";
import { MissionBriefing } from "@/components/MissionBriefing";
import { SimulationRunner } from "@/components/SimulationRunner";
import { StagePanel } from "@/components/StagePanel";
import { StagePlaceholder } from "@/components/StagePlaceholder";
import { WORKFLOW_V2_ENABLED } from "@/lib/flags";
import { getMaxMeasurementsForSimulation } from "@/lib/measurementLimits";
import type { OpenAIDebugTrace } from "@/agents/debug";
import type { OpenAIStatus } from "@/agents/status";
import type {
  AgentCondition,
  MeasurementPoint,
  MeasurementTarget,
  ParticipantRole,
  RoomState,
  SenderRole,
  SimulationType,
} from "@/lib/types";

type RoomManagerProps = {
  roomId: string;
  role: ParticipantRole;
};

export function RoomManager({ roomId, role }: RoomManagerProps) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const [openAIDebugTraces, setOpenAIDebugTraces] = useState<OpenAIDebugTrace[]>([]);
  const [openAIStatus, setOpenAIStatus] = useState<OpenAIStatus>({
    state: "unavailable",
    detail: "Checking OpenAI status.",
  });
  const [briefingAccepted, setBriefingAccepted] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const briefingKey = `briefing-accepted:${roomId}:${role}`;
  const developerModeKey = `developer-mode:${roomId}:${role}`;
  const displayNameKey = `display-name:${roomId}:${role}`;
  const autoRejoinInFlight = useRef(false);

  const loadRoom = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load room (${response.status}).`);
    }
    const payload = (await response.json()) as {
      room?: RoomState;
      error?: string;
    };
    if (!payload.room) {
      throw new Error(payload.error ?? "Room payload is missing.");
    }
    setRoom(payload.room);
  }, [roomId]);

  const loadDeveloperDiagnostics = useCallback(async () => {
    if (!developerMode) {
      setOpenAIStatus({
        state: "unavailable",
        detail: "Developer mode is off.",
      });
      setOpenAIDebugTraces([]);
      return;
    }

    const response = await fetch(`/api/rooms/${roomId}/developer`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load developer diagnostics (${response.status}).`);
    }
    const payload = (await response.json()) as {
      openAIStatus?: OpenAIStatus;
      openAIDebug?: { traces?: OpenAIDebugTrace[] };
      error?: string;
    };

    setOpenAIStatus(
      payload.openAIStatus ?? {
        state: "unavailable",
        detail: payload.error ?? "OpenAI status did not load.",
      },
    );
    setOpenAIDebugTraces(payload.openAIDebug?.traces ?? []);
  }, [developerMode, roomId]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadRoom().catch((error) => {
        console.error("Initial room load failed", error);
      });
    }, 0);
    const interval = setInterval(() => {
      void loadRoom().catch((error) => {
        console.error("Room polling failed", error);
      });
    }, 2000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadRoom]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadDeveloperDiagnostics().catch((error) => {
        console.error("Initial developer diagnostics load failed", error);
      });
    }, 0);
    const interval = setInterval(() => {
      void loadDeveloperDiagnostics().catch((error) => {
        console.error("Developer diagnostics polling failed", error);
      });
    }, 2000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadDeveloperDiagnostics]);

  useEffect(() => {
    const init = setTimeout(() => {
      const saved = localStorage.getItem(briefingKey);
      setBriefingAccepted(saved === "true");
      const savedDeveloperMode = localStorage.getItem(developerModeKey);
      setDeveloperMode(savedDeveloperMode === "true");
    }, 0);
    return () => clearTimeout(init);
  }, [briefingKey, developerModeKey]);

  useEffect(() => {
    if (!room) return;
    if (autoRejoinInFlight.current) return;

    const participant = role === "participantA" ? room.participantA : room.participantB;
    if (participant) return;

    const savedName = localStorage.getItem(displayNameKey)?.trim();
    if (!savedName) return;

    autoRejoinInFlight.current = true;
    void (async () => {
      try {
        const response = await fetch(`/api/rooms/${roomId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, name: savedName }),
        });
        if (response.ok) {
          await loadRoom();
        }
      } catch (error) {
        console.error("Auto rejoin failed", error);
      } finally {
        autoRejoinInFlight.current = false;
      }
    })();
  }, [displayNameKey, loadRoom, role, room, roomId]);

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
  const displayNameByRole: Record<SenderRole, string> = {
    participantA: room.participantA?.name ?? "Participant A",
    participantB: room.participantB?.name ?? "Participant B",
    agent: "NOVA",
  };
  const missionLabelBySimulation: Record<SimulationType, string> = {
    "Kepler First Law": "Mission 1: Kepler First Law",
    "Kepler Second Law": "Mission 2: Kepler Second Law",
    "Kepler Third Law": "Mission 3: Kepler Third Law",
  };
  const knowledgeBySimulation: Record<SimulationType, { title: string; basics: string[]; tips: string[] }> = {
    "Kepler First Law": {
      title: "1st Law",
      basics: [
        "A circle has one center. Every point on the circle is the same distance from the center.",
        "An ellipse has two foci. The sum of the distances from any point on the ellipse to the two foci remains constant.",
        "Distance measurements can provide evidence about the shape of an orbit.",
        "Compare distances from multiple orbit points.",
      ],
      tips: [
        "Collect distance measurements from different orbit points.",
        "Compare measurements across locations on the orbit.",
        "Combine observations from both participants before drawing conclusions.",
        "Use your limited measurements strategically.",
      ],
    },
    "Kepler Second Law": {
      title: "2nd Law",
      basics: [
        "Use the same time interval when comparing motion at different locations in the orbit.",
        "Examine how a planet's motion changes at points closer to and farther from the star.",
        "Collect evidence from multiple locations before identifying a pattern.",
      ],
      tips: [
        "Use the `Swept Area Tool` with one fixed time interval (e.g., 10 s) for all measurements.",
        "Compare observations from different regions of the orbit.",
        "Consider both swept area and speed when interpreting motion.",
        "Use evidence from multiple measurements before drawing conclusions.",
      ],
    },
    "Kepler Third Law": {
      title: "Third Law",
      basics: [
        "Orbital Period (P): The time it takes a planet to complete one full orbit around the star.",
        "Semi-major Axis (a): The average distance between a planet and the star, represented by half of the orbit's longest diameter.",
        "Compare measurements from multiple orbits before identifying a pattern.",
      ],
      tips: [
        "For each selected orbit, collect both Period (P) and Semi-major Axis (a) measurements.",
        "Use the plot tool to explore relationships between orbit size and orbital period.",
        "Compare patterns across multiple orbits before drawing conclusions.",
      ],
    },
  };
  const knowledge = knowledgeBySimulation[room.currentSimulation];

  const acceptBriefing = () => {
    localStorage.setItem(briefingKey, "true");
    setBriefingAccepted(true);
  };

  const toggleDeveloperMode = () => {
    const nextValue = !developerMode;
    setDeveloperMode(nextValue);
    localStorage.setItem(developerModeKey, String(nextValue));
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {!briefingAccepted ? <MissionBriefing role={role} onProceed={acceptBriefing} /> : null}
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
          <strong>Simulation:</strong> {missionLabelBySimulation[room.currentSimulation]}
        </span>
        <button
          onClick={() => setKnowledgeOpen(true)}
          className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-200"
        >
          Knowledge Base
        </button>
        <button
          onClick={toggleDeveloperMode}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm ${
            developerMode
              ? "border border-slate-900 bg-slate-900 text-white"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Developer Mode {developerMode ? "On" : "Off"}
        </button>
        <AgentController value={room.agentCondition} onChange={setAgentCondition} />
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-3">
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

      {developerMode ? (
        <div className="border-t border-slate-300 bg-white p-3 space-y-3">
          <DeveloperPanel openAIStatus={openAIStatus} traces={openAIDebugTraces} />
          <EventLogger eventLogs={room.eventLogs} />
        </div>
      ) : null}
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
            <p className="mt-1 text-xs text-slate-500">Current module: {missionLabelBySimulation[room.currentSimulation]}</p>
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
