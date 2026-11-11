"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityItem, Channel, Delivery, Draft, SourceId } from "@/lib/types";

const LIMITS: Record<string, number> = {
  instagram: 2200, threads: 500, bluesky: 300, twitter: 280, mastodon: 500, facebook: 5000, linkedin: 3000,
};
const NEEDS_IMAGE = new Set(["instagram"]);
const limitFor = (service: string) => LIMITS[service] ?? 500;

type Result = { channelId: string; ok: boolean; error?: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

const LABELS = {
  untappd: { heading: "Your check-in", title: "Beer", creator: "Brewery", context: "Where (optional)", photo: "Photo link", profile: "Your Untappd profile",
    titlePh: "e.g. Miller Lite", creatorPh: "e.g. Miller Brewing Company", contextPh: "e.g. your local bar", profilePh: "https://untappd.com/user/you",
    photoHelp: "Instagram needs a photo. On Untappd, right-click your photo and copy the image address." },
  letterboxd: { heading: "Your review", title: "Film", creator: "Year", context: "Context (optional)", photo: "Image link", profile: "Your Letterboxd profile",
    titlePh: "e.g. The Godfather", creatorPh: "e.g. 1972", contextPh: "e.g. a rewatch, opening night", profilePh: "https://letterboxd.com/you/",
    photoHelp: "Instagram needs an image. The film poster fills in by default; swap in your own photo if you'd rather." },
} as const;

type DeliveryMode = Delivery["mode"];

const DELIVERY_OPTIONS: { id: DeliveryMode; label: string; help: string }[] = [
  { id: "draft", label: "Save as draft", help: "Review and schedule it in Buffer yourself." },
  { id: "queue", label: "Add to queue", help: "Posts at your next open time slot in Buffer." },
  { id: "schedule", label: "Schedule", help: "Pick the date and time." },
  { id: "now", label: "Post now", help: "Publishes right away." },
];

const DONE_TEXT: Record<DeliveryMode, string> = {
  draft: "Saved as a draft in Buffer.",
  queue: "Added to your Buffer queue.",
  schedule: "Scheduled in Buffer.",
  now: "Sent to Buffer to publish now.",
};

/** Value for a datetime-local input, an hour from now in the user's time zone. */
function defaultScheduleValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Composer() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channelError, setChannelError] = useState<string | null>(null);

  const [source, setSource] = useState<SourceId>("untappd");
  const [link, setLink] = useState("");
  const [lbUser, setLbUser] = useState("");
  const [entries, setEntries] = useState<(ActivityItem & { label: string })[]>([]);
  const [item, setItem] = useState<ActivityItem>({ source: "untappd", title: "", profileUrl: "", ratingMax: 5, mentions: ["untappd"] });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("draft");
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleValue);
  const [sentMode, setSentMode] = useState<DeliveryMode>("draft");
  const [busy, setBusy] = useState<null | "preview" | "feed" | "drafts" | "send">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setChannels(d.channels);
        setSelected(new Set(d.channels.filter((c: Channel) => !c.isQueuePaused).map((c: Channel) => c.id)));
      })
      .catch((e) => setChannelError(e.message));
  }, []);

  const update = (patch: Partial<ActivityItem>) => {
    setItem((prev) => ({ ...prev, ...patch }));
    setDrafts([]);
    setResults([]);
  };

  async function fillFromLink() {
    setBusy("preview");
    setError(null);
    try {
      const { preview } = await postJson<{ preview: Partial<ActivityItem> }>("/api/untappd/preview", { url: link });
      update({
        title: preview.title ?? item.title,
        creator: preview.creator ?? item.creator,
        context: preview.context ?? item.context,
        imageUrl: preview.imageUrl ?? item.imageUrl,
        rating: preview.rating ?? item.rating,
        notes: item.notes?.trim() ? item.notes : preview.notes,
        itemUrl: preview.itemUrl,
        profileUrl: preview.profileUrl ?? item.profileUrl,
        mentions: preview.mentions?.length ? preview.mentions : item.mentions,
        highlights: preview.highlights,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function switchSource(next: SourceId) {
    if (next === source) return;
    setSource(next);
    setEntries([]);
    setError(null);
    setItem({ source: next, title: "", profileUrl: "", ratingMax: 5, mentions: [next] });
    setDrafts([]);
    setResults([]);
  }

  async function loadLetterboxd() {
    setBusy("feed");
    setError(null);
    try {
      const { entries } = await postJson<{ entries: (ActivityItem & { label: string })[] }>("/api/letterboxd/feed", { username: lbUser });
      setEntries(entries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function pickEntry(entry: ActivityItem & { label: string }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { label, ...rest } = entry;
    setItem(rest);
    setDrafts([]);
    setResults([]);
  }

  const L = LABELS[source];

  const chosen = useMemo(() => channels.filter((c) => selected.has(c.id)), [channels, selected]);

  async function makeDrafts() {
    setBusy("drafts");
    setError(null);
    setResults([]);
    try {
      const { drafts } = await postJson<{ drafts: Draft[] }>("/api/drafts", { item, channels: chosen });
      setDrafts(drafts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      const delivery: Delivery =
        deliveryMode === "schedule"
          ? { mode: "schedule", at: new Date(scheduleAt).toISOString() }
          : { mode: deliveryMode };
      // On a retry, skip channels that already went through so nothing is posted twice.
      const done = new Set(results.filter((r) => r.ok).map((r) => r.channelId));
      const pending = drafts.filter((d) => !done.has(d.channelId));
      const { results: fresh } = await postJson<{ results: Result[] }>("/api/send", { drafts: pending, delivery });
      setSentMode(deliveryMode);
      setResults([...results.filter((r) => r.ok), ...fresh]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const channelById = (id: string) => channels.find((c) => c.id === id);
  const sentOk = results.length > 0 && results.every((r) => r.ok);

  return (
    <div className="composer">
      <div className="tabs" role="tablist">
        {(["untappd", "letterboxd"] as const).map((id) => (
          <button key={id} role="tab" aria-selected={source === id} className={source === id ? "tab on" : "tab"} onClick={() => switchSource(id)}>
            {id === "untappd" ? "Untappd" : "Letterboxd"}
          </button>
        ))}
      </div>

      <section className="card">
        <h2><span className="step">1</span> {L.heading}</h2>
        {source === "untappd" ? (
          <label className="field">
            <span>Untappd check-in link</span>
            <div className="row">
              <input
                type="url"
                placeholder="https://untappd.com/user/you/checkin/123456789"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
              <button className="secondary" onClick={fillFromLink} disabled={!link || busy !== null}>
                {busy === "preview" ? "Reading…" : "Fill in"}
              </button>
            </div>
            <small>We read the link preview to fill in what we can. Edit anything below.</small>
          </label>
        ) : (
          <div className="field">
            <label className="field">
              <span>Letterboxd username</span>
              <div className="row">
                <input placeholder="e.g. yourusername" value={lbUser} onChange={(e) => setLbUser(e.target.value)} />
                <button className="secondary" onClick={loadLetterboxd} disabled={!lbUser || busy !== null}>
                  {busy === "feed" ? "Loading…" : "Load diary"}
                </button>
              </div>
              <small>Reads your public Letterboxd feed. Pick an entry to fill in the form.</small>
            </label>
            {entries.length > 0 && (
              <div className="entries">
                {entries.slice(0, 12).map((e) => (
                  <button
                    key={e.itemUrl ?? e.title}
                    className={item.itemUrl === e.itemUrl ? "entry on" : "entry"}
                    onClick={() => pickEntry(e)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {e.imageUrl && <img src={e.imageUrl} alt="" />}
                    <span>
                      <strong>{e.title}</strong>
                      <em>{[e.creator, e.rating != null ? `${e.rating}/5` : null, e.label].filter(Boolean).join(" · ")}</em>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid">
          <label className="field">
            <span>{L.title}</span>
            <input value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder={L.titlePh} />
          </label>
          <label className="field">
            <span>{L.creator}</span>
            <input value={item.creator ?? ""} onChange={(e) => update({ creator: e.target.value })} placeholder={L.creatorPh} />
          </label>
          <label className="field">
            <span>Your rating (out of 5)</span>
            <input
              type="number" min={0} max={5} step={source === "letterboxd" ? 0.5 : 0.25}
              value={item.rating ?? ""}
              onChange={(e) => update({ rating: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>{L.context}</span>
            <input value={item.context ?? ""} onChange={(e) => update({ context: e.target.value })} placeholder={L.contextPh} />
          </label>
        </div>

        <label className="field">
          <span>Your notes</span>
          <textarea
            rows={3}
            value={item.notes ?? ""}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="Exactly what you'd say about it. This is posted word for word."
          />
        </label>

        <div className="grid">
          <label className="field">
            <span>{L.photo}</span>
            <input type="url" value={item.imageUrl ?? ""} onChange={(e) => update({ imageUrl: e.target.value || undefined })} placeholder="https://…" />
            <small>{L.photoHelp}</small>
          </label>
          <label className="field">
            <span>{L.profile}</span>
            <input type="url" value={item.profileUrl} onChange={(e) => update({ profileUrl: e.target.value })} placeholder={L.profilePh} />
          </label>
        </div>
        <label className="field">
          <span>Tag accounts</span>
          <input
            value={(item.mentions ?? []).map((h) => `@${h}`).join(" ")}
            onChange={(e) =>
              update({ mentions: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^@/, "")).filter(Boolean) })
            }
            placeholder={source === "untappd" ? "@millerlite @untappd" : "@studio @letterboxd"}
          />
          <small>
            Tagged in the caption on Instagram and Threads, and on the photo on Instagram so the post shows up on their
            profile. {source === "untappd" ? "We fill in the brewery when Untappd lists its Instagram. " : ""}Double-check
            handles: a wrong tag points people to a stranger.
          </small>
        </label>

        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="photo" src={item.imageUrl} alt={item.title ? `Image for ${item.title}` : "Selected image"} />
        )}
      </section>

      <section className="card">
        <h2><span className="step">2</span> Where it goes</h2>
        {channelError && <p className="error">{channelError}</p>}
        {!channelError && channels.length === 0 && <p className="muted">Loading your Buffer channels…</p>}
        <div className="channels">
          {channels.map((c) => (
            <label key={c.id} className={`channel ${selected.has(c.id) ? "on" : ""}`}>
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => {
                  const next = new Set(selected);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  setSelected(next);
                  setDrafts([]);
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.avatar && <img src={c.avatar} alt="" />}
              <span>
                <strong>{c.displayName || c.name}</strong>
                <em>{c.service}{c.isQueuePaused ? " · queue paused" : ""}</em>
              </span>
            </label>
          ))}
        </div>
        <button onClick={makeDrafts} disabled={busy !== null || !item.title || !item.profileUrl || chosen.length === 0}>
          {busy === "drafts" ? "Writing drafts…" : "Write drafts"}
        </button>
      </section>

      {drafts.length > 0 && (
        <section className="card">
          <h2><span className="step">3</span> Review and send</h2>
          <p className="muted">Your notes and rating are added word for word. Edit anything else, then choose when it goes out.</p>
          {drafts.map((d, i) => {
            const ch = channelById(d.channelId);
            const limit = limitFor(d.service);
            const over = d.text.length > limit;
            const missingPhoto = NEEDS_IMAGE.has(d.service) && !d.imageUrl;
            const result = results.find((r) => r.channelId === d.channelId);
            return (
              <div key={d.channelId} className="draft">
                <div className="draft-head">
                  <strong>{ch?.displayName || ch?.name} <em>{d.service}</em></strong>
                  <span className={over ? "count over" : "count"}>{d.text.length}/{limit}</span>
                </div>
                <textarea
                  rows={Math.min(12, d.text.split("\n").length + 2)}
                  value={d.text}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[i] = { ...d, text: e.target.value };
                    setDrafts(next);
                  }}
                />
                {d.service === "instagram" && d.userTags && d.userTags.length > 0 && (
                  <p className="muted small">Photo tags: {d.userTags.map((h) => `@${h}`).join(" ")}</p>
                )}
                {missingPhoto && <p className="error">Instagram needs a photo. Add a photo link above.</p>}
                {result && (result.ok ? <p className="ok">{DONE_TEXT[sentMode]}</p> : <p className="error">{result.error}</p>)}
              </div>
            );
          })}
          <fieldset className="delivery" disabled={busy !== null || sentOk}>
            <legend>When should it go out?</legend>
            <div className="delivery-options">
              {DELIVERY_OPTIONS.map((o) => (
                <label key={o.id} className={deliveryMode === o.id ? "option on" : "option"}>
                  <input
                    type="radio"
                    name="delivery"
                    value={o.id}
                    checked={deliveryMode === o.id}
                    onChange={() => setDeliveryMode(o.id)}
                  />
                  <span>
                    <strong>{o.label}</strong>
                    <em>{o.help}</em>
                  </span>
                </label>
              ))}
            </div>
            {deliveryMode === "schedule" && (
              <label className="field schedule">
                <span>Date and time (your time zone)</span>
                <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              </label>
            )}
          </fieldset>

          <button onClick={send} disabled={busy !== null || sentOk || (deliveryMode === "schedule" && !scheduleAt)}>
            {busy === "send"
              ? "Sending…"
              : sentOk
                ? "Sent to Buffer"
                : {
                    draft: `Save ${drafts.length > 1 ? "drafts" : "draft"} to Buffer`,
                    queue: "Add to Buffer queue",
                    schedule: "Schedule in Buffer",
                    now: `Post now to ${drafts.length} ${drafts.length > 1 ? "channels" : "channel"}`,
                  }[deliveryMode]}
          </button>
          {sentOk && (
            <p className="ok">
              {sentMode === "draft" ? "Done. Open Buffer to review and schedule." : "Done. Buffer will take it from here."}
            </p>
          )}
        </section>
      )}

      {error && <p className="error banner">{error}</p>}
    </div>
  );
}
