import { cookies } from "next/headers";
import { seal, unseal } from "./crypto";
import { env } from "./env";

export type Session = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  user: { id: string; username: string; name: string; profileImageUrl?: string };
};

type OAuthTemp = { verifier: string; state: string; createdAt: number };

const SESSION_COOKIE = "xr_session";
const OAUTH_COOKIE = "xr_oauth";

function cookieOpts(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "lax" as const, // lax is required so the cookie survives the redirect back from x.com
    path: "/",
    maxAge: maxAgeSec,
  };
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  return raw ? unseal<Session>(raw, env.sessionSecret) : null;
}

export async function saveSession(s: Session) {
  (await cookies()).set(SESSION_COOKIE, seal(s, env.sessionSecret), cookieOpts(60 * 60 * 24 * 30));
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function saveOAuthTemp(t: OAuthTemp) {
  (await cookies()).set(OAUTH_COOKIE, seal(t, env.sessionSecret), cookieOpts(600));
}

export async function takeOAuthTemp(): Promise<OAuthTemp | null> {
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE); // one-time use
  if (!raw) return null;
  const t = unseal<OAuthTemp>(raw, env.sessionSecret);
  if (!t || Date.now() - t.createdAt > 10 * 60 * 1000) return null;
  return t;
}
