import { NextResponse } from "next/server";
import { advanceToDiscussion } from "@/lib/roomStore";

export async function POST(_: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;

  try {
    const room = advanceToDiscussion(roomId);
    return NextResponse.json({ room });
  } catch (error) {
    if (error instanceof Error && error.message === "STAGE_LOCKED") {
      return NextResponse.json({ error: "Stage must be Investigation before moving to Discussion." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to advance stage." }, { status: 500 });
  }
}
