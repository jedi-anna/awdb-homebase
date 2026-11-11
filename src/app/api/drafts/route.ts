import { NextResponse, type NextRequest } from "next/server";
import { getAccessToken } from "@/lib/buffer";
import { generateDrafts } from "@/lib/compose";
import type { ActivityItem, Channel } from "@/lib/types";

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await getAccessToken())) {
    return NextResponse.json({ error: "Not connected to Buffer." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const item = body?.item as ActivityItem | undefined;
  const channels = body?.channels as Channel[] | undefined;

  if (!item?.title?.trim()) {
    return NextResponse.json({ error: "Add what you reviewed." }, { status: 400 });
  }
  if (!isHttpsUrl(item.profileUrl)) {
    return NextResponse.json({ error: "Add a link to your profile." }, { status: 400 });
  }
  if (item.imageUrl && !isHttpsUrl(item.imageUrl)) {
    return NextResponse.json({ error: "The photo link must start with https://." }, { status: 400 });
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: "Pick at least one channel." }, { status: 400 });
  }

  const drafts = await generateDrafts(item, channels);
  return NextResponse.json({ drafts });
}
