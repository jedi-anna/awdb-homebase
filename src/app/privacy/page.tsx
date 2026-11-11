import Link from "next/link";

export const metadata = { title: "Privacy · Home Base" };

export default function Privacy() {
  return (
    <main className="prose">
      <h1>Privacy</h1>
      <p>Home Base connects to your Buffer account to list your channels and save posts to your queue as drafts.</p>
      <ul>
        <li>We store your Buffer sign-in token in an encrypted cookie in your browser. We don&apos;t keep a database of users.</li>
        <li>We only request permission to read your account and channels and to create posts. We can&apos;t change your account settings.</li>
        <li>When you write drafts, the details of your check-in are sent to Anthropic&apos;s Claude API to write the framing text. Your notes are used only to match tone.</li>
        <li>Nothing is published automatically. Every post is saved as a draft for you to review in Buffer.</li>
        <li>Disconnecting Buffer deletes the cookie. You can also revoke access any time in your Buffer settings.</li>
      </ul>
      <p><Link href="/">Back to Home Base</Link></p>
    </main>
  );
}
