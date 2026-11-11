import Composer from "./Composer";
import { getSession } from "@/lib/session";

// Depends on the visitor's session cookie, so render per request.
export const instant = false;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Server Components can't write cookies, so token refresh happens in the API routes.
  const connected = Boolean((await getSession()).accessToken);

  return (
    <main>
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden>↗</span> External Post Launch
        </div>
        {connected && (
          <form action="/api/auth/logout" method="post">
            <button className="link">Disconnect Buffer</button>
          </form>
        )}
      </header>

      {!connected ? (
        <section className="hero">
          <h1>Your reviews live on Untappd and Letterboxd. Your audience doesn&apos;t.</h1>
          <p>
            Turn check-ins and reviews into native posts for Instagram, Threads and Bluesky, queued in Buffer as drafts.
            Every post points people back to your profile, so the community you built there keeps growing.
          </p>
          <a className="button" href="/api/auth/login">Connect Buffer</a>
          <ul className="points">
            <li><strong>Your words stay yours.</strong> Notes and ratings are posted exactly as you wrote them.</li>
            <li><strong>Nothing auto-posts.</strong> Everything lands in Buffer as a draft for you to approve.</li>
            <li><strong>Built for niche platforms.</strong> Untappd and Letterboxd today, with more to come.</li>
          </ul>
          {error && <p className="error">{error}</p>}
        </section>
      ) : (
        <>
          {error && <p className="error banner">{error}</p>}
          <Composer />
        </>
      )}

      <footer>
        <a href="/privacy">Privacy</a>
      </footer>
    </main>
  );
}
