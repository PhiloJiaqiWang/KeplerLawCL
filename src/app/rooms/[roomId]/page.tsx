import { redirect } from "next/navigation";
import { RoomManager } from "@/components/RoomManager";
import type { ParticipantRole } from "@/lib/types";

type RoomPageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ role?: string }>;
};

const isParticipantRole = (value: string | undefined): value is ParticipantRole =>
  value === "participantA" || value === "participantB";

export default async function RoomPage({ params, searchParams }: RoomPageProps) {
  const { roomId } = await params;
  const query = await searchParams;

  if (!isParticipantRole(query.role)) {
    redirect(`/rooms/${roomId}/role`);
  }

  return <RoomManager roomId={roomId} role={query.role} />;
}
