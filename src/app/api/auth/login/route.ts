import { NextResponse } from "next/server";
import { authorizeUrl, createPkce } from "@/lib/buffer";
import { getSession } from "@/lib/session";

export async function GET() {
  const { verifier, challenge, state } = createPkce();
  const session = await getSession();
  session.pkceVerifier = verifier;
  session.oauthState = state;
  await session.save();
  return NextResponse.redirect(authorizeUrl(challenge, state));
}
