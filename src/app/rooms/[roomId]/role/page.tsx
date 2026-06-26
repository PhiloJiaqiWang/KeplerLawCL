"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoleSelector } from "@/components/RoleSelector";
import type { ParticipantRole, RoomState } from "@/lib/types";

export default function RolePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [savedName, setSavedName] = useState("");
  const displayNameKey = `display-name:${params.roomId}`;

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/rooms/${params.roomId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Unable to load room (${response.status}).`);
        }
        const payload = (await response.json()) as { room?: RoomState; error?: string };
        if (!payload.room) {
          throw new Error(payload.error ?? "Room payload is missing.");
        }
        setRoom(payload.room);
      } catch (error) {
        console.error("Role page room load failed", error);
      }
    };
    void load();
  }, [params.roomId]);

  useEffect(() => {
    const init = setTimeout(() => {
      setSavedName(localStorage.getItem(displayNameKey) ?? "");
    }, 0);
    return () => clearTimeout(init);
  }, [displayNameKey]);

  const handleSelect = async (role: ParticipantRole, name: string) => {
    const response = await fetch(`/api/rooms/${params.roomId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name }),
    });

    if (response.status === 409) {
      throw new Error("Role already taken by another display name. Use the same name to rejoin or choose the other role.");
    }

    if (!response.ok) {
      throw new Error("Unable to join role.");
    }

    localStorage.setItem(displayNameKey, name);
    localStorage.setItem(`display-name:${params.roomId}:${role}`, name);
    localStorage.setItem(`participant-role:${params.roomId}`, role);
    router.push(`/rooms/${params.roomId}?role=${role}`);
  };

  if (!room) {
    return <p className="p-6 text-sm text-slate-600">Loading room...</p>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <RoleSelector room={room} initialName={savedName} onSelect={handleSelect} />
    </main>
  );
}
