import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { getVisibleOpenAIDebugTraces } from "@/agents/debug";
import { getOpenAIStatus } from "@/agents/status";
import { createOrGetRoom } from "@/lib/roomStore";

export async function GET(req: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await context.params;
    const room = createOrGetRoom(roomId);
    const openAIStatus = await getOpenAIStatus();
    const url = new URL(req.url);
    const developerMode = url.searchParams.get("debug") === "1";
    return NextResponse.json({
      room,
      openAIStatus,
      openAIDebug: developerMode ? { traces: getVisibleOpenAIDebugTraces(roomId) } : undefined,
    });
  } catch (error) {
    console.error("Failed to load room", error);
    return NextResponse.json({ error: "Unable to load room." }, { status: 500 });
  }
}
