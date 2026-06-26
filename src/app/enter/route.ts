import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomId = (url.searchParams.get("roomId") ?? "").trim();

  if (!roomId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.redirect(new URL(`/rooms/${encodeURIComponent(roomId)}/role`, request.url));
}
