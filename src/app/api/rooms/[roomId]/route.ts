import { NextResponse } from "next/server";
import { createOrGetRoom } from "@/lib/roomStore";

export async function GET(_: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const room = createOrGetRoom(roomId);
  return NextResponse.json({ room });
}
