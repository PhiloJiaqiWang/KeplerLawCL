import { NextResponse } from "next/server";
import { postMessage } from "@/lib/roomStore";
import type { ParticipantRole } from "@/lib/types";

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as { role?: ParticipantRole; content?: string };

  if (!body.role || !body.content?.trim()) {
    return NextResponse.json({ error: "Missing role or content" }, { status: 400 });
  }

  const room = postMessage(roomId, body.role, body.content.trim());
  return NextResponse.json({ room });
}
