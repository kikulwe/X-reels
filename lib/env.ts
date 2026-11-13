function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. See .env.example`);
  return v;
}

export const env = {
  get clientId() { return required("X_CLIENT_ID"); },
  get clientSecret() { return process.env.X_CLIENT_SECRET ?? ""; }, // empty => public client
  get redirectUri() { return required("X_REDIRECT_URI"); },
  get sessionSecret() {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    return s;
  },
  get maxPages() { return Math.max(1, Math.min(5, Number(process.env.MAX_PAGES_PER_REQUEST ?? 2))); },
  get secureCookies() { return required("X_REDIRECT_URI").startsWith("https://"); },
};

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
export const X_API = "https://api.x.com/2";

// tweet.read + users.read: timelines/search/lookup. follows.read: following list.
// offline.access: refresh token so users stay logged in past 2h.
export const SCOPES = ["tweet.read", "users.read", "follows.read", "offline.access"];
