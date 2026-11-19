// AI issue builder: a photo library of up to 100 pictures, Gemini vision to
// describe each one, then Gemini again to write the whole issue around them.
// Runs entirely in the browser with the user's own free Gemini API key.

const MAX_PHOTOS = 100;
const AI_STORE = "magmaker:v1:ai", GALLERY_STORE = "magmaker:v1:gallery";
const lib = [];               // [{ id, src, w, h, title, caption, mood, score, skipped }]
let gallery = null;           // { sections: [{ title, intro, ids: [] }] }
const aiOpts = { provider: "gemini", key: "", model: "", claudeKey: "", claudeModel: "claude-haiku-5-5", theme: "", tone: "era" };

/* ---------- photo storage (IndexedDB: 100 photos are far too big for localStorage) ---------- */
const idb = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("magmaker", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("photos", { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction("photos", mode), st = t.objectStore("photos"), out = fn(st);
    t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error);
  }); };
  return {
    all: () => tx("readonly", st => st.getAll()),
    put: p => tx("readwrite", st => st.put(p)),
    del: id => tx("readwrite", st => st.delete(id)),
    clear: () => tx("readwrite", st => st.clear()),
  };
})();
const persist = p => idb.put({ ...p }).catch(() => {});

function loadAi() {
  try { Object.assign(aiOpts, JSON.parse(localStorage.getItem(AI_STORE) || "{}")); } catch {}
  try { gallery = JSON.parse(localStorage.getItem(GALLERY_STORE) || "null"); } catch {}
}
function saveAi() {
  try { localStorage.setItem(AI_STORE, JSON.stringify(aiOpts)); } catch {}
  try { localStorage.setItem(GALLERY_STORE, JSON.stringify(gallery)); } catch {}
}

/* ---------- adding photos ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

async function imgSize(src) {
  const i = new Image(); i.src = src; await i.decode().catch(() => {});
  return { w: i.naturalWidth || 1, h: i.naturalHeight || 1 };
}

async function addSrc(src) {
  if (lib.length >= MAX_PHOTOS) return false;
  const { w, h } = await imgSize(src);
  const p = { id: uid(), src, w, h, title: "", caption: "", added: Date.now() };
  lib.push(p); persist(p);
  return true;
}

async function addFiles(files) {
  let added = 0, skipped = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    if (lib.length >= MAX_PHOTOS) { skipped++; continue; }
    setStatus(`Adding photo ${added + 1}…`);
    try { if (await addSrc(await shrinkPhoto(f, 1400))) added++; } catch { skipped++; }
  }
  return { added, skipped };
}

// Pictures from links go through the wsrv.nl image proxy (allows CORS, resizes for us)
async function addUrls(urls) {
  let added = 0, skipped = 0;
  for (const raw of urls) {
    const u = raw.trim();
    if (!/^https?:\/\//i.test(u)) continue;
    if (lib.length >= MAX_PHOTOS) { skipped++; continue; }
    setStatus(`Fetching picture ${added + skipped + 1} of ${urls.length}…`);
    const tries = [`https://wsrv.nl/?url=${encodeURIComponent(u)}&w=1400&h=1400&fit=inside&output=jpg&q=85`, u];
    let ok = false;
    for (const t of tries) {
      try {
        const r = await fetch(t); if (!r.ok) continue;
        const b = await r.blob(); if (!b.type.startsWith("image/")) continue;
        ok = await addSrc(await blobToDataUrl(b)); if (ok) break;
      } catch {}
    }
    ok ? added++ : skipped++;
  }
  return { added, skipped };
}

const extractUrls = text => (String(text).match(/https?:\/\/[^\s"'<>]+/g) || []);

function report({ added, skipped }) {
  const full = lib.length >= MAX_PHOTOS ? ` The library is full (${MAX_PHOTOS}).` : "";
  setStatus(`Added ${added} photo${added === 1 ? "" : "s"}${skipped ? `, ${skipped} couldn't be added` : ""}. ${lib.length}/${MAX_PHOTOS} in the library.${full}`, !added && skipped > 0);
  renderLib();
}

/* ---------- library UI ---------- */
function renderLib() {
  $("libCount").textContent = `${lib.length}/${MAX_PHOTOS}`;
  $("lib").innerHTML = lib.map(p => `<div class="lt${p.skipped ? " skip" : ""}" data-id="${p.id}" style="background-image:url('${p.src}')" title="${esc(p.title || "")}">
    <button type="button" class="lx" data-del="${p.id}" aria-label="Remove">×</button>${p.caption ? `<span class="ld">✓</span>` : ""}</div>`).join("")
    || `<p class="lempty">No photos yet. Add up to ${MAX_PHOTOS} from your device, paste them, or paste links.</p>`;
  $("aiGo").disabled = !lib.length;
  $("libClear").disabled = !lib.length;
  const described = lib.filter(p => p.caption).length;
  $("aiGo").textContent = !lib.length ? "Add photos first" : gallery ? `Rewrite issue from ${lib.length} photos` : `Write my magazine from ${lib.length} photos`;
  $("libNote").textContent = described ? `${described} described by AI.` : "";
}

/* ---------- Gemini ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let lastCall = 0;
const API = "https://generativelanguage.googleapis.com/v1beta";

// Google retires model names often, so ask which ones this key can use and rank them:
// newest version first, Flash before Flash-Lite, stable before preview; skip image/audio/live/TTS models.
let modelCache = null;
const verOf = id => (id.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1] * 1;
function modelRank(id) {
  return verOf(id) * 100 - (/lite/.test(id) ? 10 : 0) - (/preview|exp/.test(id) ? 30 : 0) - (/-\d{3}$|\d{2}-\d{2}/.test(id) ? 1 : 0) + (/pro/.test(id) ? -5 : 0);
}
async function listModels(force) {
  if (modelCache && !force) return modelCache;
  if (!aiOpts.key) return [];
  const r = await fetch(`${API}/models?pageSize=1000&key=${encodeURIComponent(aiOpts.key)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = data.error?.message || `HTTP ${r.status}`;
    throw new Error(/API key|API_KEY/i.test(m) ? "That Gemini API key doesn't work. Check it in AI settings." : m);
  }
  modelCache = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => m.name.replace(/^models\//, ""))
    .filter(id => /^gemini-/.test(id) && !/image|audio|live|tts|embed|vision|robotics|computer|thinking|learnlm|nano|veo|imagen/i.test(id))
    .sort((a, b) => modelRank(b) - modelRank(a));
  return modelCache;
}
async function refreshModels(force) {
  const sel = $("aiModel");
  try {
    const ids = await listModels(force);
    if (!ids.length) return;
    if (!ids.includes(aiOpts.model)) { aiOpts.model = ids[0]; saveAi(); }
    sel.innerHTML = ids.map((id, i) => `<option value="${id}">${id}${i === 0 ? " (recommended)" : ""}</option>`).join("") + `<option value="__custom">Other model…</option>`;
    sel.value = aiOpts.model;
    $("aiModelNote").textContent = `${ids.length} models available on your key.`;
  } catch (e) { $("aiModelNote").textContent = e.message; }
}
// Called when a model is missing or has no free quota: move to the next one on the list
async function nextModel(reason) {
  const ids = await listModels(true).catch(() => []);
  const tried = (nextModel.tried ||= new Set()); tried.add(aiOpts.model);
  const next = ids.find(id => !tried.has(id));
  if (!next) return false;
  setStatus(`${reason} Switching to ${next}…`);
  aiOpts.model = next; saveAi(); refreshModels();
  return true;
}

async function gemini(parts, { json = true, temperature = 0.8 } = {}) {
  if (!aiOpts.key) throw new Error("Add your free Gemini API key first (AI settings).");
  if (!aiOpts.model) { const ids = await listModels(); aiOpts.model = ids[0] || "gemini-3.5-flash"; saveAi(); refreshModels(); }
  const body = { contents: [{ role: "user", parts }], generationConfig: { temperature } };
  if (json) body.generationConfig.responseMimeType = "application/json";
  for (let attempt = 0; attempt < 8; attempt++) {
    delete body.generationConfig.thinkingConfig;
    if (/2\.5-flash/.test(aiOpts.model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const wait = 6500 - (Date.now() - lastCall);   // free tier is ~10 requests a minute
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const r = await fetch(`${API}/models/${encodeURIComponent(aiOpts.model)}:generateContent?key=${encodeURIComponent(aiOpts.key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    const msg = data.error?.message || "";
    // model retired / not on this key, or a model with no free quota ("limit: 0"): try the next one
    if (r.status === 404 || (r.status === 400 && /not (found|supported)|unsupported model/i.test(msg))) {
      if (await nextModel(`Model ${aiOpts.model} isn't available.`)) { attempt--; continue; }
      throw new Error("None of the Gemini models on your key worked. Check the key in AI settings.");
    }
    if (r.status === 429 && /limit: 0\b/.test(msg)) {
      if (await nextModel(`${aiOpts.model} has no free quota on your key.`)) { attempt--; continue; }
    }
    if (r.status === 429 || r.status === 503) {
      const d = (data.error?.details || []).find(x => x.retryDelay)?.retryDelay;
      const secs = d ? parseFloat(d) : 20 * (attempt + 1);
      setStatus(`Gemini is busy or at its free limit. Waiting ${Math.ceil(secs)}s…`);
      await sleep(secs * 1000 + 500);
      continue;
    }
    if (!r.ok) {
      const m = data.error?.message || `HTTP ${r.status}`;
      if (r.status === 400 && /API key/i.test(m)) throw new Error("That Gemini API key doesn't work. Check it in AI settings.");
      throw new Error(m);
    }
    const cand = data.candidates?.[0];
    if (!cand || data.promptFeedback?.blockReason || cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") {
      const e = new Error("blocked"); e.blocked = true; throw e;
    }
    const text = (cand.content?.parts || []).map(p => p.text || "").join("");
    if (!json) return text;
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { if (attempt < 2) continue; throw new Error("Gemini sent back something unreadable. Try again."); }
  }
  throw new Error("Gemini stayed busy. Wait a minute and try again.");
}

/* ---------- Claude (paid, called straight from the browser with the user's own key) ---------- */
const parseJson = text => {
  const t = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try { return JSON.parse(t); } catch {}
  const a = Math.min(...["[", "{"].map(c => t.indexOf(c)).filter(i => i >= 0));
  const b = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  return JSON.parse(t.slice(a, b + 1));
};

async function claude(parts, { temperature = 0.8 } = {}) {
  if (!aiOpts.claudeKey) throw new Error("Add your Claude API key first (AI settings).");
  const content = parts.map(p => p.inline_data
    ? { type: "image", source: { type: "base64", media_type: p.inline_data.mime_type, data: p.inline_data.data } }
    : { type: "text", text: p.text });
  content.push({ type: "text", text: "Reply with only the JSON, no other text." });
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": aiOpts.claudeKey, "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ model: aiOpts.claudeModel || "claude-haiku-5-5", max_tokens: 8000, temperature, messages: [{ role: "user", content }] }),
    });
    const data = await r.json().catch(() => ({}));
    const msg = data.error?.message || `HTTP ${r.status}`;
    if (r.status === 429 || r.status === 529 || r.status === 503) {
      const secs = +(r.headers.get("retry-after") || 0) || 15 * (attempt + 1);
      setStatus(`Claude is busy or at your rate limit. Waiting ${secs}s…`);
      await sleep(secs * 1000); continue;
    }
    if (r.status === 401) throw new Error("That Claude API key doesn't work. Check it in AI settings.");
    if (/credit balance/i.test(msg)) throw new Error("Your Claude account has no credit. Add a few dollars at console.anthropic.com → Billing.");
    if (r.status === 404 || /model/i.test(msg) && r.status === 400) throw new Error(`Claude model "${aiOpts.claudeModel}" isn't available on your key. Pick another in AI settings.`);
    if (!r.ok) throw new Error(msg);
    if (data.stop_reason === "refusal") { const e = new Error("blocked"); e.blocked = true; throw e; }
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    try { return parseJson(text); }
    catch { if (attempt < 2) continue; throw new Error("Claude sent back something unreadable. Try again."); }
  }
  throw new Error("Claude stayed busy. Wait a minute and try again.");
}

const callAI = (parts, opts) => aiOpts.provider === "claude" ? claude(parts, opts) : gemini(parts, opts);
const hasKey = () => aiOpts.provider === "claude" ? !!aiOpts.claudeKey : !!aiOpts.key;

// Small JPEG copy for the AI (keeps requests fast and inside the free limits)
async function aiThumb(src, max = 640) {
  const i = new Image(); i.src = src; await i.decode();
  const k = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k);
  c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", .72).split(",")[1];
}

const TONES = {
  era: "the authentic voice of the decade's magazines",
  editorial: "a polished, thoughtful editorial voice",
  fashion: "a glossy fashion-and-style voice",
  travel: "an evocative travel-writing voice",
  poetic: "a lyrical, poetic voice",
  playful: "a witty, playful, tongue-in-cheek voice",
  documentary: "a plain, observant documentary voice",
};

function eraBrief() {
  const E = ERAS[state.era];
  return `a ${state.era} magazine ("${E.tag}" style), written in ${TONES[aiOpts.tone] || TONES.era}`;
}

async function describeBatch(batch) {
  const parts = [{ text:
`You are the picture editor of ${eraBrief()}.${aiOpts.theme ? ` The issue is about: ${aiOpts.theme}.` : ""}
Look at each photo below. For every photo return an object:
- "id": the id given before the photo
- "title": a 2-6 word headline for it
- "caption": 1-2 vivid sentences (max 40 words) describing what is actually visible: setting, light, colour, people's clothing and activity, objects, atmosphere
- "subject": a few words naming the main subject
- "mood": one or two words
- "score": 1-10, how strong it would be as a cover photo
Rules: describe only what you can see; never guess who a real person is or name them; keep everything tasteful and non-sexual, describing people respectfully as you would in a mainstream magazine.
Return only a JSON array.` }];
  for (const p of batch) {
    parts.push({ text: `Photo id: ${p.id}` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: await aiThumb(p.src) } });
  }
  return callAI(parts, { temperature: 0.7 });
}

async function describeAll(onProgress) {
  const todo = lib.filter(p => !p.caption && !p.skipped);
  const SIZE = 10;
  for (let i = 0; i < todo.length; i += SIZE) {
    const batch = todo.slice(i, i + SIZE);
    onProgress(i, todo.length);
    let res;
    try { res = await describeBatch(batch); }
    catch (e) {
      if (!e.blocked) throw e;
      res = [];                                  // one photo tripped the filter: go one by one
      for (const p of batch) {
        try { res.push(...await describeBatch([p])); }
        catch (e2) { if (!e2.blocked) throw e2; p.skipped = true; persist(p); }
      }
    }
    for (const d of Array.isArray(res) ? res : []) {
      const p = lib.find(x => x.id === String(d.id));
      if (!p) continue;
      Object.assign(p, { title: String(d.title || "").slice(0, 80), caption: String(d.caption || "").slice(0, 400),
        subject: String(d.subject || "").slice(0, 80), mood: String(d.mood || "").slice(0, 40), score: +d.score || 5 });
      persist(p);
    }
    renderLib();
  }
  onProgress(todo.length, todo.length);
}

async function writeIssue() {
  const usable = lib.filter(p => p.caption && !p.skipped);
  if (!usable.length) throw new Error("None of the photos could be described.");
  const E = ERAS[state.era], sample = E.sample;
  const photos = usable.map(p => ({ id: p.id, title: p.title, caption: p.caption, subject: p.subject, mood: p.mood, score: p.score, shape: p.w > p.h * 1.15 ? "landscape" : p.h > p.w * 1.15 ? "portrait" : "square" }));
  const prompt =
`You are the editor of ${eraBrief()}.${aiOpts.theme ? ` This issue is about: ${aiOpts.theme}.` : " Find the theme that ties these photos together."}
Write a complete issue built around these ${photos.length} photos (already described by your picture editor):
${JSON.stringify(photos)}

Return one JSON object with exactly these keys:
${JSON.stringify(Object.keys(sample))}
plus "coverId", "featureId", "adId" (photo ids: the strongest cover photo, a photo that suits the feature story, a photo that could sell a product in the advert; use different photos if you can),
plus "sections": an array of 2-8 themed photo sections, each { "title": 2-5 words, "intro": 1-2 sentences, "ids": [photo ids] }. Every photo id must appear in exactly one section; group photos that belong together and order them so the pages flow.

Here is an example issue in the same style. Match its format and roughly its lengths for every key (newlines inside "lines" and "fBody" separate items/paragraphs). Do not copy its content; write fresh copy about these photos:
${JSON.stringify(sample)}

The feature story ("fBody") should be about what the photos show, 4-6 paragraphs. Invent a fitting magazine name, brand and product. Never name or identify real people in the photos. Keep it tasteful and suitable for a mainstream magazine.`;
  return callAI([{ text: prompt }], { temperature: 0.9 });
}

async function buildIssue() {
  if (!lib.length) return;
  if (!hasKey()) { $("aiBox").open = true; (aiOpts.provider === "claude" ? $("aiClaudeKey") : $("aiKey")).focus(); setStatus(`Paste your ${aiOpts.provider === "claude" ? "Claude" : "free Gemini"} API key first.`, true); return; }
  $("aiGo").disabled = true;
  try {
    await describeAll((done, total) => total && setStatus(`Looking at your photos… ${done}/${total}`));
    setStatus("Writing the issue around your photos…");
    const out = await writeIssue();
    const ids = new Set(lib.filter(p => p.caption && !p.skipped).map(p => p.id));
    const text = {};
    FIELDS.forEach(k => { text[k] = typeof out[k] === "string" ? out[k] : (state.text[k] ?? ""); });
    state.text = { ...state.text, ...text };
    const pick = (id, fallback) => lib.find(p => p.id === String(id) && ids.has(p.id)) || fallback;
    const ranked = lib.filter(p => ids.has(p.id)).sort((a, b) => (b.score || 0) - (a.score || 0));
    state.photos.cover = pick(out.coverId, ranked[0])?.src || null;
    state.photos.feature = pick(out.featureId, ranked[1] || ranked[0])?.src || null;
    state.photos.ad = pick(out.adId, ranked[2] || ranked[0])?.src || null;
    // sections: keep valid ids, drop repeats, put any forgotten photos in a final section
    const used = new Set(), sections = [];
    for (const s of Array.isArray(out.sections) ? out.sections : []) {
      const sids = (s.ids || []).map(String).filter(id => ids.has(id) && !used.has(id));
      sids.forEach(id => used.add(id));
      if (sids.length) sections.push({ title: String(s.title || "Gallery").slice(0, 60), intro: String(s.intro || "").slice(0, 300), ids: sids });
    }
    const rest = [...ids].filter(id => !used.has(id));
    if (rest.length) sections.push({ title: "More Pictures", intro: "", ids: rest });
    gallery = { sections };
    saveAi(); fillForm(); save(true); render(); refit();
    try { localStorage.setItem(STORE, JSON.stringify({ era: state.era, size: state.size, aged: state.aged, text: state.text })); } catch {}  // don't wait for the debounce
    const skipped = lib.filter(p => p.skipped).length;
    setStatus(`Done: your ${state.era} issue has ${4 + galleryPages().length} pages and ${ids.size} described photos.${skipped ? ` ${skipped} photo${skipped > 1 ? "s were" : " was"} skipped by the AI's safety filter.` : ""} Check the Preview.`);
    if (window.matchMedia("(max-width: 979px)").matches) setTab("preview");
  } catch (e) {
    setStatus(e.message || "Something went wrong. Try again.", true);
  } finally { renderLib(); }
}

/* ---------- gallery pages ---------- */
function galleryPages() {
  if (!gallery?.sections?.length) return [];
  const byId = Object.fromEntries(lib.map(p => [p.id, p]));
  const pages = [];
  for (const s of gallery.sections) {
    const items = s.ids.map(id => byId[id]).filter(p => p && !p.skipped);
    for (let i = 0, first = true; i < items.length; first = false) {
      const n = first ? 3 : 4;                    // first page of a section leaves room for its title
      pages.push({ section: s, first, items: items.slice(i, i + n) });
      i += n;
    }
  }
  return pages;
}

function galleryHtml(E, t, pg, folio) {
  const figs = pg.items.map((p, k) => `<figure class="g-fig" data-photo="${p.id}">
      <div class="ph">${photoTag(p.src)}</div>
      <figcaption data-fit="6" data-k="caption"><b>${esc(p.title || "")}</b> ${esc(p.caption || "")}</figcaption></figure>`).join("");
  return `<section class="page p-in p-gallery">${deco}${run(t)}
    ${pg.first ? `<div class="g-top"><div class="f-kick">${esc(E.kicker)}</div><h2 class="g-title" data-fit="14" data-k="sectionTitle">${fi(esc(pg.section.title))}</h2>
      ${pg.section.intro ? `<p class="g-intro" data-fit="7" data-k="sectionIntro">${fi(esc(pg.section.intro))}</p>` : ""}</div>` : `<div class="g-cont">${esc(pg.section.title)} <span>continued</span></div>`}
    <div class="g-grid g-n${pg.items.length}">${figs}</div>
    <div class="folio">${folio}</div>
  </section>`;
}

/* ---------- editing one gallery photo ---------- */
function editPhoto(id) {
  const p = lib.find(x => x.id === id); if (!p) return;
  $("peImg").src = p.src; $("peTitle").value = p.title || ""; $("peCaption").value = p.caption || "";
  $("photoEdit").dataset.id = id;
  $("photoEdit").showModal();
}

/* ---------- wiring ---------- */
function wireAi() {
  loadAi();
  if (/^gemini-(1|2)\./.test(aiOpts.model)) aiOpts.model = "";   // retired generations
  $("aiKey").value = aiOpts.key; $("aiModel").value = aiOpts.model; $("aiTheme").value = aiOpts.theme; $("aiTone").value = aiOpts.tone;
  if (aiOpts.model && ![...$("aiModel").options].some(o => o.value === aiOpts.model)) $("aiModel").add(new Option(aiOpts.model, aiOpts.model, true, true));
  if (aiOpts.key) refreshModels();
  let keyTimer;
  $("aiKey").addEventListener("input", () => { clearTimeout(keyTimer); modelCache = null; keyTimer = setTimeout(() => refreshModels(true), 700); });
  ["aiKey", "aiTheme"].forEach(k => $(k).addEventListener("input", e => { aiOpts[k === "aiKey" ? "key" : "theme"] = e.target.value.trim(); saveAi(); }));
  $("aiModel").onchange = e => {
    if (e.target.value === "__custom") {
      const m = prompt("Gemini model name (e.g. gemini-3.5-flash):", aiOpts.model);
      if (m) { aiOpts.model = m.trim(); if (![...e.target.options].some(o => o.value === aiOpts.model)) e.target.add(new Option(aiOpts.model, aiOpts.model), 0); }
      e.target.value = aiOpts.model;
    } else aiOpts.model = e.target.value;
    saveAi();
  };
  $("aiTone").onchange = e => { aiOpts.tone = e.target.value; saveAi(); };
  const showProvider = () => {
    $("aiProvider").value = aiOpts.provider;
    document.querySelectorAll("[data-prov]").forEach(el => { el.hidden = el.dataset.prov !== aiOpts.provider; });
  };
  $("aiProvider").onchange = e => { aiOpts.provider = e.target.value; saveAi(); showProvider(); };
  $("aiClaudeKey").value = aiOpts.claudeKey;
  $("aiClaudeKey").addEventListener("input", e => { aiOpts.claudeKey = e.target.value.trim(); saveAi(); });
  if (![...$("aiClaudeModel").options].some(o => o.value === aiOpts.claudeModel)) $("aiClaudeModel").add(new Option(aiOpts.claudeModel, aiOpts.claudeModel), 0);
  $("aiClaudeModel").value = aiOpts.claudeModel;
  $("aiClaudeModel").onchange = e => {
    if (e.target.value === "__custom") {
      const m = prompt("Claude model ID (e.g. claude-haiku-5-5):", aiOpts.claudeModel);
      if (m) { aiOpts.claudeModel = m.trim(); if (![...e.target.options].some(o => o.value === aiOpts.claudeModel)) e.target.add(new Option(aiOpts.claudeModel, aiOpts.claudeModel), 0); }
      e.target.value = aiOpts.claudeModel;
    } else aiOpts.claudeModel = e.target.value;
    saveAi();
  };
  showProvider();

  $("libFiles").onchange = async e => { report(await addFiles([...e.target.files])); e.target.value = ""; };
  $("libAddUrls").onclick = async () => { const urls = extractUrls($("libUrls").value); if (!urls.length) return setStatus("Paste one or more picture links first.", true); report(await addUrls(urls)); $("libUrls").value = ""; };
  $("libPaste").onclick = async () => {
    try {
      const items = await navigator.clipboard.read(); const files = [], urls = [];
      for (const it of items) {
        const t = it.types.find(x => x.startsWith("image/"));
        if (t) files.push(new File([await it.getType(t)], "pasted", { type: t }));
        else if (it.types.includes("text/plain")) urls.push(...extractUrls(await (await it.getType("text/plain")).text()));
      }
      if (!files.length && !urls.length) return setStatus("Nothing to paste: copy a picture or a picture link first.", true);
      const a = await addFiles(files), b = await addUrls(urls);
      report({ added: a.added + b.added, skipped: a.skipped + b.skipped });
    } catch { setStatus("Your browser blocked the paste button. Long-press the link box and choose Paste, or press Ctrl+V anywhere.", true); }
  };
  // Ctrl+V / long-press paste anywhere outside a text box
  document.addEventListener("paste", async e => {
    if (e.target.closest("input, textarea")) return;
    const files = [...(e.clipboardData?.files || [])], urls = extractUrls(e.clipboardData?.getData("text") || "");
    if (!files.length && !urls.length) return;
    e.preventDefault();
    const a = await addFiles(files), b = await addUrls(urls);
    report({ added: a.added + b.added, skipped: a.skipped + b.skipped });
  });
  $("lib").onclick = async e => {
    const d = e.target.closest("[data-del]");
    if (d) { const i = lib.findIndex(p => p.id === d.dataset.del); if (i >= 0) { lib.splice(i, 1); idb.del(d.dataset.del); }
      if (gallery) gallery.sections.forEach(s => s.ids = s.ids.filter(id => id !== d.dataset.del)); saveAi(); renderLib(); render(); refit(); return; }
    const t = e.target.closest("[data-id]"); if (t && lib.find(p => p.id === t.dataset.id)?.caption) editPhoto(t.dataset.id);
  };
  $("libClear").onclick = async () => {
    if (!confirm(`Remove all ${lib.length} photos and the photo pages?`)) return;
    lib.length = 0; gallery = null; await idb.clear().catch(() => {}); saveAi(); renderLib(); render(); refit();
  };
  $("aiGo").onclick = buildIssue;
  $("aiDrop").onclick = () => { if (!gallery || !confirm("Remove the photo pages from the issue? Your photos stay in the library.")) return; gallery = null; saveAi(); render(); refit(); renderLib(); };
  $("pages").addEventListener("click", e => { const f = e.target.closest("[data-photo]"); if (f) { e.stopPropagation(); editPhoto(f.dataset.photo); } }, true);
  $("peSave").onclick = () => {
    const p = lib.find(x => x.id === $("photoEdit").dataset.id);
    if (p) { p.title = $("peTitle").value.trim(); p.caption = $("peCaption").value.trim(); persist(p); render(); refit(); }
  };
  $("peRemove").onclick = () => {
    const id = $("photoEdit").dataset.id;
    if (gallery) gallery.sections.forEach(s => s.ids = s.ids.filter(x => x !== id));
    saveAi(); render(); refit(); $("photoEdit").close();
  };
}

async function initAi() {
  try { (await idb.all()).sort((a, b) => a.added - b.added).slice(0, MAX_PHOTOS).forEach(p => lib.push(p)); } catch {}
  // Pictures sent over from the Scraper
  let imported = [];
  try { imported = JSON.parse(localStorage.getItem("magmaker:import") || "[]"); localStorage.removeItem("magmaker:import"); } catch {}
  renderLib(); render(); refit();
  if (imported.length) { $("libBox").open = true; report(await addUrls(imported)); }
}
