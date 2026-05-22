import { NextResponse } from "next/server";
import { updateAgentCondition } from "@/lib/roomStore";
import type { AgentCondition } from "@/lib/types";

const validConditions: AgentCondition[] = ["Control", "Assistive", "Observation"];

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as { condition?: AgentCondition };

  if (!body.condition || !validConditions.includes(body.condition)) {
    return NextResponse.json({ error: "Invalid condition" }, { status: 400 });
  }

  const room = updateAgentCondition(roomId, body.condition);
  return NextResponse.json({ room });
}
