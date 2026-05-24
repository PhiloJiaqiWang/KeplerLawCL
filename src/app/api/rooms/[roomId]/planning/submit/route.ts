import { NextResponse } from "next/server";
import { submitPlan } from "@/lib/roomStore";
import type { ParticipantRole } from "@/lib/types";

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as {
    role?: ParticipantRole;
    planText?: string;
    collaborationConfirmed?: boolean;
  };

  if (!body.role || !body.planText?.trim()) {
    return NextResponse.json({ error: "Missing role or planText" }, { status: 400 });
  }

  try {
    const room = submitPlan(roomId, body.role, body.planText, Boolean(body.collaborationConfirmed));
    return NextResponse.json({ room });
  } catch (error) {
    if (error instanceof Error && error.message === "STAGE_LOCKED") {
      return NextResponse.json({ error: "Planning stage is already closed" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "DISCUSSION_REQUIRED") {
      return NextResponse.json(
        { error: "Both participants must exchange at least one chat message before plan submission." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "COLLABORATION_CONFIRMATION_REQUIRED") {
      return NextResponse.json(
        { error: "Please confirm that you finalized the plan with your partner." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "INVALID_PLAN") {
      return NextResponse.json({ error: "Invalid plan content" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to submit plan" }, { status: 500 });
  }
}
