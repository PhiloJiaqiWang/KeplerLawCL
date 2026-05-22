import { NextResponse } from "next/server";
import { joinRole } from "@/lib/roomStore";
import type { ParticipantRole } from "@/lib/types";

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as { role?: ParticipantRole; name?: string };

  if (!body.role || !body.name?.trim()) {
    return NextResponse.json({ error: "Missing role or name" }, { status: 400 });
  }

  try {
    const room = joinRole(roomId, body.role, body.name.trim());
    return NextResponse.json({ room });
  } catch (error) {
    if (error instanceof Error && error.message === "ROLE_TAKEN") {
      return NextResponse.json({ error: "Role already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to join" }, { status: 500 });
  }
}
