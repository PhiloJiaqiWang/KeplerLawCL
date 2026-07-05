import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { updateAgentRole } from "@/lib/roomStore";
import type { AgentRole } from "@/lib/types";

const validAgentRoles: AgentRole[] = ["Facilitator", "Knowledgeable peer", "Novice peer"];

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as { agentRole?: AgentRole };

  if (!body.agentRole || !validAgentRoles.includes(body.agentRole)) {
    return NextResponse.json({ error: "Invalid agent role." }, { status: 400 });
  }

  const room = updateAgentRole(roomId, body.agentRole);
  return NextResponse.json({ room });
}
