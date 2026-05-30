import { NextResponse } from "next/server";
import { createOrGetRoom } from "@/lib/roomStore";

export async function GET(_: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await context.params;
    const room = createOrGetRoom(roomId);
    return NextResponse.json({ room });
  } catch (error) {
    console.error("Failed to load room", error);
    return NextResponse.json({ error: "Unable to load room." }, { status: 500 });
  }
}
