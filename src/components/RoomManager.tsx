"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentController } from "@/components/AgentController";
import { ChatRoom } from "@/components/ChatRoom";
import { EventLogger } from "@/components/EventLogger";
import { SimulationRunner } from "@/components/SimulationRunner";
import type { AgentCondition, ParticipantRole, RoomState } from "@/lib/types";

type RoomManagerProps = {
  roomId: string;
  role: ParticipantRole;
};

export function RoomManager({ roomId, role }: RoomManagerProps) {
  const [room, setRoom] = useState<RoomState | null>(null);

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

  const currentRoleName = useMemo(() => {
    if (!room) return role;
    return role === "participantA" ? room.participantA?.name : room.participantB?.name;
  }, [room, role]);

  if (!room) {
    return <p className="p-6 text-sm text-slate-600">Loading room...</p>;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
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
          <strong>Stage:</strong> {room.currentStage}
        </span>
        <AgentController value={room.agentCondition} onChange={setAgentCondition} />
      </header>

      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <SimulationRunner />
        <ChatRoom role={role} messages={room.chatMessages} onSend={sendMessage} />
      </main>

      <div className="border-t border-slate-300 bg-white p-3">
        <EventLogger eventLogs={room.eventLogs} />
      </div>
    </div>
  );
}
