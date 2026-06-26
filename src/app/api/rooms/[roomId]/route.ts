import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { refreshRoom } from "@/lib/roomStore";

export async function GET(_req: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await context.params;
    const room = refreshRoom(roomId);
    return NextResponse.json({
      room,
    });
  } catch (error) {
    console.error("Failed to load room", error);
    return NextResponse.json({ error: "Unable to load room." }, { status: 500 });
  }
}
