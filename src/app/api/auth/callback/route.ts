import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/buffer";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const home = new URL("/", process.env.APP_URL ?? url.origin);
  const fail = (reason: string) => {
    home.searchParams.set("error", reason);
    return NextResponse.redirect(home);
  };

  if (url.searchParams.get("error")) return fail("Buffer sign-in was cancelled.");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const session = await getSession();

  if (!code || !state || state !== session.oauthState || !session.pkceVerifier) {
    return fail("Sign-in expired or was tampered with. Please try again.");
  }

  try {
    const tokens = await exchangeCode(code, session.pkceVerifier);
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    session.pkceVerifier = undefined;
    session.oauthState = undefined;
    await session.save();
  } catch (err) {
    console.error(err);
    return fail("Could not finish connecting to Buffer.");
  }

  return NextResponse.redirect(home);
}
