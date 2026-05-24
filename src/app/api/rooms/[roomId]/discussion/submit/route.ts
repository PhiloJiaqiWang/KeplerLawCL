import { NextResponse } from "next/server";
import { submitDiscussionAnswers } from "@/lib/roomStore";
import type { ParticipantRole } from "@/lib/types";

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as {
    role?: ParticipantRole;
    q1?: string;
    q2?: string;
  };

  if (!body.role || body.q1 === undefined || body.q2 === undefined ) {
    return NextResponse.json({ error: "Missing discussion inputs." }, { status: 400 });
  }

  try {
    const room = submitDiscussionAnswers(roomId, body.role, {
      q1: body.q1,
      q2: body.q2,
    });
    return NextResponse.json({ room });
  } catch (error) {
    if (error instanceof Error && error.message === "STAGE_LOCKED") {
      return NextResponse.json({ error: "Discussion stage is not active." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "INVALID_DISCUSSION") {
      return NextResponse.json({ error: "Please answer both discussion questions." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to submit discussion answers." }, { status: 500 });
  }
}
