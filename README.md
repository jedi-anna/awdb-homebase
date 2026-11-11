# Home Base

**Your reviews live on Untappd. Your audience doesn't.**

Home Base turns activity on niche platforms into native posts for mainstream social, saved to your Buffer queue as drafts. Every post sends people back to your profile on the platform where your community actually lives.

Built for [Buffer Commit 2026](https://buffer.com/api/commit).

## The problem

People build real reputations on vertical platforms like Untappd, Letterboxd and Goodreads. Those platforms are great for logging and bad at discovery: on Untappd, your network is mostly friends you already know. Instagram, Threads and Bluesky have the reach, but they aren't where your reviews live. Nothing connects the two.

## How it works

1. **Connect Buffer** with OAuth.
2. **Paste an Untappd check-in link.** Home Base reads the link preview and fills in the beer, brewery and photo. Add your rating and notes.
3. **Pick channels.** Home Base writes a draft for each one, sized to its character limit and written in its voice.
4. **Review and send.** Drafts land in your Buffer queue. Nothing posts automatically.

## Product principles

- **Your words stay yours.** Notes and ratings are inserted by code, not by the model, so they always appear exactly as written. Claude only writes the framing around them (opening line, a question, hashtags).
- **Drafts, not auto-posting.** Everything goes to Buffer as a draft for you to approve.
- **Minimum permissions.** The app requests `account:read`, `posts:read`, `posts:write` and `offline_access`, nothing else.
- **One shape for every source.** Each platform adapter converts activity into a single `ActivityItem` type (`src/lib/types.ts`). Everything downstream ignores where the data came from, so adding Letterboxd or Goodreads means writing one adapter.

## Why Untappd first

Untappd's API has been closed to new applications for years. Home Base works anyway, from a link the user already has. If the pattern works without an API, it works anywhere.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                   # starts https://localhost:3000
```

Buffer requires HTTPS redirect URIs, so `npm run dev` starts Next.js with a self-signed certificate. Your browser will warn the first time; that's expected locally.

Register `https://localhost:3000/api/auth/callback` (and your deployed URL) as redirect URIs on your Buffer app client.

## Stack

Next.js (App Router) on Vercel, Buffer GraphQL API, Claude API. No database: the Buffer token lives in an encrypted, HTTP-only cookie.

## Roadmap

- Letterboxd adapter via public RSS
- Photo upload instead of pasting an image link
- Metrics view: which post formats send the most people back to your profile
- More sources: Goodreads, Strava, Etsy
