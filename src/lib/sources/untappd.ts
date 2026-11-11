// Untappd's API is closed to new apps, so this adapter works from what a
// user already has: a check-in link. It reads the page's public link-preview
// tags (the same ones any chat app uses to unfurl a link) and fills in what it
// can. Everything stays editable in the form, so a failed lookup is fine.

export interface UntappdPreview {
  title?: string;
  creator?: string;
  context?: string;
  imageUrl?: string;
  itemUrl: string;
  profileUrl?: string;
}

export function parseUntappdUrl(raw: string): { url: URL; username?: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (url.protocol !== "https:" || host !== "untappd.com") return null;
  const match = url.pathname.match(/^\/user\/([^/]+)/);
  return { url, username: match?.[1] };
}

export function profileUrlFor(username: string): string {
  return `https://untappd.com/user/${encodeURIComponent(username)}`;
}

function metaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** "Anna is drinking a 78-0 by 78 Brewing Company at Bank of America Stadium" */
function parseDrinkingTitle(title: string) {
  const m = title.match(/is drinking an? (.+?) by (.+?)(?: at (.+?))?(?: on Untappd)?$/i);
  if (!m) return {};
  return { title: m[1].trim(), creator: m[2].trim(), context: m[3]?.trim() };
}

export async function fetchUntappdPreview(raw: string): Promise<UntappdPreview> {
  const parsed = parseUntappdUrl(raw);
  if (!parsed) throw new Error("That doesn't look like an untappd.com link.");

  const preview: UntappdPreview = {
    itemUrl: parsed.url.toString(),
    profileUrl: parsed.username ? profileUrlFor(parsed.username) : undefined,
  };

  try {
    const res = await fetch(parsed.url, {
      headers: { "User-Agent": "HomeBase/0.1 (link preview)", Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return preview;
    const html = await res.text();

    const ogTitle = metaContent(html, "og:title");
    if (ogTitle) Object.assign(preview, parseDrinkingTitle(ogTitle));

    const image = metaContent(html, "og:image");
    if (image?.startsWith("https://")) preview.imageUrl = image;
  } catch {
    // Network or parsing failure: return what we got from the URL alone.
  }
  return preview;
}
