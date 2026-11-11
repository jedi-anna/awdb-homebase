import { NextResponse } from "next/server";
import { getAccessToken, listChannels } from "@/lib/buffer";

export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "Not connected to Buffer." }, { status: 401 });

  try {
    return NextResponse.json({ channels: await listChannels(token) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
