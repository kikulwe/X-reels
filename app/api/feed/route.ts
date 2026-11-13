import { NextResponse, type NextRequest } from "next/server";
import { getFeed } from "@/lib/feed";
import { getSession } from "@/lib/session";
import type { ApiError, FeedSource } from "@/lib/types";
import { ensureFresh, XApiError } from "@/lib/x";

const SOURCES: FeedSource[] = ["following-latest", "following-top"];

function err(status: number, error: string, retryAfterSec?: number) {
  const body: ApiError = { error, status, retryAfterSec };
  return NextResponse.json(body, {
    status,
    headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return err(401, "Not logged in");

  const source = (req.nextUrl.searchParams.get("source") ?? "following-latest") as FeedSource;
  if (!SOURCES.includes(source)) return err(400, "Unknown feed source");
  const cursor = req.nextUrl.searchParams.get("cursor");

  try {
    const s = await ensureFresh(session);
    const feed = await getFeed(s.accessToken, s.user.id, source, cursor);
    return NextResponse.json(feed, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof XApiError) {
      if (e.status === 429) return err(429, "X API rate limit reached. Waiting before retrying.", e.retryAfterSec);
      if (e.status === 401) return err(401, "Your X session expired. Please log in again.");
      if (e.status === 402) return err(402, "X API credits exhausted or monthly read cap reached for this app.");
      if (e.status === 403) return err(403, `X API refused the request: ${e.message}`);
      return err(502, `X API error: ${e.message}`);
    }
    console.error(e);
    return err(500, "Unexpected server error");
  }
}
