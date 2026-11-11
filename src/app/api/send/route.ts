import { NextResponse, type NextRequest } from "next/server";
import { createDraft, getAccessToken } from "@/lib/buffer";
import { rulesFor } from "@/lib/compose";
import type { Draft } from "@/lib/types";

export async function POST(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "Not connected to Buffer." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const drafts = body?.drafts as Draft[] | undefined;
  if (!Array.isArray(drafts) || drafts.length === 0) {
    return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  }

  const results = await Promise.all(
    drafts.map(async (draft) => {
      const rules = rulesFor(draft.service);
      if (draft.text.length > rules.limit) {
        return { channelId: draft.channelId, ok: false, error: `Over the ${rules.limit} character limit.` };
      }
      if (rules.needsImage && !draft.imageUrl) {
        return { channelId: draft.channelId, ok: false, error: `${rules.label} posts need a photo.` };
      }
      try {
        const postId = await createDraft(token, draft);
        return { channelId: draft.channelId, ok: true, postId };
      } catch (err) {
        return { channelId: draft.channelId, ok: false, error: (err as Error).message };
      }
    }),
  );

  return NextResponse.json({ results });
}
