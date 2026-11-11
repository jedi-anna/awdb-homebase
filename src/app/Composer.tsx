"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityItem, Channel, Draft } from "@/lib/types";

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

export default function Composer() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channelError, setChannelError] = useState<string | null>(null);

  const [link, setLink] = useState("");
  const [item, setItem] = useState<ActivityItem>({ source: "untappd", title: "", profileUrl: "", ratingMax: 5 });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState<null | "preview" | "drafts" | "send">(null);
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
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

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
      const { results } = await postJson<{ results: Result[] }>("/api/send", { drafts });
      setResults(results);
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
      <section className="card">
        <h2><span className="step">1</span> Your check-in</h2>
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

        <div className="grid">
          <label className="field">
            <span>Beer</span>
            <input value={item.title} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. 78-0" />
          </label>
          <label className="field">
            <span>Brewery</span>
            <input value={item.creator ?? ""} onChange={(e) => update({ creator: e.target.value })} placeholder="e.g. 78 Brewing Company" />
          </label>
          <label className="field">
            <span>Your rating (out of 5)</span>
            <input
              type="number" min={0} max={5} step={0.25}
              value={item.rating ?? ""}
              onChange={(e) => update({ rating: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Where (optional)</span>
            <input value={item.context ?? ""} onChange={(e) => update({ context: e.target.value })} placeholder="e.g. Bank of America Stadium" />
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
            <span>Photo link</span>
            <input type="url" value={item.imageUrl ?? ""} onChange={(e) => update({ imageUrl: e.target.value || undefined })} placeholder="https://…" />
            <small>Instagram needs a photo. On Untappd, right-click your photo and copy the image address.</small>
          </label>
          <label className="field">
            <span>Your Untappd profile</span>
            <input type="url" value={item.profileUrl} onChange={(e) => update({ profileUrl: e.target.value })} placeholder="https://untappd.com/user/you" />
          </label>
        </div>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="photo" src={item.imageUrl} alt={`Photo of ${item.title || "the beer"}`} />
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
          <p className="muted">Your notes and rating are added word for word. Edit anything else.</p>
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
                {missingPhoto && <p className="error">Instagram needs a photo. Add a photo link above.</p>}
                {result && (result.ok ? <p className="ok">Saved as a draft in Buffer.</p> : <p className="error">{result.error}</p>)}
              </div>
            );
          })}
          <button onClick={send} disabled={busy !== null || sentOk}>
            {busy === "send" ? "Sending…" : sentOk ? "Sent to Buffer" : "Send drafts to Buffer"}
          </button>
          {sentOk && <p className="ok">Done. Open Buffer to review and schedule them.</p>}
        </section>
      )}

      {error && <p className="error banner">{error}</p>}
    </div>
  );
}
