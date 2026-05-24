"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RoleSelector } from "@/components/RoleSelector";
import type { ParticipantRole, RoomState } from "@/lib/types";

export default function RolePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<RoomState | null>(null);

  useEffect(() => {
    const load = async () => {
      const response = await fetch(`/api/rooms/${params.roomId}`, { cache: "no-store" });
      const payload = (await response.json()) as { room: RoomState };
      setRoom(payload.room);
    };
    void load();
  }, [params.roomId]);

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

    router.push(`/rooms/${params.roomId}?role=${role}`);
  };

  if (!room) {
    return <p className="p-6 text-sm text-slate-600">Loading room...</p>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <RoleSelector room={room} onSelect={handleSelect} />
    </main>
  );
}
