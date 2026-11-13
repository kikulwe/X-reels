import { env, X_API, X_TOKEN_URL } from "./env";
import { saveSession, type Session } from "./session";

export class XApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSec?: number,
    public detail?: unknown,
  ) {
    super(message);
  }
}

type TokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
};

function tokenHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  // Confidential clients (Web App type) authenticate with HTTP Basic; public clients send client_id in body.
  if (env.clientSecret) {
    h.Authorization = "Basic " + Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  }
  return h;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({ ...params, client_id: env.clientId });
  const res = await fetch(X_TOKEN_URL, { method: "POST", headers: tokenHeaders(), body, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new XApiError(json.error_description ?? "Token request failed", res.status, undefined, json);
  return json as TokenResponse;
}

export function exchangeCode(code: string, verifier: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.redirectUri,
    code_verifier: verifier,
  });
}

/** Returns a session with a valid access token, refreshing (and persisting) it if near expiry. */
export async function ensureFresh(s: Session): Promise<Session> {
  if (Date.now() < s.expiresAt - 60_000) return s;
  if (!s.refreshToken) throw new XApiError("Session expired", 401);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refreshToken });
  const next: Session = {
    ...s,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? s.refreshToken, // X rotates refresh tokens
    expiresAt: Date.now() + t.expires_in * 1000,
  };
  await saveSession(next);
  return next;
}

/** GET against X API v2 with rate-limit awareness. */
export async function xGet<T>(
  accessToken: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(X_API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 429) {
    const reset = Number(res.headers.get("x-rate-limit-reset")); // epoch seconds
    const retryAfter = reset ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 60;
    throw new XApiError("Rate limited by X API", 429, retryAfter);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 402 = out of pay-per-use credits / cap reached; 403 = app lacks access; 401 = token revoked
    const msg = json?.detail ?? json?.title ?? json?.errors?.[0]?.message ?? `X API error ${res.status}`;
    throw new XApiError(msg, res.status, undefined, json);
  }
  return json as T;
}
