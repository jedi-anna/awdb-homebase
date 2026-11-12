// Letterboxd publishes a public RSS feed for every member at
// https://letterboxd.com/<username>/rss/ with their diary entries, ratings
// and reviews. No API key needed.
import type { ActivityItem } from "../types";

export interface LetterboxdEntry extends ActivityItem {
  /** e.g. "Watched Oct 12" for the picker list. */
  label: string;
}

const USERNAME = /^[A-Za-z0-9_]{1,40}$/;

export function profileUrlFor(username: string) {
  return `https://letterboxd.com/${username}/`;
}

function tag(xml: string, name: string): string | undefined {
  const escaped = name.replace(":", "\\:");
  const m = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, "i"));
  if (!m) return undefined;
  return m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * The description holds a poster <img> plus the review in <p> tags. Only the
 * review is used: posters are the studios' artwork, so they're never posted.
 */
function parseDescription(html: string) {
  const paragraphs = [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim())
    .filter(Boolean);
  // Entries without a written review only say "Watched on <date>."
  const review = paragraphs.filter((p) => !/^Watched on /i.test(p)).join("\n\n");
  return { review: review || undefined };
}

export async function fetchLetterboxdEntries(username: string): Promise<LetterboxdEntry[]> {
  const name = username.trim().replace(/^@/, "");
  if (!USERNAME.test(name)) throw new Error("That doesn't look like a Letterboxd username.");

  const res = await fetch(`https://letterboxd.com/${name}/rss/`, {
    headers: { "User-Agent": "ExternalPostLaunch/0.1 (RSS reader)", Accept: "application/rss+xml, text/xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) throw new Error(`No Letterboxd member named ${name}.`);
  if (!res.ok) throw new Error(`Letterboxd didn't respond (${res.status}). Try again in a minute.`);
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const entries: LetterboxdEntry[] = [];

  for (const item of items) {
    const filmTitle = tag(item, "letterboxd:filmTitle");
    if (!filmTitle) continue; // lists and other non-diary items

    const year = tag(item, "letterboxd:filmYear");
    const ratingRaw = tag(item, "letterboxd:memberRating");
    const watched = tag(item, "letterboxd:watchedDate");
    const rewatch = tag(item, "letterboxd:rewatch") === "Yes";
    const { review } = parseDescription(tag(item, "description") ?? "");
    const rating = ratingRaw ? Number(ratingRaw) : undefined;

    const watchedLabel = watched
      ? new Date(`${watched}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : undefined;

    entries.push({
      source: "letterboxd",
      title: decode(filmTitle),
      creator: year ? `${year}` : undefined,
      rating: rating && rating > 0 ? rating : undefined,
      ratingMax: 5,
      notes: review,
      itemUrl: tag(item, "link"),
      profileUrl: profileUrlFor(name),
      context: rewatch ? "a rewatch" : undefined,
      mentions: ["letterboxd"],
      label: [watchedLabel && `Watched ${watchedLabel}`, review ? "reviewed" : null].filter(Boolean).join(" · "),
    });
  }
  return entries;
}
