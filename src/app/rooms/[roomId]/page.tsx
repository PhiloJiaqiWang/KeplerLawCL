"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { RoomManager } from "@/components/RoomManager";
import type { ParticipantRole } from "@/lib/types";

const isParticipantRole = (value: string | null | undefined): value is ParticipantRole =>
  value === "participantA" || value === "participantB";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = params.roomId;
  const role = searchParams.get("role");

  useEffect(() => {
    if (isParticipantRole(role)) {
      localStorage.setItem(`participant-role:${roomId}`, role);
      return;
    }

    const savedRole = localStorage.getItem(`participant-role:${roomId}`);
    if (isParticipantRole(savedRole)) {
      router.replace(`/rooms/${roomId}?role=${savedRole}`);
      return;
    }

    router.replace(`/rooms/${roomId}/role`);
  }, [role, roomId, router]);

  if (!isParticipantRole(role)) {
    return <p className="p-6 text-sm text-slate-600">Restoring room...</p>;
  }

  return <RoomManager roomId={roomId} role={role} />;
}
