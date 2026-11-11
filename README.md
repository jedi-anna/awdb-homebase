# Home Base

**Your reviews live on Untappd. Your audience doesn't.**

Home Base turns activity on niche platforms into native posts for mainstream social, saved to your Buffer queue as drafts. Every post sends people back to your profile on the platform where your community actually lives.

Built for [Buffer Commit 2026](https://buffer.com/api/commit).

## The problem

People build real reputations on vertical platforms like Untappd, Letterboxd and Goodreads. Those platforms are great for logging and bad at discovery: on Untappd, your network is mostly friends you already know. Instagram, Threads and Bluesky have the reach, but they aren't where your reviews live. Nothing connects the two.

## How it works

1. **Connect Buffer** with OAuth.
2. **Pick a source.**
   - **Untappd:** paste a check-in link. Home Base fills in the beer, brewery, photo and rating from the page.
   - **Letterboxd:** enter your username. Home Base reads your public diary feed, and you pick an entry.
3. **Tag the people behind it.** Home Base suggests tags (the brewery's Instagram, found on its Untappd page, plus @untappd or @letterboxd). Tags go in the caption on Instagram and Threads and on the photo on Instagram, so the post also appears on the brewery's Tagged tab. Handles are never guessed.
4. **Pick channels.** Home Base writes a draft for each one, sized to its character limit and written in its voice.
5. **Review and send.** Drafts land in your Buffer queue. Nothing posts automatically.

## Product principles

- **Your words stay yours.** Notes and ratings are inserted by code, not by the model, so they always appear exactly as written. Claude only writes the framing around them (opening line, a question, hashtags).
- **Drafts, not auto-posting.** Everything goes to Buffer as a draft for you to approve.
- **Minimum permissions.** The app requests `account:read`, `posts:read`, `posts:write` and `offline_access`, nothing else.
- **One shape for every source.** Each platform adapter converts activity into a single `ActivityItem` type (`src/lib/types.ts`). Everything downstream ignores where the data came from, so adding Letterboxd or Goodreads means writing one adapter.

## Two very different sources

- **Untappd** has no open API: it has been closed to new applications for years. Home Base works anyway, from a check-in link the user already has.
- **Letterboxd** publishes a public RSS feed for every member, so Home Base reads it directly.

Both adapters output the same `ActivityItem`, and the rest of the app doesn't know the difference. That's the point: if the pattern works with and without an API, it works for any niche platform.

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

- Photo upload instead of pasting an image link
- Metrics view: which post formats send the most people back to your profile
- More sources: Goodreads, Strava
- Marketplaces: turn listings on Etsy, Depop, Poshmark or Reverb into posts that send buyers to your shop
