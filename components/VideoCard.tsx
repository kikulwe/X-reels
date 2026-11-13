"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/types";

const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

type Props = {
  item: FeedItem;
  active: boolean;
  near: boolean; // within ±2 of active: mount the <video> so it can buffer
  muted: boolean;
  onToggleMute: () => void;
};

export default function VideoCard({ item, active, near, muted, onToggleMute }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(false);

  // Play when on screen, pause when not
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) {
      v.play().then(() => setPaused(false)).catch(() => setPaused(true)); // autoplay may be blocked
    } else {
      v.pause();
    }
  }, [active, near]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  const togglePlay = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPaused(false); }
    else { v.pause(); setPaused(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const v = ref.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    v.currentTime = Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * v.duration;
  };

  const tall = (item.video.height ?? 16) >= (item.video.width ?? 9);

  return (
    <div className="card">
      {near && !failed ? (
        <video
          ref={ref}
          className={tall ? "video cover" : "video contain"}
          src={item.video.src}
          poster={item.video.poster}
          muted={muted}
          loop
          playsInline
          preload={active ? "auto" : "metadata"}
          onClick={togglePlay}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onError={() => setFailed(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        item.video.poster && <img className="video contain" src={item.video.poster} alt="" />
      )}

      {failed && (
        <div className="overlay-center">
          Can&apos;t play this video here.
          <a className="btn" href={item.url} target="_blank" rel="noreferrer">Open on X</a>
        </div>
      )}
      {!failed && active && paused && <button className="overlay-center play" onClick={togglePlay} aria-label="Play">▶</button>}
      {!failed && active && buffering && !paused && <div className="overlay-center"><div className="spinner" /></div>}

      <div className="side">
        <button className="round" onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? "🔇" : "🔊"}
        </button>
        <div className="stat"><span>♥</span>{fmt.format(item.likeCount)}</div>
        {item.viewCount != null && <div className="stat"><span>▶</span>{fmt.format(item.viewCount)}</div>}
        <a className="round" href={item.url} target="_blank" rel="noreferrer" aria-label="Open on X">𝕏</a>
      </div>

      <div className="meta">
        {item.repostedBy && <div className="repost">↻ @{item.repostedBy} reposted</div>}
        <div className="author">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item.author.avatar && <img src={item.author.avatar} alt="" />}
          <b>@{item.author.username}</b>
          {item.author.verified && <span className="badge">✓</span>}
          {item.video.kind === "animated_gif" && <span className="chip">GIF</span>}
          {item.hasImages && <span className="chip">+ photos</span>}
        </div>
        {item.text && (
          <p className={expanded ? "caption open" : "caption"} onClick={() => setExpanded((x) => !x)}>
            {item.text}
          </p>
        )}
      </div>

      <div className="progress" onClick={seek} onTouchStart={seek}>
        <div className="bar" style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  );
}
