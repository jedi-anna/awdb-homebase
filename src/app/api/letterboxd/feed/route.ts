import { NextResponse, type NextRequest } from "next/server";
import { getAccessToken } from "@/lib/buffer";
import { fetchLetterboxdEntries } from "@/lib/sources/letterboxd";

export async function POST(req: NextRequest) {
  if (!(await getAccessToken())) {
    return NextResponse.json({ error: "Not connected to Buffer." }, { status: 401 });
  }
  const { username } = await req.json().catch(() => ({}));
  if (typeof username !== "string") {
    return NextResponse.json({ error: "Enter your Letterboxd username." }, { status: 400 });
  }
  try {
    const entries = await fetchLetterboxdEntries(username);
    if (entries.length === 0) {
      return NextResponse.json({ error: "No diary entries found. Is the profile public?" }, { status: 404 });
    }
    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
