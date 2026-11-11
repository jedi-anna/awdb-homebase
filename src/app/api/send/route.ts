import { NextResponse, type NextRequest } from "next/server";
import { createPost, getAccessToken } from "@/lib/buffer";
import { cleanHandle, rulesFor } from "@/lib/compose";
import type { Delivery, Draft } from "@/lib/types";

function parseDelivery(raw: unknown): Delivery | string {
  const d = raw as { mode?: string; at?: string } | undefined;
  if (!d?.mode || d.mode === "draft") return { mode: "draft" };
  if (d.mode === "queue" || d.mode === "now") return { mode: d.mode };
  if (d.mode === "schedule") {
    const at = d.at ? new Date(d.at) : null;
    if (!at || Number.isNaN(at.getTime())) return "Pick a date and time to schedule.";
    if (at.getTime() < Date.now() + 60_000) return "Pick a time at least a minute from now.";
    return { mode: "schedule", at: at.toISOString() };
  }
  return "Unknown delivery option.";
}

export async function POST(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "Not connected to Buffer." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const drafts = body?.drafts as Draft[] | undefined;
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  }
  const delivery = parseDelivery(body?.delivery);
  if (typeof delivery === "string") return NextResponse.json({ error: delivery }, { status: 400 });

  const results = await Promise.all(
    drafts.map(async (draft) => {
      const rules = rulesFor(draft.service);
      if (draft.text.length > rules.limit) {
        return { channelId: draft.channelId, ok: false, error: `Over the ${rules.limit} character limit.` };
      }
      if (rules.needsImage && !draft.imageUrl) {
        return { channelId: draft.channelId, ok: false, error: `${rules.label} posts need a photo.` };
      }
      const userTags = (draft.userTags ?? []).map(cleanHandle).filter((h): h is string => Boolean(h)).slice(0, 20);
      try {
        const postId = await createPost(token, { ...draft, userTags }, delivery);
        return { channelId: draft.channelId, ok: true, postId };
      } catch (err) {
        return { channelId: draft.channelId, ok: false, error: (err as Error).message };
      }
    }),
  );

  return NextResponse.json({ results });
}
