import { env } from "./env";
import type { FeedItem, FeedResponse, FeedSource } from "./types";
import { xGet } from "./x";

/* ---------- X API v2 response shapes (subset) ---------- */
type XVariant = { bit_rate?: number; content_type: string; url: string };
type XMedia = {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  variants?: XVariant[];
  preview_image_url?: string;
  url?: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  public_metrics?: { view_count?: number };
};
type XUser = { id: string; username: string; name: string; profile_image_url?: string; verified?: boolean };
type XTweet = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  attachments?: { media_keys?: string[] };
  public_metrics?: { like_count: number; retweet_count: number; reply_count: number; quote_count: number; impression_count?: number };
  referenced_tweets?: { type: "retweeted" | "quoted" | "replied_to"; id: string }[];
  note_tweet?: { text: string };
};
type XPage = {
  data?: XTweet[];
  includes?: { media?: XMedia[]; users?: XUser[]; tweets?: XTweet[] };
  meta?: { next_token?: string; result_count?: number };
};

const TWEET_PARAMS = {
  "tweet.fields": "created_at,public_metrics,attachments,referenced_tweets,author_id,note_tweet",
  expansions:
    "attachments.media_keys,author_id,referenced_tweets.id,referenced_tweets.id.attachments.media_keys,referenced_tweets.id.author_id",
  "media.fields": "type,variants,preview_image_url,duration_ms,width,height,public_metrics,url",
  "user.fields": "username,name,profile_image_url,verified",
};

/* ---------- normalization ---------- */
export function bestMp4(variants: XVariant[] = []): string | null {
  const mp4 = variants.filter((v) => v.content_type === "video/mp4");
  if (!mp4.length) return null; // HLS-only (.m3u8) items are skipped: not playable in Chrome/Firefox without hls.js
  mp4.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
  return mp4[0].url;
}

function normalize(page: XPage): FeedItem[] {
  const media = new Map((page.includes?.media ?? []).map((m) => [m.media_key, m]));
  const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]));
  const refTweets = new Map((page.includes?.tweets ?? []).map((t) => [t.id, t]));
  const out: FeedItem[] = [];
  const seen = new Set<string>();

  for (const t of page.data ?? []) {
    // Reposts carry the media on the original post: resolve to it.
    const rtRef = t.referenced_tweets?.find((r) => r.type === "retweeted");
    const post = (rtRef && refTweets.get(rtRef.id)) || t;
    if (seen.has(post.id)) continue;

    const mediaItems = (post.attachments?.media_keys ?? []).map((k) => media.get(k)).filter(Boolean) as XMedia[];
    const vid = mediaItems.find((m) => m.type === "video" || m.type === "animated_gif");
    if (!vid) continue;
    const src = bestMp4(vid.variants);
    if (!src) continue;

    const author = users.get(post.author_id ?? "") ?? { id: post.author_id ?? "", username: "unknown", name: "Unknown" };
    const reposter = rtRef ? users.get(t.author_id ?? "") : undefined;
    seen.add(post.id);

    out.push({
      id: post.id,
      url: `https://x.com/${author.username}/status/${post.id}`,
      author: {
        id: author.id,
        username: author.username,
        name: author.name,
        avatar: author.profile_image_url,
        verified: author.verified,
      },
      text: stripTrailingTco(post.note_tweet?.text ?? post.text),
      createdAt: post.created_at,
      likeCount: post.public_metrics?.like_count ?? 0,
      viewCount: vid.public_metrics?.view_count ?? post.public_metrics?.impression_count,
      repostedBy: reposter?.username,
      hasImages: mediaItems.some((m) => m.type === "photo"),
      video: {
        src,
        poster: vid.preview_image_url,
        durationMs: vid.duration_ms,
        width: vid.width,
        height: vid.height,
        kind: vid.type === "animated_gif" ? "animated_gif" : "video",
      },
    });
  }
  return out;
}

function stripTrailingTco(text: string) {
  return text.replace(/\s*https:\/\/t\.co\/\w+\s*$/, "").trim();
}

function engagement(i: FeedItem) {
  return i.likeCount + (i.viewCount ?? 0) / 100;
}

/* ---------- tiny per-instance cache (cuts repeat billing; swap for Redis in prod) ---------- */
const cache = new Map<string, { exp: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { exp: Date.now() + ttlMs, value });
  if (cache.size > 500) for (const [k, v] of cache) if (v.exp < Date.now()) cache.delete(k);
  return value;
}

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const dec = <T>(s: string | null): T | null => {
  if (!s) return null;
  try { return JSON.parse(Buffer.from(s, "base64url").toString()) as T; } catch { return null; }
};

/* ---------- Source A: reverse-chronological home timeline, video-only ---------- */
async function followingLatest(token: string, userId: string, cursor: string | null): Promise<FeedResponse> {
  let next = dec<{ t: string }>(cursor)?.t;
  const items: FeedItem[] = [];
  let scanned = 0;

  // The home timeline endpoint has no "has:videos" filter, so we scan pages and filter server-side.
  // MAX_PAGES_PER_REQUEST caps how many billable posts we read per call.
  for (let i = 0; i < env.maxPages; i++) {
    const page = await xGet<XPage>(token, `/users/${userId}/timelines/reverse_chronological`, {
      ...TWEET_PARAMS,
      max_results: 100,
      exclude: "replies",
      pagination_token: next,
    });
    scanned += page.meta?.result_count ?? page.data?.length ?? 0;
    items.push(...normalize(page));
    next = page.meta?.next_token;
    if (!next || items.length >= 8) break;
  }

  return {
    source: "following-latest",
    label: "Latest videos from accounts you follow",
    items,
    nextCursor: next ? enc({ t: next }) : null,
    scanned,
  };
}

/* ---------- Source B: top recent videos from followed accounts (recent search, has:videos) ---------- */
const QUERY_MAX = 512; // self-serve recent-search query length limit
const QUERY_SUFFIX = " has:videos -is:retweet -is:reply";

async function getFollowing(token: string, userId: string): Promise<string[]> {
  return cached(`following:${userId}`, 6 * 60 * 60 * 1000, async () => {
    const res = await xGet<{ data?: { username: string }[] }>(token, `/users/${userId}/following`, {
      max_results: 1000,
      "user.fields": "username",
    });
    return (res.data ?? []).map((u) => u.username);
  });
}

function chunkQueries(usernames: string[]): string[] {
  const chunks: string[] = [];
  let cur: string[] = [];
  const build = (names: string[]) => `(${names.map((n) => `from:${n}`).join(" OR ")})${QUERY_SUFFIX}`;
  for (const u of usernames) {
    if (build([...cur, u]).length > QUERY_MAX && cur.length) {
      chunks.push(build(cur));
      cur = [];
    }
    cur.push(u);
  }
  if (cur.length) chunks.push(build(cur));
  return chunks;
}

async function followingTop(token: string, userId: string, cursor: string | null): Promise<FeedResponse> {
  const following = await getFollowing(token, userId);
  const label = "Top recent videos from accounts you follow (last 7 days)";
  if (!following.length) return { source: "following-top", label, items: [], nextCursor: null, scanned: 0 };

  const queries = chunkQueries(following);
  let { c, t } = dec<{ c: number; t?: string }>(cursor) ?? { c: 0 };
  const items: FeedItem[] = [];
  let scanned = 0;

  for (let i = 0; i < env.maxPages && c < queries.length; i++) {
    const page = await xGet<XPage>(token, "/tweets/search/recent", {
      ...TWEET_PARAMS,
      query: queries[c],
      max_results: 50,
      sort_order: "relevancy",
      next_token: t,
    });
    scanned += page.meta?.result_count ?? 0;
    items.push(...normalize(page));
    if (page.meta?.next_token) t = page.meta.next_token;
    else { c++; t = undefined; }
    if (items.length >= 8) break;
  }

  items.sort((a, b) => engagement(b) - engagement(a));
  return { source: "following-top", label, items, nextCursor: c < queries.length ? enc({ c, t }) : null, scanned };
}

export async function getFeed(token: string, userId: string, source: FeedSource, cursor: string | null) {
  return cached(`feed:${userId}:${source}:${cursor ?? ""}`, 2 * 60 * 1000, () =>
    source === "following-top" ? followingTop(token, userId, cursor) : followingLatest(token, userId, cursor),
  );
}
