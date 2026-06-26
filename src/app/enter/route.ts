import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomId = (url.searchParams.get("roomId") ?? "").trim();

  if (!roomId) {
    redirect("/");
  }

  redirect(`/rooms/${encodeURIComponent(roomId)}/role`);
}
