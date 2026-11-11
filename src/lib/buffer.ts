import { createHash, randomBytes } from "node:crypto";
import { getSession } from "./session";
import type { Channel, Draft } from "./types";

const AUTH_URL = "https://auth.buffer.com/auth";
const TOKEN_URL = "https://auth.buffer.com/token";
const API_URL = "https://api.buffer.com";

// Only what the app uses. offline_access returns a refresh token.
export const SCOPES = ["account:read", "posts:read", "posts:write", "offline_access"];

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function redirectUri(): string {
  return `${env("APP_URL").replace(/\/$/, "")}/api/auth/callback`;
}

// ---------- OAuth (authorization code + PKCE) ----------

const base64url = (buf: Buffer) => buf.toString("base64url");

export function createPkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));
  return { verifier, challenge, state };
}

export function authorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env("BUFFER_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("BUFFER_CLIENT_ID"),
      client_secret: env("BUFFER_CLIENT_SECRET"),
      ...body,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Buffer token request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export function exchangeCode(code: string, verifier: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
}

/**
 * Returns a valid access token for the signed-in user, refreshing it when it
 * is about to expire. Buffer refresh tokens are single use, so the new one
 * replaces the old one in the session right away.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session.accessToken) return null;

  const expiresSoon = !session.expiresAt || session.expiresAt - Date.now() < 60_000;
  if (!expiresSoon) return session.accessToken;
  if (!session.refreshToken) return session.accessToken;

  try {
    const tokens = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token ?? session.refreshToken;
    session.expiresAt = Date.now() + tokens.expires_in * 1000;
    await session.save();
    return session.accessToken;
  } catch {
    session.destroy();
    return null;
  }
}

// ---------- GraphQL ----------

export async function graphql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(`Buffer API error (${res.status})`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json.data as T;
}

export async function listChannels(token: string): Promise<Channel[]> {
  const { account } = await graphql<{ account: { organizations: { id: string }[] } }>(
    token,
    `query { account { organizations { id } } }`,
  );

  const perOrg = await Promise.all(
    account.organizations.map((org) =>
      graphql<{ channels: Channel[] }>(
        token,
        `query Channels($orgId: OrganizationId!) {
          channels(input: { organizationId: $orgId }) {
            id name displayName service avatar isQueuePaused
          }
        }`,
        { orgId: org.id },
      ).then((d) => d.channels),
    ),
  );
  return perOrg.flat();
}

/**
 * Instagram photo tags sit on the image asset. Positions are fractions of the
 * image size; tags are spread along the bottom so they don't cover the photo.
 */
function imageAsset(draft: Draft) {
  const image: Record<string, unknown> = { url: draft.imageUrl };
  const handles = draft.service === "instagram" ? draft.userTags ?? [] : [];
  if (handles.length) {
    image.metadata = {
      altText: draft.altText ?? "Photo",
      userTags: handles.map((handle, i) => ({
        handle,
        x: Number(((i + 1) / (handles.length + 1)).toFixed(3)),
        y: 0.9,
      })),
    };
  }
  return image;
}

const CREATE_POST = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id } }
      ... on MutationError { message }
    }
  }
`;

/** Saves a draft to the channel's Buffer queue. Nothing is published. */
export async function createDraft(token: string, draft: Draft): Promise<string> {
  const input: Record<string, unknown> = {
    channelId: draft.channelId,
    text: draft.text,
    mode: "addToQueue",
    schedulingType: "automatic",
    saveToDraft: true,
    source: "external-post-launch",
    assets: draft.imageUrl ? [{ image: imageAsset(draft) }] : [],
  };

  if (draft.service === "instagram") {
    input.metadata = { instagram: { type: "post", shouldShareToFeed: true } };
  }

  const data = await graphql<{
    createPost: { post?: { id: string }; message?: string };
  }>(token, CREATE_POST, { input });

  if (!data.createPost.post) {
    throw new Error(data.createPost.message ?? "Buffer did not create the post.");
  }
  return data.createPost.post.id;
}
