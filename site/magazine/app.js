const $ = id => document.getElementById(id);
const STORE = "magmaker:v1", PHOTO_STORE = "magmaker:v1:photos";
const SLOTS = ["cover", "feature", "ad"];
const state = { era: "1950s", size: "A4", aged: true, text: { ...ERAS["1950s"].sample }, photos: { cover: null, feature: null, ad: null } };

const FORM = [
  ["Cover", "cover", [["name", "Magazine name"], ["issue", "Issue number"], ["date", "Month and year"], ["price", "Price"],
    ["badge", "Badge (leave empty for none)"], ["lead", "Lead story"], ["leadSub", "Lead story teaser"], ["lines", "Other cover lines, one per line", 5]]],
  ["Contents page", null, [["letter", "Editor's letter", 6], ["editor", "Signed by"], ["boxTitle", "Small box title"], ["boxText", "Small box text", 4]]],
  ["Feature story", "feature", [["fHead", "Headline"], ["fStand", "Intro line", 2], ["fBy", "Byline"], ["fBody", "Story, one paragraph per line", 12],
    ["fPull", "Pull quote", 2], ["fCap", "Photo caption"]]],
  ["Advert", "ad", [["aBrand", "Brand"], ["aProduct", "Product"], ["aSlogan", "Slogan"], ["aBody", "Advert text", 4], ["aCoupon", "Coupon offer", 2], ["aFine", "Fine print", 2]]]
];
const LABELS = { name: "masthead", lead: "lead story", leadSub: "teaser", lines: "cover lines", toc: "contents", letter: "editor's letter", box: "small box",
  fHead: "feature headline", fStand: "intro line", fBody: "story text", aSlogan: "slogan", aBody: "advert text" };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || "null");
    if (s && ERAS[s.era]) {
      state.era = s.era; state.size = s.size === "Letter" ? "Letter" : "A4"; state.aged = s.aged !== false;
      state.text = { ...ERAS[s.era].sample, ...(s.text || {}) };
    }
  } catch {}
  try {
    const p = JSON.parse(localStorage.getItem(PHOTO_STORE) || "null");
    if (p) SLOTS.forEach(k => { if (typeof p[k] === "string" && p[k].startsWith("data:image/")) state.photos[k] = p[k]; });
  } catch {}
}

let saveTimer;
function save(withPhotos) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ era: state.era, size: state.size, aged: state.aged, text: state.text })); } catch {}
  }, 300);
  if (withPhotos) {
    try { localStorage.setItem(PHOTO_STORE, JSON.stringify(state.photos)); }
    catch { setStatus("These photos are too big to remember next time, but they're in this issue and in the PDF."); }
  }
}

function setStatus(msg, err) { const s = $("status"); s.textContent = msg || ""; s.classList.toggle("err", !!err); }

const linesOf = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean).slice(0, 6);
const paras = s => String(s || "").split(/\n+/).map(x => x.trim()).filter(Boolean);
const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60);
const artTag = s => s.replace("<svg ", '<svg class="ph-svg" ');
const photoTag = src => `<img class="ph-img" src="${src}" alt=""><div class="halftone"></div>`;
const run = t => `<div class="run"><span>${esc(t.name)}</span><span>${esc(t.date)}</span></div>`;
const fi = s => `<span class="fi">${s}</span>`;
const deco = `<div class="frame"></div><div class="stripes"></div>`;
const hint = slot => state.photos[slot] ? "Tap to change photo" : "Your photo here";

function coverHtml(E, t) {
  const art = state.photos.cover ? photoTag(state.photos.cover) : artTag(COVER_ART[state.era](E.pal));
  const burst = state.era === "1980s" ? E.pal.c1 : E.pal.c3;
  return `<section class="page p-cover">${deco}<div class="fold"></div><div class="corner"></div>
    <div class="c-mast"><span class="m-name" data-fit="20" data-k="name" data-axis="w">${fi(esc(t.name))}</span></div>
    <div class="c-date"><span>${esc(t.issue)}</span><span>${esc(t.date)}</span><span>${esc(t.price)}</span></div>
    <div class="c-art slot" data-slot="cover" data-hint="${hint("cover")}">${art}${E.barcode ? `<div class="c-bar">${barcodeSvg(t.name + t.date, "#111")}</div>` : ""}</div>
    <div class="c-lead"><h2 data-fit="13" data-k="lead">${fi(`<span class="hl">${esc(t.lead)}</span>`)}</h2>${t.leadSub ? `<p data-fit="7.5" data-k="leadSub">${fi(esc(t.leadSub))}</p>` : ""}</div>
    <ul class="c-lines" data-fit="7" data-k="lines">${linesOf(t.lines).map(l => `<li>${esc(l)}</li>`).join("")}</ul>
    ${t.badge ? `<div class="c-badge">${burstSvg(burst, E.pal.ink)}<span>${esc(t.badge)}</span></div>` : ""}
  </section>`;
}

function contentsHtml(E, t) {
  const pages = [12, 19, 26, 33, 40, 47];
  const main = t.fHead || t.lead;
  const items = [`<li><span class="pg">3</span><span class="tx"><b>${esc(main)}</b>${t.fStand ? `<i>${esc(t.fStand)}</i>` : ""}</span></li>`]
    .concat(linesOf(t.lines).filter(l => l !== main).map((l, i) => `<li><span class="pg">${pages[i]}</span><span class="tx"><b>${esc(l)}</b></span></li>`));
  return `<section class="page p-in p-contents">${deco}${run(t)}
    <h2 class="t-title">${esc(E.tocTitle)}</h2>
    <div class="t-main">
      <ol class="toc" data-fit="7" data-k="toc">${items.join("")}</ol>
      <div class="t-side">
        <div class="letter"><h3>${esc(E.letterTitle)}</h3><div class="l-body" data-fit="7" data-k="letter">${paras(t.letter).map(p => `<p>${esc(p)}</p>`).join("")}</div>
          ${t.editor ? `<p class="sign">${esc(t.editor)}</p>` : ""}</div>
        ${t.boxTitle || t.boxText ? `<aside class="box"><h4>${esc(t.boxTitle)}</h4><p data-fit="6.5" data-k="box">${fi(esc(t.boxText))}</p></aside>` : ""}
      </div>
      <figure class="t-cover slot" data-slot="cover"><div class="ph" data-hint="${hint("cover")}">${state.photos.cover ? photoTag(state.photos.cover) : artTag(COVER_ART[state.era](E.pal))}</div>
        <figcaption><b>${esc(E.onCover || "On the cover")}:</b> ${esc(t.lead)}</figcaption></figure>
    </div>
    <div class="folio">2</div>
  </section>`;
}

function featureHtml(E, t) {
  const art = state.photos.feature ? photoTag(state.photos.feature) : artTag(COVER_ART[state.era](E.pal));
  const ps = paras(t.fBody), at = Math.min(2, ps.length);
  const pull = t.fPull ? `<blockquote class="pull">${esc(t.fPull)}</blockquote>` : "";
  const body = ps.map((p, i) => (i === at ? pull : "") + `<p>${esc(p)}</p>`).join("") + (at >= ps.length ? pull : "");
  return `<section class="page p-in p-feature">${deco}${run(t)}
    <div class="f-top"><div class="f-kick">${esc(E.kicker)}</div>
      <h1 class="f-head" data-fit="16" data-k="fHead">${fi(esc(t.fHead))}</h1>
      ${t.fStand ? `<p class="f-stand" data-fit="8" data-k="fStand">${fi(`<span class="hl">${esc(t.fStand)}</span>`)}</p>` : ""}
      ${t.fBy ? `<p class="f-by">${esc(t.fBy)}</p>` : ""}</div>
    <figure class="f-fig slot" data-slot="feature"><div class="ph" data-hint="${hint("feature")}">${art}</div>${t.fCap ? `<figcaption>${esc(t.fCap)}</figcaption>` : ""}</figure>
    <div class="f-body" data-fit="6.5" data-k="fBody" data-axis="w">${body}</div>
    <div class="folio">3</div>
  </section>`;
}

function adHtml(E, t) {
  const art = state.photos.ad ? photoTag(state.photos.ad) : artTag(AD_ART[state.era](E.pal, t.aBrand || ""));
  return `<section class="page p-ad">${deco}
    <div class="a-tag">${esc(E.adTag)}</div>
    <div class="a-frame">
      <div class="a-brand">${esc(t.aBrand)}</div>
      <h2 class="a-slogan" data-fit="14" data-k="aSlogan">${fi(esc(t.aSlogan))}</h2>
      <div class="a-art slot" data-slot="ad" data-hint="${state.photos.ad ? "Tap to change photo" : "Product photo here"}">${art}</div>
      <div class="a-product">${esc(t.aProduct)}</div>
      <p class="a-body" data-fit="7" data-k="aBody">${fi(esc(t.aBody))}</p>
      ${t.aCoupon ? `<div class="a-coupon"><span class="a-cut">✂</span><p>${esc(t.aCoupon)}</p><div class="a-form"><span>Name</span><span>Address</span><span>Town</span></div></div>` : ""}
      ${t.aFine ? `<p class="a-fine">${esc(t.aFine)}</p>` : ""}
    </div>
  </section>`;
}

const noiseCache = {};
function render() {
  const E = ERAS[state.era], t = state.text, root = $("pages"), p = E.pal;
  const alpha = Math.round(E.noise * (state.aged ? .22 : .12) * 100) / 100;
  const vars = { "--paper": p.paper, "--ink": p.ink, "--c1": p.c1, "--c2": p.c2, "--c3": p.c3, "--c4": p.c4, "--tint": E.tint,
    "--noise": noiseCache[alpha] || (noiseCache[alpha] = noiseUrl(alpha)),
    "--pw": state.size === "Letter" ? "8.5in" : "210mm", "--ph": state.size === "Letter" ? "11in" : "297mm" };
  root.className = "mag" + (state.aged ? " aged" : "");
  root.dataset.era = state.era;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.innerHTML = [coverHtml, contentsHtml, featureHtml, adHtml].map(f => `<div class="sheet">${f(E, t)}</div>`).join("");
  $("pagestyle").textContent = `@page { size: ${state.size === "Letter" ? "letter" : "A4"}; margin: 0; }`;
  layout();
  fitAll();
}

function layout() {
  $("pages").querySelectorAll(".sheet").forEach(s => {
    const pg = s.firstElementChild, k = s.clientWidth / pg.offsetWidth;
    if (!k) return;
    pg.style.transform = `scale(${k})`;
    s.style.height = pg.offsetHeight * k + "px";
  });
}

function over(el) {
  if (el.scrollWidth > el.clientWidth + 1) return true;
  if (el.dataset.axis === "w") return false;
  let bottom = 0;
  for (const c of el.children) bottom = Math.max(bottom, c.offsetTop + c.offsetHeight);
  return bottom > el.clientHeight + 1;
}
function fitAll() {
  const root = $("pages"), els = [...root.querySelectorAll("[data-fit]")], cut = [];
  root.classList.add("measuring");
  els.forEach(el => { el.style.fontSize = ""; });
  els.forEach(el => {
    const min = +el.dataset.fit * 96 / 72;
    let size = parseFloat(getComputedStyle(el).fontSize), n = 0;
    while (over(el) && size > min && n++ < 80) { size = Math.max(min, size * .95); el.style.fontSize = size + "px"; }
    if (over(el)) cut.push(LABELS[el.dataset.k] || el.dataset.k);
  });
  root.classList.remove("measuring");
  const msg = cut.length ? `Too long to fit, so it's cut off: ${cut.join(", ")}. Shorten it a little.` : "";
  if (msg || $("status").dataset.cut) { setStatus(msg, !!msg); $("status").dataset.cut = msg ? "1" : ""; }
}

function fontsReady() {
  const E = ERAS[state.era];
  return Promise.race([
    Promise.all(E.fonts.map(f => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready),
    new Promise(r => setTimeout(r, 5000))
  ]);
}
const refit = () => fontsReady().then(() => { layout(); fitAll(); });

let renderTimer;
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => { render(); refit(); }, 220); };

function buildEditor() {
  $("eras").innerHTML = Object.entries(ERAS).map(([k, E]) => `<button type="button" data-era="${k}"><b>${k}</b><small>${esc(E.tag)}</small></button>`).join("");
  $("fields").innerHTML = FORM.map(([title, slot, fields], i) => `<details class="group"${i === 0 ? " open" : ""}><summary>${title}</summary><div class="gbody">
    ${slot ? `<div class="photo"><div class="thumb" id="thumb-${slot}"></div><div class="pbtns">
      <label class="btn">Add photo<input type="file" accept="image/*" id="file-${slot}" data-slot="${slot}" hidden></label>
      <button type="button" class="ghost" data-clear="${slot}">Remove</button></div></div>` : ""}
    ${fields.map(([k, label, rows]) => `<label class="field"><span>${label}</span>${rows ? `<textarea name="${k}" rows="${rows}"></textarea>` : `<input name="${k}" autocomplete="off">`}</label>`).join("")}
  </div></details>`).join("");
}

function fillForm() {
  FIELDS.forEach(k => { const el = document.querySelector(`[name="${k}"]`); if (el) el.value = state.text[k] ?? ""; });
  document.querySelectorAll("#eras button").forEach(b => b.classList.toggle("on", b.dataset.era === state.era));
  $("optSize").value = state.size;
  $("optAged").checked = state.aged;
  $("sampleEra").textContent = state.era;
  updateThumbs();
}

function updateThumbs() {
  SLOTS.forEach(s => {
    const th = $("thumb-" + s);
    if (th) th.style.backgroundImage = state.photos[s] ? `url("${state.photos[s]}")` : "";
    if (th) th.textContent = state.photos[s] ? "" : "No photo: drawing used";
    const clr = document.querySelector(`[data-clear="${s}"]`);
    if (clr) clr.disabled = !state.photos[s];
  });
}

const isUntouched = era => FIELDS.every(k => (state.text[k] ?? "") === (ERAS[era].sample[k] ?? ""));

function switchEra(era) {
  if (era === state.era) return;
  const prev = state.era, untouched = isUntouched(prev);
  state.era = era;
  if (untouched) state.text = { ...ERAS[era].sample };
  else ["issue", "date", "price"].forEach(k => { if (state.text[k] === ERAS[prev].sample[k]) state.text[k] = ERAS[era].sample[k]; });
  fillForm(); save(); render(); refit();
  setStatus(untouched ? `Showing a sample ${era} issue. Change any text to make it yours.` : `Now styled as the ${era}. Your text stayed the same.`);
}

async function shrinkPhoto(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", .85);
  } finally { URL.revokeObjectURL(url); }
}

function setTab(tab) {
  document.body.dataset.tab = tab;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  if (tab === "preview") { layout(); window.scrollTo(0, 0); }
}

function wire() {
  $("eras").onclick = e => { const b = e.target.closest("button[data-era]"); if (b) switchEra(b.dataset.era); };
  $("fields").addEventListener("input", e => {
    const k = e.target.name;
    if (!FIELDS.includes(k)) return;
    state.text[k] = e.target.value; save(); scheduleRender();
  });
  $("fields").addEventListener("change", async e => {
    const inp = e.target;
    if (inp.type !== "file" || !inp.files[0]) return;
    const slot = inp.dataset.slot;
    setStatus("Adding photo…");
    try {
      state.photos[slot] = await shrinkPhoto(inp.files[0]);
      setStatus("Photo added.");
      save(true); render(); refit(); updateThumbs();
    } catch { setStatus("Couldn't read that picture. Try a JPG or PNG.", true); }
    inp.value = "";
  });
  $("fields").addEventListener("click", e => {
    const b = e.target.closest("[data-clear]");
    if (!b) return;
    state.photos[b.dataset.clear] = null;
    save(true); render(); refit(); updateThumbs();
  });
  $("pages").onclick = e => { const s = e.target.closest(".slot"); if (s) $("file-" + s.dataset.slot).click(); };
  $("optSize").onchange = e => { state.size = e.target.value; save(); render(); refit(); };
  $("optAged").onchange = e => { state.aged = e.target.checked; save(); render(); refit(); };
  $("sample").onclick = () => {
    if (!isUntouched(state.era) && !confirm(`Replace all your text with the sample ${state.era} text? Your photos stay.`)) return;
    state.text = { ...ERAS[state.era].sample }; fillForm(); save(); render(); refit();
    setStatus(`Loaded the sample ${state.era} text.`);
  };
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setTab(b.dataset.tab));
  let oldTitle = document.title;
  $("pdf").onclick = async () => {
    $("pdf").disabled = true;
    setStatus("Getting the fonts ready…");
    try { await fontsReady(); layout(); fitAll(); } finally { $("pdf").disabled = false; }
    oldTitle = document.title;
    document.title = slug(`${state.text.name} ${state.text.date}`) || "vintage-magazine";
    setStatus("In the print screen, choose “Save as PDF” as the printer.");
    window.print();
  };
  window.addEventListener("afterprint", () => { document.title = oldTitle; });
  new ResizeObserver(() => layout()).observe($("pages"));
  document.fonts.addEventListener("loadingdone", () => { layout(); fitAll(); });
}

load();
buildEditor();
wire();
fillForm();
setTab("edit");
render();
refit();
