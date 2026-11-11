import Anthropic from "@anthropic-ai/sdk";
import type { ActivityItem, Channel, Draft } from "./types";

interface ChannelRules {
  label: string;
  limit: number;
  /** Instagram captions can't hold clickable links, so point to the bio instead. */
  linksClickable: boolean;
  needsImage: boolean;
}

const RULES: Record<string, ChannelRules> = {
  instagram: { label: "Instagram", limit: 2200, linksClickable: false, needsImage: true },
  threads: { label: "Threads", limit: 500, linksClickable: true, needsImage: false },
  bluesky: { label: "Bluesky", limit: 300, linksClickable: true, needsImage: false },
  twitter: { label: "X", limit: 280, linksClickable: true, needsImage: false },
  mastodon: { label: "Mastodon", limit: 500, linksClickable: true, needsImage: false },
  facebook: { label: "Facebook", limit: 5000, linksClickable: true, needsImage: false },
  linkedin: { label: "LinkedIn", limit: 3000, linksClickable: true, needsImage: false },
};

/** Services where an @handle in the text links to the same Instagram-style account. */
const MENTION_SERVICES = new Set(["instagram", "threads"]);

export function cleanHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? h.toLowerCase() : null;
}

export function rulesFor(service: string): ChannelRules {
  return RULES[service] ?? { label: service, limit: 500, linksClickable: true, needsImage: false };
}

const SOURCE_NAMES: Record<ActivityItem["source"], string> = {
  untappd: "Untappd",
  letterboxd: "Letterboxd",
};

/** The framing Claude writes. The user's own notes and rating are never in here. */
interface Framing {
  hook: string;
  closer: string;
  hashtags: string[];
}

function ratingLine(item: ActivityItem): string | null {
  if (item.rating == null) return null;
  const max = item.ratingMax ?? 5;
  const value = Number.isInteger(item.rating) ? item.rating : item.rating.toFixed(2).replace(/0$/, "");
  return `My rating: ${value}/${max}`;
}

function ctaLine(item: ActivityItem, rules: ChannelRules): string {
  const name = SOURCE_NAMES[item.source];
  return rules.linksClickable
    ? `More of my ${name} reviews: ${item.profileUrl}`
    : `More of my reviews on ${name} (link in bio)`;
}

function trimToWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max - 1));
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Used when the review is too long to quote in full: point to it instead. */
function fullReviewCta(item: ActivityItem, rules: ChannelRules): string {
  const name = SOURCE_NAMES[item.source];
  const what = item.source === "untappd" ? "check-in" : "review";
  if (!rules.linksClickable) return `Read my full ${what} on ${name} (link in bio)`;
  return `Read my full ${what} on ${name}: ${item.itemUrl ?? item.profileUrl}`;
}

/**
 * Builds the final post. The user's notes and rating are inserted by code, not
 * by the model, so they always appear exactly as written. A review is either
 * quoted in full or not at all: when it doesn't fit the channel, the post
 * shares the basics (title, rating) and sends people to the full review on the
 * source platform, which is the point of the product.
 */
export function assemble(item: ActivityItem, service: string, framing: Framing): string {
  const rules = rulesFor(service);
  const fullNotes = item.notes?.trim() ? `"${item.notes.trim()}"` : null;
  const rating = ratingLine(item);
  const handles = MENTION_SERVICES.has(service)
    ? [...new Set((item.mentions ?? []).map(cleanHandle).filter((h): h is string => Boolean(h)))]
    : [];
  const mentionLine = handles.length ? handles.map((h) => `@${h}`).join(" ") : "";
  const hashtags = framing.hashtags.map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "")}`).join(" ");

  const build = (o: { notes: string | null; cta: string; hook: string; closer: string; tags: string }) =>
    [o.hook, [o.notes, rating].filter(Boolean).join("\n"), o.closer, o.cta, [mentionLine, o.tags].filter(Boolean).join("\n")]
      .filter((part) => part && part.trim())
      .join("\n\n");

  // Try progressively leaner versions until one fits.
  const attempts = (notes: string | null, cta: string) => [
    { notes, cta, hook: framing.hook, closer: framing.closer, tags: hashtags },
    { notes, cta, hook: framing.hook, closer: framing.closer, tags: "" },
    { notes, cta, hook: framing.hook, closer: "", tags: "" },
  ];

  const candidates = [
    ...attempts(fullNotes, ctaLine(item, rules)),
    ...(fullNotes ? attempts(null, fullReviewCta(item, rules)) : []),
  ];
  for (const c of candidates) {
    const text = build(c);
    if (text.length <= rules.limit) return text;
  }

  // Last resort: basics only, with a shortened opening line.
  const lean = { notes: null, cta: fullNotes ? fullReviewCta(item, rules) : ctaLine(item, rules), hook: framing.hook, closer: "", tags: "" };
  const over = build(lean).length - rules.limit;
  lean.hook = trimToWord(framing.hook, Math.max(20, framing.hook.length - over));
  return build(lean).slice(0, rules.limit);
}

function fallbackFraming(item: ActivityItem): Framing {
  if (item.source === "letterboxd") {
    const film = item.creator ? `${item.title} (${item.creator})` : item.title;
    return {
      hook: `Just watched ${film}${item.context ? `, ${item.context}` : ""}.`,
      closer: "",
      hashtags: ["letterboxd", "film", "moviereview"],
    };
  }
  const what = item.creator ? `${item.title} by ${item.creator}` : item.title;
  return {
    hook: `Just had ${what}${item.context ? ` at ${item.context}` : ""}.`,
    closer: "",
    hashtags: item.source === "untappd" ? ["craftbeer", "untappd"] : ["letterboxd", "film"],
  };
}

const SYSTEM = `You write short social media framing for someone sharing their own reviews from a niche platform.
You never quote, paraphrase, or invent the reviewer's opinions or tasting notes; their notes and rating are added separately, verbatim.
Write in first person, casual and specific, like a real person posting. No em dashes. No filler like "Cheers!" unless it fits. No emojis unless natural; at most one.
Return only JSON.`;

async function framingFromClaude(item: ActivityItem, services: string[]): Promise<Record<string, Framing>> {
  const client = new Anthropic();
  const specs = services.map((s) => {
    const r = rulesFor(s);
    return `- "${s}" (${r.label}, ${r.limit} character limit for the whole post)`;
  });

  const prompt = `Reviewed item:
${JSON.stringify(
  {
    platform: SOURCE_NAMES[item.source],
    title: item.title,
    [item.source === "letterboxd" ? "release_year" : "maker"]: item.creator,
    context: item.context,
    rating: item.rating != null ? `${item.rating}/${item.ratingMax ?? 5}` : undefined,
    reviewer_notes_for_tone_only: item.notes,
    flavor_or_style_tags: item.highlights,
  },
  null,
  2,
)}

For each channel below, write:
- "hook": one opening line naming what was reviewed (match the platform's voice; Threads and Bluesky are conversational, Instagram can be a little more descriptive). Do not restate the notes or the rating.
- "closer": an optional short line inviting replies (e.g. a question), or "" if it would feel forced. Keep it under 80 characters.
- "hashtags": 0 to 5 relevant hashtags without the # sign. Use more on Instagram, 0 to 2 on Threads, Bluesky, and X.

Channels:
${specs.join("\n")}

Respond with JSON only, shaped like {"<channel>": {"hook": "...", "closer": "...", "hashtags": ["..."]}}.`;

  const res = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5",
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
}

export async function generateDrafts(item: ActivityItem, channels: Channel[]): Promise<Draft[]> {
  const services = [...new Set(channels.map((c) => c.service))];
  let framings: Record<string, Framing> = {};

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      framings = await framingFromClaude(item, services);
    } catch (err) {
      console.error("Claude framing failed, using template", err);
    }
  }

  return channels.map((channel) => {
    const f = framings[channel.service];
    const framing: Framing =
      f && typeof f.hook === "string"
        ? { hook: f.hook, closer: f.closer ?? "", hashtags: Array.isArray(f.hashtags) ? f.hashtags : [] }
        : fallbackFraming(item);
    return {
      channelId: channel.id,
      service: channel.service,
      text: assemble(item, channel.service, framing),
      imageUrl: item.imageUrl,
      userTags:
        channel.service === "instagram"
          ? [...new Set((item.mentions ?? []).map(cleanHandle).filter((h): h is string => Boolean(h)))]
          : undefined,
      altText: [item.title, item.creator].filter(Boolean).join(", "),
    };
  });
}
