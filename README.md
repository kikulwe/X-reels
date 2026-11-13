# X Reels — TikTok-style video feed from your X account

Next.js 16 (App Router) + TypeScript. One app: React frontend and Node route handlers for OAuth and X API calls. No database.

---

## 1. What the X API can and can't do here (checked Nov 2026)

| What you want | Available through the official API? |
|---|---|
| Log in with X (OAuth 2.0 + PKCE) | ✅ Yes |
| **"For You" algorithmic feed** | ❌ **No.** No endpoint returns it. The home timeline endpoint explicitly *excludes algorithmic ranking*. |
| Home timeline (accounts you follow) | ✅ `GET /2/users/:id/timelines/reverse_chronological`, newest first, limited to the most recent 3,200 posts or 7 days |
| Filter the home timeline to videos only | ⚠️ Not server-side. The app has to fetch every post and drop the ones without video, **and you pay for all of them**. |
| Videos from followed accounts, ranked | ✅ Close substitute: recent search `(from:a OR from:b …) has:videos` with `sort_order=relevancy` (last 7 days only) |
| Highest-quality video file | ✅ `media.variants`: the app picks the highest-`bit_rate` `video/mp4` |
| View counts | ⚠️ Partial: `media.public_metrics.view_count` / `impression_count`, when X returns them |
| Scraping / private endpoints | 🚫 Not used. They break X's Developer Terms and stop working without notice. |

### Pricing (this matters more than rate limits)
- X moved to **pay-per-use** in Feb 2026. There's **no free tier**, and the old Basic/Pro plans are gone. You buy credits at console.x.com.
- **Post read ≈ $0.005 per post returned.** A single 100-post home-timeline page costs about **$0.50**, even if only 5 of those posts have video. The same post is billed once per UTC day.
- Following-list reads count as "owned reads" (≈ $0.001 per user) when the logged-in user is the app owner.
- Pay-per-use accounts have a monthly cap on post reads (3M according to the pricing page). Above that you need Enterprise.
- For other users' timelines the rough cost is **$0.25–$1 per 10 videos** on the Following tab. The Top tab is cheaper per video, because every result it pays for already has a video.
- Check the current rates in the Developer Console before going live, because X changes them.

**Recommendation:** pay-per-use is the only self-serve option. Start with a small credit purchase, keep `MAX_PAGES_PER_REQUEST=1–2`, and use the **Top** tab as the default if cost matters. Enterprise only makes sense for a public app with many users.

### The two feeds in this app (clearly labelled in the UI)
1. **Following**: your reverse-chronological home timeline, filtered to video/GIF posts. Reposts are resolved to the original post.
2. **Top**: the most engaged video posts from accounts you follow in the last 7 days. It's built from recent-search queries, chunked to fit the 512-character query limit and re-ranked by likes and views.

---

## 2. Setup

### a) X developer app
1. Sign in at **https://console.x.com** (the developer console) and create a Project and an App.
2. Add credits (pay-per-use). Without credits, API calls return errors.
3. App → **User authentication settings** → Set up:
   - **App permissions:** Read
   - **Type of App:** *Web App, Automated App or Bot* (a confidential client, so you get a Client Secret)
   - **Callback URI:** `http://127.0.0.1:3000/api/auth/callback` (add your production URL too, e.g. `https://yourapp.com/api/auth/callback`)
   - **Website URL:** your site (any valid URL works for development)
4. Keys and tokens → copy the **OAuth 2.0 Client ID** and **Client Secret**.

### b) Run locally
```bash
cp .env.example .env.local
# fill X_CLIENT_ID, X_CLIENT_SECRET, SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # → SESSION_SECRET
npm install
npm run dev -- -H 127.0.0.1
```
Open **http://127.0.0.1:3000**. Use `127.0.0.1` rather than `localhost`, because it must match the callback exactly or the session cookie won't be sent.

To test on your phone, deploy the app (Vercel works out of the box) or tunnel it (e.g. `cloudflared tunnel --url http://127.0.0.1:3000`), then register that HTTPS callback on the X app.

### Environment variables
| Var | Required | Notes |
|---|---|---|
| `X_CLIENT_ID` | ✅ | OAuth 2.0 Client ID |
| `X_CLIENT_SECRET` | ✅ for Web App type | Leave empty only for a "Native App" (public client) |
| `X_REDIRECT_URI` | ✅ | Must exactly match a registered callback |
| `SESSION_SECRET` | ✅ | ≥32 chars. Encrypts the session cookie |
| `MAX_PAGES_PER_REQUEST` | optional (2) | Cost guard: X API pages per feed request (1–5) |

---

## 3. Project structure
```
app/
  page.tsx                 landing (logged out) or feed (logged in)
  layout.tsx, globals.css  mobile-first, safe-area aware styles
  api/auth/login/route.ts     builds PKCE + state, redirects to X
  api/auth/callback/route.ts  verifies state, exchanges code, stores session
  api/auth/logout/route.ts    revokes token, clears cookie
  api/feed/route.ts           ?source=following-latest|following-top&cursor=…
components/
  Feed.tsx                 snap-scroll feed, tabs, infinite load, rate-limit countdown
  VideoCard.tsx            player: autoplay in view, tap pause, mute, seekable progress
lib/
  env.ts                   config, endpoints, scopes
  crypto.ts                AES-256-GCM cookie sealing, PKCE helpers
  session.ts               httpOnly session + one-time OAuth cookie
  x.ts                     token exchange/refresh, X API GET with 429 handling
  feed.ts                  both feed sources, video normalization, cache
  types.ts                 shared types
```

## 4. How it works
- **Auth:** OAuth 2.0 Authorization Code + PKCE (S256). Scopes are `tweet.read users.read follows.read offline.access`. Tokens live only in an **encrypted, httpOnly, SameSite=Lax** cookie and never reach the browser's JavaScript. Access tokens are refreshed automatically when they're near expiry. X rotates the refresh token, and the new one is saved.
- **Pagination:** X's `next_token` is wrapped in an opaque cursor. The client prefetches when you're 3 videos from the end. After 3 pages in a row with no videos it stops paging automatically and asks you before reading more, to protect your credits.
- **Rate limits and errors:** a 429 reads `x-rate-limit-reset`, and the UI counts down and retries on its own. A 401 sends you back to login. A 402 means you're out of credits or hit the cap. A 403 means the app lacks access. Each error gets a clear message.
- **Player:** only the current video and its ±2 neighbours mount a `<video>`, which saves memory on phones. Videos start muted because browser autoplay policy requires it, and one tap unmutes. Shortcuts: ↑/↓ or j/k, `m` to mute.
- **Video quality:** the highest-bitrate MP4 variant. Posts that are HLS-only are skipped, because Chrome and Firefox can't play them without hls.js.

## 5. Production notes
- The response cache in `lib/feed.ts` is in-memory and per instance. On serverless or multiple instances, swap it for Redis/Upstash so repeat views don't cost twice.
- Track spend with `GET /2/usage/tweets` and set spend alerts in the console.
- If `video.twimg.com` links ever fail in your users' browsers, add a streaming proxy route. They play directly at the time of writing.
