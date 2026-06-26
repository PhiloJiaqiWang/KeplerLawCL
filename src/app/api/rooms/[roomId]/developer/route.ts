import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { getVisibleOpenAIDebugTraces } from "@/agents/debug";
import { getOpenAIStatus } from "@/agents/status";

export async function GET(_req: Request, context: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await context.params;
    const openAIStatus = await getOpenAIStatus();

    return NextResponse.json({
      openAIStatus,
      openAIDebug: { traces: getVisibleOpenAIDebugTraces(roomId) },
    });
  } catch (error) {
    console.error("Failed to load developer diagnostics", error);
    return NextResponse.json({ error: "Unable to load developer diagnostics." }, { status: 500 });
  }
}
