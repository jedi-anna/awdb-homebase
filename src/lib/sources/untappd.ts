// Untappd's API is closed to new apps, so this adapter works from what a
// user already has: a check-in link. It reads the page's public link-preview
// tags (the same ones any chat app uses to unfurl a link) and fills in what it
// can. Everything stays editable in the form, so a failed lookup is fine.

export interface UntappdPreview {
  title?: string;
  creator?: string;
  context?: string;
  imageUrl?: string;
  rating?: number;
  notes?: string;
  mentions?: string[];
  highlights?: string[];
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

// Untappd's markup isn't documented, so each of these is best effort and
// returns undefined when it can't find a confident match.

/** Full-size check-in photo hosted on Untappd's image CDN. */
function findCheckinPhoto(html: string): string | undefined {
  // The full-size original sits on the photo link as data-image.
  const original = html.match(/class=["'][^"']*\bimage-big\b[^"']*["'][^>]*data-image=["'](https:\/\/[^"']+)["']/i)?.[1]
    ?? html.match(/data-image=["'](https:\/\/[^"']+)["'][^>]*class=["'][^"']*\bimage-big\b/i)?.[1];
  if (original) return decodeEntities(original);
  const re = /https:\/\/(?:images\.untp\.beer|untappd\.akamaized\.net)\/[^"'\s)]*photos?[^"'\s)]*\.(?:jpe?g|png|webp)/gi;
  const matches = [...new Set(html.match(re) ?? [])];
  // Skip thumbnails and avatars when a larger version is present.
  const full = matches.filter((u) => !/(?:_100|_200|_thumb|avatar)/i.test(u));
  return full[0] ?? matches[0];
}

/** Untappd renders ratings as caps with a data-rating attribute. */
function findRating(html: string): number | undefined {
  const m = html.match(/class=["'][^"']*\bcaps\b[^"']*["'][^>]*data-rating=["']([\d.]+)["']/i)
    ?? html.match(/data-rating=["']([\d.]+)["'][^>]*class=["'][^"']*\bcaps\b/i);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n <= 5 ? n : undefined;
}

/** The text the user wrote on the check-in, if any. */
function findComment(html: string): string | undefined {
  // <p class="comment"><abbr id="translate_...">the review</abbr></p>
  const m = html.match(/<p[^>]*class=["'](?:[^"']*\s)?comment(?:-text)?(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return undefined;
  const text = decodeEntities(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  return text || undefined;
}

const NOT_HANDLES = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "untappd", "sharer"]);

/**
 * Follows the brewery link on the check-in page and looks for an Instagram
 * link on the brewery's Untappd page. Returns a handle only when one is
 * clearly listed; we never guess handles.
 */
async function findBreweryInstagram(html: string, breweryName: string): Promise<string | undefined> {
  const name = breweryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = html.match(new RegExp(`href=["'](/[^"'#?]+)["'][^>]*>\\s*${name}\\s*</a>`, "i"))?.[1];
  if (!link || link.includes("..")) return undefined;
  try {
    const res = await fetch(new URL(link, "https://untappd.com"), {
      headers: { "User-Agent": "HomeBase/0.1 (link preview)", Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return undefined;
    const page = await res.text();
    for (const m of page.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi)) {
      const handle = m[1].replace(/\.$/, "").toLowerCase();
      if (!NOT_HANDLES.has(handle)) return handle;
    }
  } catch {
    // Best effort only.
  }
  return undefined;
}

/** "Purchased From" venue on the check-in. */
function findPurchasedFrom(html: string): string | undefined {
  const start = html.search(/class=["']purchased["']/i);
  if (start < 0) return undefined;
  const section = html.slice(start, start + 2000);
  const m = section.match(/<a[^>]+href=["']\/v\/[^"']+["'][^>]*>\s*([^<]+?)\s*<\/a>/i);
  return m ? decodeEntities(m[1]).trim() : undefined;
}

/** Flavor Profile tags, e.g. Grapefruity, Hazy, Smooth. */
function findFlavors(html: string): string[] {
  const start = html.search(/class=["']flavor["']/i);
  if (start < 0) return [];
  const end = html.indexOf("</ul>", start);
  const section = html.slice(start, end > start ? end : start + 2000);
  return [...section.matchAll(/<span>\s*([^<]+?)\s*<\/span>/gi)].map((m) => decodeEntities(m[1])).slice(0, 8);
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

    // Prefer the user's own photo. og:image is Untappd's branded share card,
    // so it's only the fallback.
    const photo = findCheckinPhoto(html);
    const card = metaContent(html, "og:image");
    if (photo) preview.imageUrl = photo;
    else if (card?.startsWith("https://")) preview.imageUrl = card;

    const rating = findRating(html);
    if (rating != null) preview.rating = rating;

    const comment = findComment(html);
    if (comment) preview.notes = comment;
    else {
      // og:description repeats the comment; it's the "is drinking" line when there isn't one.
      const desc = metaContent(html, "og:description");
      if (desc && !/is drinking an? /i.test(desc)) preview.notes = desc.trim();
    }

    const venue = findPurchasedFrom(html);
    if (venue && !preview.context) preview.context = venue;

    const flavors = findFlavors(html);
    if (flavors.length) preview.highlights = flavors;

    const brewery = preview.creator ? await findBreweryInstagram(html, preview.creator) : undefined;
    preview.mentions = [brewery, "untappd"].filter((h): h is string => Boolean(h));
  } catch {
    // Network or parsing failure: return what we got from the URL alone.
  }
  return preview;
}
