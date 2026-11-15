// Builds site/feed.json from the X API. Runs in GitHub Actions (see .github/workflows/pages.yml)
// or locally:  X_BEARER_TOKEN=… X_USERNAME=kikulwe node scripts/build-feed.mjs
//
// Uses app-only auth (the Bearer Token from console.x.com), so no login flow and no secret in the browser.
// Every run: who you follow -> recent search "(from:a OR from:b …) has:videos" since the last run -> merge with
// the previous feed.json (fetched from the live site) -> keep the last 7 days.

import { readFile, writeFile, mkdir } from "node:fs/promises";

const API = process.env.X_API_BASE ?? "https://api.x.com/2";
const token = need("X_BEARER_TOKEN");
const username = need("X_USERNAME").replace(/^@/, "");
const maxPerQuery = clamp(Number(process.env.MAX_RESULTS_PER_QUERY ?? 20), 10, 100); // cost guard
const maxQueries = clamp(Number(process.env.MAX_QUERIES_PER_RUN ?? 20), 1, 100);     // cost guard
const previousUrl = process.env.PREVIOUS_FEED_URL ?? "";                               // live feed.json, for merging
const out = process.env.OUT ?? "site/feed.json";
const KEEP_DAYS = 7;

function need(n) { const v = process.env[n]; if (!v) { console.error(`Missing ${n}`); process.exit(1); } return v; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, Number.isFinite(n) ? n : a)); }

async function get(path, params) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const reset = Number(res.headers.get("x-rate-limit-reset"));
    const wait = reset ? Math.max(1, Math.ceil(reset - Date.now() / 1000)) : 60;
    if (wait > 600) throw new Error(`Rate limited for ${wait}s, giving up`);
    console.log(`rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return get(path, params);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.detail ?? json?.title ?? json?.errors?.[0]?.message ?? `X API ${res.status}`;
    throw new Error(`${msg} (${res.status}) ${path}`);
  }
  return json;
}

const TWEET_PARAMS = {
  "tweet.fields": "created_at,public_metrics,attachments,author_id,note_tweet",
  expansions: "attachments.media_keys,author_id",
  "media.fields": "type,variants,preview_image_url,duration_ms,width,height,public_metrics",
  "user.fields": "username,name,profile_image_url,verified",
};

function bestMp4(variants = []) {
  const mp4 = variants.filter((v) => v.content_type === "video/mp4");
  if (!mp4.length) return null; // HLS-only: not playable without hls.js
  mp4.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
  return mp4[0].url;
}
const stripTco = (t) => t.replace(/\s*https:\/\/t\.co\/\w+\s*$/, "").trim();

function normalize(page) {
  const media = new Map((page.includes?.media ?? []).map((m) => [m.media_key, m]));
  const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]));
  const items = [];
  for (const post of page.data ?? []) {
    const ms = (post.attachments?.media_keys ?? []).map((k) => media.get(k)).filter(Boolean);
    const vid = ms.find((m) => m.type === "video" || m.type === "animated_gif");
    if (!vid) continue;
    const src = bestMp4(vid.variants);
    if (!src) continue;
    const a = users.get(post.author_id) ?? { id: post.author_id, username: "unknown", name: "Unknown" };
    items.push({
      id: post.id,
      url: `https://x.com/${a.username}/status/${post.id}`,
      author: { username: a.username, name: a.name, avatar: a.profile_image_url, verified: !!a.verified },
      text: stripTco(post.note_tweet?.text ?? post.text ?? ""),
      createdAt: post.created_at,
      likes: post.public_metrics?.like_count ?? 0,
      views: vid.public_metrics?.view_count ?? post.public_metrics?.impression_count ?? null,
      hasImages: ms.some((m) => m.type === "photo"),
      video: {
        src, poster: vid.preview_image_url, durationMs: vid.duration_ms, width: vid.width, height: vid.height,
        kind: vid.type === "animated_gif" ? "gif" : "video",
      },
    });
  }
  return items;
}

// Recent-search queries are capped at 512 chars on self-serve: pack usernames into as few queries as possible.
function chunkQueries(names) {
  const SUFFIX = " has:videos -is:retweet -is:reply";
  const build = (ns) => `(${ns.map((n) => `from:${n}`).join(" OR ")})${SUFFIX}`;
  const chunks = [];
  let cur = [];
  for (const n of names) {
    if (cur.length && build([...cur, n]).length > 512) { chunks.push(build(cur)); cur = []; }
    cur.push(n);
  }
  if (cur.length) chunks.push(build(cur));
  return chunks;
}

async function loadPrevious() {
  try { return JSON.parse(await readFile(out, "utf8")); } catch {}
  if (previousUrl) {
    try {
      const res = await fetch(previousUrl, { headers: { "cache-control": "no-cache" } });
      if (res.ok) return await res.json();
    } catch {}
  }
  return null;
}

const prev = await loadPrevious();
const prevItems = prev?.items ?? [];
const now = Date.now();
const floor = now - KEEP_DAYS * 86400e3;
// Only read posts newer than the last run (with 30 min overlap). Same post read twice in a UTC day is billed once.
const sinceMs = prev?.generatedAt ? Math.max(floor, Date.parse(prev.generatedAt) - 30 * 60e3) : floor;
const startTime = new Date(sinceMs + 15e3).toISOString(); // start_time must be >10s before now

const me = await get(`/users/by/username/${username}`, { "user.fields": "id" });
const following = [];
let pag;
do {
  const page = await get(`/users/${me.data.id}/following`, { max_results: 1000, "user.fields": "username", pagination_token: pag });
  following.push(...(page.data ?? []).map((u) => u.username));
  pag = page.meta?.next_token;
} while (pag);
console.log(`@${username} follows ${following.length} accounts; reading posts since ${startTime}`);

const queries = chunkQueries(following);
// Rotate through chunks across runs so a long following list is still fully covered over time.
const offset = queries.length > maxQueries ? (prev?.queryOffset ?? 0) % queries.length : 0;
const fresh = [];
let scanned = 0;
for (let i = 0; i < Math.min(maxQueries, queries.length); i++) {
  const q = queries[(offset + i) % queries.length];
  const page = await get("/tweets/search/recent", {
    ...TWEET_PARAMS, query: q, max_results: maxPerQuery, sort_order: "recency", start_time: startTime,
  });
  scanned += page.meta?.result_count ?? 0;
  fresh.push(...normalize(page));
}

const byId = new Map(prevItems.map((i) => [i.id, i]));
for (const i of fresh) byId.set(i.id, i); // fresh metrics win
const items = [...byId.values()]
  .filter((i) => i.createdAt && Date.parse(i.createdAt) >= floor)
  .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

const feed = {
  generatedAt: new Date(now).toISOString(),
  username,
  following: following.length,
  queries: queries.length,
  queryOffset: (offset + maxQueries) % Math.max(1, queries.length),
  scannedThisRun: scanned,
  items,
};
await mkdir(out.replace(/\/[^/]+$/, ""), { recursive: true });
await writeFile(out, JSON.stringify(feed));
console.log(`read ${scanned} posts (~$${(scanned * 0.005).toFixed(2)}), ${fresh.length} new videos, ${items.length} in feed -> ${out}`);
