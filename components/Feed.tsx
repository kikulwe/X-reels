"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError, FeedItem, FeedResponse, FeedSource } from "@/lib/types";
import VideoCard from "./VideoCard";

const TABS: { id: FeedSource; label: string }[] = [
  { id: "following-latest", label: "Following" },
  { id: "following-top", label: "Top" },
];
const MAX_EMPTY_PAGES = 3; // stop auto-paging through video-less pages (each page costs API credits)

type Status = "idle" | "loading" | "error" | "ratelimited" | "done";

export default function Feed({ user }: { user: { username: string; avatar?: string } }) {
  const [source, setSource] = useState<FeedSource>("following-latest");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [label, setLabel] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [emptyStreak, setEmptyStreak] = useState(0);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true); // browsers only allow muted autoplay until the user interacts
  const [showInfo, setShowInfo] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const inflight = useRef(false);
  const gen = useRef(0); // invalidates responses from a previous tab

  const load = useCallback(
    async (reset = false) => {
      if (inflight.current) return;
      inflight.current = true;
      const myGen = gen.current;
      setStatus("loading");
      setError(null);
      try {
        const qs = new URLSearchParams({ source });
        if (!reset && cursor) qs.set("cursor", cursor);
        const res = await fetch(`/api/feed?${qs}`, { cache: "no-store" });
        if (myGen !== gen.current) return;
        if (!res.ok) {
          const e = (await res.json().catch(() => ({}))) as Partial<ApiError>;
          if (res.status === 401) {
            window.location.href = "/?error=" + encodeURIComponent(e.error ?? "Please log in again");
            return;
          }
          if (res.status === 429) {
            setRetryIn(e.retryAfterSec ?? 60);
            setStatus("ratelimited");
            setError(e.error ?? "Rate limited");
            return;
          }
          setStatus("error");
          setError(e.error ?? `Request failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as FeedResponse;
        setLabel(data.label);
        setItems((prev) => {
          const base = reset ? [] : prev;
          const ids = new Set(base.map((i) => i.id));
          return [...base, ...data.items.filter((i) => !ids.has(i.id))];
        });
        setCursor(data.nextCursor);
        setEmptyStreak((n) => (data.items.length ? 0 : n + 1));
        setStatus(data.nextCursor ? "idle" : "done");
      } catch {
        if (myGen === gen.current) {
          setStatus("error");
          setError("Network error. Check your connection.");
        }
      } finally {
        inflight.current = false;
      }
    },
    [source, cursor],
  );

  // Initial load / tab change
  useEffect(() => {
    gen.current++;
    inflight.current = false;
    setItems([]);
    setCursor(null);
    setActive(0);
    setEmptyStreak(0);
    scroller.current?.scrollTo({ top: 0 });
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Infinite scroll: prefetch when within 3 of the end; keep paging if a page had no videos
  useEffect(() => {
    if (status !== "idle" || !cursor) return;
    const nearEnd = active >= items.length - 3;
    const needMore = items.length === 0 || nearEnd;
    if (needMore && emptyStreak < MAX_EMPTY_PAGES) load();
  }, [active, items.length, status, cursor, emptyStreak, load]);

  // Rate-limit countdown with automatic retry
  useEffect(() => {
    if (status !== "ratelimited") return;
    if (retryIn <= 0) { load(); return; }
    const t = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [status, retryIn, load]);

  // Track which card is on screen
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  // Keyboard navigation (desktop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = scroller.current?.clientHeight ?? 0;
      if (e.key === "ArrowDown" || e.key === "j") scroller.current?.scrollBy({ top: h, behavior: "smooth" });
      if (e.key === "ArrowUp" || e.key === "k") scroller.current?.scrollBy({ top: -h, behavior: "smooth" });
      if (e.key === "m") setMuted((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tail = () => {
    if (status === "loading") return <div className="state"><div className="spinner" />Finding videos…</div>;
    if (status === "ratelimited")
      return <div className="state">⏳ {error}<br />Retrying in {retryIn}s</div>;
    if (status === "error")
      return <div className="state">⚠️ {error}<button className="btn" onClick={() => load()}>Retry</button></div>;
    if (status === "done" || !cursor)
      return <div className="state">{items.length ? "You're all caught up 🎉" : "No videos found in this feed."}</div>;
    if (emptyStreak >= MAX_EMPTY_PAGES)
      return (
        <div className="state">
          No videos in the last few pages.
          <button className="btn" onClick={() => { setEmptyStreak(0); load(); }}>Keep looking</button>
        </div>
      );
    return null;
  };

  return (
    <div className="app">
      <header className="topbar">
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === source ? "tab active" : "tab"} onClick={() => setSource(t.id)}>
              {t.label}
            </button>
          ))}
          <button className="info-btn" aria-label="About this feed" onClick={() => setShowInfo((v) => !v)}>ⓘ</button>
        </nav>
        <form action="/api/auth/logout" method="post">
          <button className="avatar-btn" title={`Log out @${user.username}`}>
            {user.avatar ? <img src={user.avatar} alt="" /> : "⎋"}
          </button>
        </form>
      </header>

      {showInfo && (
        <div className="info-sheet" onClick={() => setShowInfo(false)}>
          <strong>{label || "Feed"}</strong>
          <p>
            This is <em>not</em> X&apos;s &ldquo;For You&rdquo; feed. The official X API doesn&apos;t expose that
            algorithm. <b>Following</b> = newest videos from your home timeline. <b>Top</b> = most engaged videos
            posted by accounts you follow in the last 7 days.
          </p>
        </div>
      )}

      <div className="scroller" ref={scroller}>
        {items.map((item, i) => (
          <section key={item.id} className="slide" data-index={i}>
            <VideoCard
              item={item}
              active={i === active}
              near={Math.abs(i - active) <= 2}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
            />
          </section>
        ))}
        <section className="slide tail">{tail()}</section>
      </div>
    </div>
  );
}
