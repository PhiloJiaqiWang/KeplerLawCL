import { NextResponse } from "next/server";
import { updateSimulation } from "@/lib/roomStore";
import type { SimulationType } from "@/lib/types";

const validSimulations: SimulationType[] = [
  "Kepler First Law",
  "Kepler Second Law",
  "Kepler Third Law",
];

export async function POST(req: Request, context: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await context.params;
  const body = (await req.json()) as { simulation?: SimulationType };

  if (!body.simulation || !validSimulations.includes(body.simulation)) {
    return NextResponse.json({ error: "Invalid simulation" }, { status: 400 });
  }

  const room = updateSimulation(roomId, body.simulation);
  return NextResponse.json({ room });
}
