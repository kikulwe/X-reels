export type FeedSource = "following-latest" | "following-top";

export type FeedItem = {
  id: string;
  url: string; // link to the post on x.com
  author: { id: string; username: string; name: string; avatar?: string; verified?: boolean };
  text: string;
  createdAt?: string;
  likeCount: number;
  viewCount?: number; // only when X returns it
  repostedBy?: string; // username, when the item reached the timeline via a repost
  hasImages: boolean; // post contains photos alongside the video
  video: {
    src: string; // highest-bitrate MP4 variant
    poster?: string;
    durationMs?: number;
    width?: number;
    height?: number;
    kind: "video" | "animated_gif";
  };
};

export type FeedResponse = {
  source: FeedSource;
  label: string;
  items: FeedItem[];
  nextCursor: string | null;
  scanned: number; // posts read from X (billable) to produce these items
};

export type ApiError = { error: string; status: number; retryAfterSec?: number };
