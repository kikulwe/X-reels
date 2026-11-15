/* X Reels — static client. Reads feed.json (built by GitHub Actions) and plays it as a snap-scroll feed. */
(() => {
  const $ = (s) => document.querySelector(s);
  const scroller = $("#scroller");
  const fmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const state = { feed: null, tab: localStorage.getItem("xr.tab") || "latest", items: [], active: 0, muted: true, els: new Map() };
  const seen = new Set(JSON.parse(localStorage.getItem("xr.seen") || "[]"));

  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };
  const agoText = (iso) => { const a = ago(iso); return a === "just now" ? a : a + " ago"; };
  const engagement = (i) => i.likes + (i.views ?? 0) / 100;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- data ---------- */
  async function load(force) {
    $("#refresh").classList.add("spin");
    try {
      const res = await fetch("feed.json", { cache: force ? "reload" : "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.feed = await res.json();
      localStorage.setItem("xr.feed", JSON.stringify(state.feed));
    } catch (e) {
      const cached = localStorage.getItem("xr.feed");
      if (cached && !state.feed) state.feed = JSON.parse(cached);
      if (!state.feed) { renderState("error", e.message); return; }
      if (force) toast("Offline — showing the last feed");
    } finally {
      $("#refresh").classList.remove("spin");
    }
    render();
  }

  function select() {
    const items = [...(state.feed?.items ?? [])];
    if (state.tab === "top") items.sort((a, b) => engagement(b) - engagement(a));
    return items;
  }

  /* ---------- rendering ---------- */
  function render() {
    state.items = select();
    state.active = 0;
    state.els.clear();
    scroller.replaceChildren();
    scroller.scrollTo({ top: 0 });
    if (!state.items.length) { renderState("empty"); return; }
    state.items.forEach((item, i) => {
      const slide = el("section", "slide");
      slide.dataset.index = i;
      slide.appendChild(card(item));
      scroller.appendChild(slide);
    });
    const tail = el("section", "slide tail");
    const st = el("div", "state");
    st.append("You're all caught up 🎉", small(`${state.items.length} videos · feed updated ${agoText(state.feed.generatedAt)}`));
    tail.appendChild(st);
    scroller.appendChild(tail);
    observe();
    update();
  }

  function small(t) { return el("small", null, t); }

  function renderState(kind, msg) {
    scroller.replaceChildren();
    const slide = el("section", "slide tail");
    const st = el("div", "state");
    if (kind === "error") {
      st.append("⚠️ Couldn't load the feed.", small(msg || ""));
      const b = el("button", "btn", "Retry"); b.onclick = () => load(true); st.appendChild(b);
    } else if (kind === "loading") {
      st.append(el("div", "spinner"), "Loading…");
    } else {
      st.append("No videos yet.", small("The feed is built by the GitHub Action every few hours. Run it once from the Actions tab, or check that X_BEARER_TOKEN and X_USERNAME are set."));
    }
    slide.appendChild(st);
    scroller.appendChild(slide);
  }

  function card(item) {
    const c = el("div", "card");
    const tall = (item.video.height ?? 16) >= (item.video.width ?? 9);
    const holder = el("div"); holder.className = "vholder"; holder.style.cssText = "position:absolute;inset:0;display:grid;place-items:center";
    const img = el("img", "video contain"); img.alt = ""; if (item.video.poster) img.src = item.video.poster;
    holder.appendChild(img);
    c.appendChild(holder);

    const play = el("button", "overlay-center play", "▶"); play.hidden = true; play.setAttribute("aria-label", "Play");
    const buf = el("div", "overlay-center"); buf.hidden = true; buf.appendChild(el("div", "spinner"));
    const fail = el("div", "overlay-center"); fail.hidden = true;
    fail.append("Can't play this video here.");
    const open = el("a", "btn", "Open on X"); open.href = item.url; open.target = "_blank"; open.rel = "noreferrer"; fail.appendChild(open);
    c.append(play, buf, fail);

    const side = el("div", "side");
    const mute = el("button", "round", "🔇"); mute.setAttribute("aria-label", "Unmute");
    mute.onclick = () => { state.muted = !state.muted; applyMute(); };
    side.appendChild(mute);
    const likes = el("div", "stat"); likes.append(el("span", null, "♥"), fmt.format(item.likes)); side.appendChild(likes);
    if (item.views != null) { const v = el("div", "stat"); v.append(el("span", null, "▶"), fmt.format(item.views)); side.appendChild(v); }
    const x = el("a", "round", "𝕏"); x.href = item.url; x.target = "_blank"; x.rel = "noreferrer"; x.setAttribute("aria-label", "Open on X");
    side.appendChild(x);
    c.appendChild(side);

    const meta = el("div", "meta");
    const author = el("div", "author");
    if (item.author.avatar) { const a = el("img"); a.src = item.author.avatar; a.alt = ""; author.appendChild(a); }
    author.appendChild(el("b", null, "@" + item.author.username));
    if (item.author.verified) author.appendChild(el("span", "badge", "✓"));
    author.appendChild(el("span", "when", ago(item.createdAt)));
    if (item.video.kind === "gif") author.appendChild(el("span", "chip", "GIF"));
    if (item.hasImages) author.appendChild(el("span", "chip", "+ photos"));
    meta.appendChild(author);
    if (item.text) {
      const cap = el("p", "caption", item.text);
      cap.onclick = () => cap.classList.toggle("open");
      meta.appendChild(cap);
    }
    c.appendChild(meta);

    const prog = el("div", "progress"); const bar = el("div", "bar"); bar.style.transform = "scaleX(0)"; prog.appendChild(bar);
    const seek = (e) => { const v = c.video; if (!v || !v.duration) return; const r = prog.getBoundingClientRect(); const px = (e.touches ? e.touches[0] : e).clientX; v.currentTime = Math.max(0, Math.min(1, (px - r.left) / r.width)) * v.duration; };
    prog.onclick = seek; prog.ontouchstart = seek;
    c.appendChild(prog);

    c.ui = { holder, img, play, buf, fail, bar, mute, tall };
    c.item = item;
    return c;
  }

  function mount(c) {
    if (c.video || c.failed) return;
    const v = document.createElement("video");
    v.className = "video " + (c.ui.tall ? "cover" : "contain");
    v.src = c.item.video.src; if (c.item.video.poster) v.poster = c.item.video.poster;
    v.muted = state.muted; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "metadata";
    v.onclick = () => { if (v.paused) { v.play().catch(() => {}); c.ui.play.hidden = true; } else { v.pause(); c.ui.play.hidden = false; } };
    v.ontimeupdate = () => { if (v.duration) c.ui.bar.style.transform = `scaleX(${v.currentTime / v.duration})`; };
    v.onwaiting = () => { c.ui.buf.hidden = false; };
    v.onplaying = () => { c.ui.buf.hidden = true; };
    v.onerror = () => { c.failed = true; v.remove(); c.video = null; c.ui.fail.hidden = false; };
    c.ui.holder.replaceChildren(v);
    c.video = v;
  }
  function unmount(c) {
    if (!c.video) return;
    c.video.pause(); c.video.removeAttribute("src"); c.video.load(); c.video.remove(); c.video = null;
    c.ui.holder.replaceChildren(c.ui.img);
    c.ui.bar.style.transform = "scaleX(0)";
  }

  function update() {
    const slides = scroller.querySelectorAll(".slide[data-index]");
    slides.forEach((s) => {
      const i = Number(s.dataset.index), c = s.firstChild, d = Math.abs(i - state.active);
      if (d <= 2) mount(c); else unmount(c);
      if (!c.video) return;
      if (i === state.active) {
        c.video.preload = "auto";
        c.video.play().then(() => { c.ui.play.hidden = true; }).catch(() => { c.ui.play.hidden = false; });
        markSeen(c.item.id);
      } else { c.video.pause(); c.ui.play.hidden = true; }
    });
    applyMute();
  }
  function applyMute() {
    scroller.querySelectorAll(".card").forEach((c) => {
      if (c.video) c.video.muted = state.muted;
      c.ui.mute.textContent = state.muted ? "🔇" : "🔊";
      c.ui.mute.setAttribute("aria-label", state.muted ? "Unmute" : "Mute");
    });
  }
  function markSeen(id) {
    if (seen.has(id)) return;
    seen.add(id);
    const arr = [...seen].slice(-2000);
    localStorage.setItem("xr.seen", JSON.stringify(arr));
  }

  let io;
  function observe() {
    io?.disconnect();
    io = new IntersectionObserver((entries) => {
      let changed = false;
      for (const e of entries) if (e.isIntersecting) { state.active = Number(e.target.dataset.index); changed = true; }
      if (changed) update();
    }, { root: scroller, threshold: 0.6 });
    scroller.querySelectorAll("[data-index]").forEach((s) => io.observe(s));
  }

  /* ---------- chrome ---------- */
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab"); if (!b) return;
    state.tab = b.dataset.tab; localStorage.setItem("xr.tab", state.tab);
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b));
    render();
  });
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === state.tab));
  $("#refresh").onclick = () => load(true);
  $("#info").onclick = () => {
    const s = $("#infosheet");
    if (!s.hidden) { s.hidden = true; return; }
    const f = state.feed;
    s.replaceChildren();
    s.appendChild(el("strong", null, state.tab === "top" ? "Top videos from accounts you follow" : "Latest videos from accounts you follow"));
    s.appendChild(el("p", null, "This is not X's \"For You\" feed; the official API doesn't offer it. Latest = newest video posts from the last 7 days, Top = the same posts ranked by likes and views."));
    if (f) s.appendChild(el("p", null, `@${f.username} · ${f.following} accounts · ${f.items.length} videos · updated ${agoText(f.generatedAt)}`));
    s.hidden = false;
  };
  $("#infosheet").onclick = () => { $("#infosheet").hidden = true; };
  window.addEventListener("keydown", (e) => {
    const h = scroller.clientHeight;
    if (e.key === "ArrowDown" || e.key === "j") scroller.scrollBy({ top: h, behavior: "smooth" });
    if (e.key === "ArrowUp" || e.key === "k") scroller.scrollBy({ top: -h, behavior: "smooth" });
    if (e.key === "m") { state.muted = !state.muted; applyMute(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) scroller.querySelectorAll(".card").forEach((c) => c.video?.pause());
    else { update(); if (state.feed && Date.now() - Date.parse(state.feed.generatedAt) > 30 * 60e3) load(false); }
  });

  let toastT;
  function toast(msg) {
    let t = $(".toast"); if (!t) { t = el("div", "toast"); document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2500);
  }

  renderState("loading");
  load(false);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
