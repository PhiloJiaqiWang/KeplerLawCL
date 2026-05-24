import { NextResponse } from "next/server";
import { addMeasurement } from "@/lib/roomStore";
import type { MeasurementPoint, MeasurementTarget, ParticipantRole } from "@/lib/types";

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as {
    role?: ParticipantRole;
    point?: MeasurementPoint;
    target?: MeasurementTarget | null;
    tool?: "Distance Tool" | "Speed Tool" | "Swept Area Tool";
    timeIntervalSec?: 5 | 10 | 15;
  };

  if (!body.role || !body.point) {
    return NextResponse.json({ error: "Missing measurement inputs" }, { status: 400 });
  }

  try {
    const room = addMeasurement(roomId, body.role, body.point, body.target ?? null, {
      tool: body.tool === "Speed Tool" || body.tool === "Swept Area Tool" ? body.tool : undefined,
      timeIntervalSec: body.timeIntervalSec,
    });
    return NextResponse.json({ room });
  } catch (error) {
    if (error instanceof Error && error.message === "MEASUREMENT_STAGE_LOCKED") {
      return NextResponse.json({ error: "Measurements are only available during Investigation." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ENERGY_DEPLETED") {
      return NextResponse.json(
        { error: "Reactor measurement energy depleted. Maximum 6 measurements reached." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === "POINT_ACCESS_DENIED") {
      return NextResponse.json({ error: "You can only measure points on your assigned side." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "INVALID_POINT_OR_TARGET") {
      return NextResponse.json({ error: "Invalid point or target." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_SECOND_LAW_TOOL") {
      return NextResponse.json({ error: "Select Speed Tool or Swept Area Tool." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_TIME_INTERVAL") {
      return NextResponse.json({ error: "Select a valid time interval." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to record measurement." }, { status: 500 });
  }
}
