import { NextResponse, type NextRequest } from "next/server";
import { getAccessToken } from "@/lib/buffer";
import { fetchUntappdPreview } from "@/lib/sources/untappd";

export async function POST(req: NextRequest) {
  if (!(await getAccessToken())) {
    return NextResponse.json({ error: "Not connected to Buffer." }, { status: 401 });
  }
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string") {
    return NextResponse.json({ error: "Paste an Untappd check-in link." }, { status: 400 });
  }
  try {
    return NextResponse.json({ preview: await fetchUntappdPreview(url) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
