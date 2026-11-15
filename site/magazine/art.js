const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = n => Math.round(n * 10) / 10;

function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starPath(cx, cy, n, ro, ri, rot = 0) {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, t = rot + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    d += (i ? "L" : "M") + r1(cx + r * Math.cos(t)) + " " + r1(cy + r * Math.sin(t));
  }
  return d + "Z";
}

function rays(cx, cy, n, r, fill, op = 1) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + .5) / n) * Math.PI * 2;
    s += `<path d="M${cx} ${cy}L${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}L${r1(cx + r * Math.cos(b))} ${r1(cy + r * Math.sin(b))}Z" fill="${fill}" opacity="${op}"/>`;
  }
  return s;
}

const svg = (vb, body, par = "xMidYMid slice") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="${par}">${body}</svg>`;

const COVER_ART = {
  "1920s": p => {
    const rnd = rng("deco");
    let city = "";
    [[20, 70, 230], [95, 60, 300], [160, 90, 380], [255, 90, 470], [350, 70, 360], [425, 80, 420], [510, 75, 260]].forEach(([x, w, h]) => {
      const y = 690 - h;
      city += `<path d="M${x} 690V${y + 40}H${x + w * .12}V${y + 18}H${x + w * .3}V${y}H${x + w * .7}V${y + 18}H${x + w * .88}V${y + 40}H${x + w}V690Z" fill="${p.ink}"/>`;
      city += `<path d="M${x + w / 2 - 4} ${y}L${x + w / 2} ${y - 46}L${x + w / 2 + 4} ${y}Z" fill="${p.ink}"/>`;
      for (let wy = y + 52; wy < 670; wy += 22) for (let wx = x + 10; wx < x + w - 14; wx += 14)
        if (rnd() > .45) city += `<rect x="${wx}" y="${wy}" width="6" height="10" fill="${p.c1}"/>`;
    });
    let water = "";
    for (let i = 0; i < 9; i++) water += `<rect x="${60 + rnd() * 460}" y="${700 + i * 7}" width="${30 + rnd() * 70}" height="2.5" fill="${p.c1}" opacity=".8"/>`;
    return svg("0 0 600 760", `<rect width="600" height="760" fill="${p.c2}"/>${rays(300, 470, 32, 1000, "#fff", .08)}
      <circle cx="300" cy="470" r="170" fill="${p.c1}"/><circle cx="300" cy="470" r="138" fill="none" stroke="${p.c2}" stroke-width="7"/>
      <circle cx="300" cy="470" r="104" fill="none" stroke="${p.c2}" stroke-width="5"/>
      <circle cx="480" cy="120" r="48" fill="${p.c4}"/><circle cx="500" cy="106" r="44" fill="${p.c2}"/>
      ${city}<rect y="690" width="600" height="70" fill="${p.ink}"/>${water}`);
  },
  "1940s": p => {
    let furrows = "";
    for (let x = -400; x <= 1000; x += 70) furrows += `<path d="M300 430L${x} 760" stroke="${p.c4}" stroke-width="7" opacity=".55"/>`;
    let raysS = "";
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i + .25) / 9 * Math.PI, b = Math.PI + (i + .75) / 9 * Math.PI;
      raysS += `<path d="M300 430L${r1(300 + 900 * Math.cos(a))} ${r1(430 + 900 * Math.sin(a))}L${r1(300 + 900 * Math.cos(b))} ${r1(430 + 900 * Math.sin(b))}Z" fill="${p.c2}" opacity=".9"/>`;
    }
    let poles = "";
    [450, 495, 540].forEach((x, i) => {
      poles += `<path d="M${x} 640L${x + 4} ${470 + i * 8}" stroke="${p.ink}" stroke-width="5"/>`;
      for (let y = 490 + i * 8; y < 630; y += 26) poles += `<ellipse cx="${x - 10}" cy="${y}" rx="13" ry="6" fill="${p.c3}" transform="rotate(-30 ${x - 10} ${y})"/><ellipse cx="${x + 14}" cy="${y + 12}" rx="13" ry="6" fill="${p.c3}" transform="rotate(30 ${x + 14} ${y + 12})"/>`;
    });
    return svg("0 0 600 760", `<rect width="600" height="760" fill="${p.c4}"/>${raysS}
      <path d="M150 430A150 150 0 0 1 450 430Z" fill="${p.c1}"/>
      <rect y="430" width="600" height="330" fill="${p.c3}"/>${furrows}
      <path d="M60 430V372H150V430Z" fill="${p.c2}"/><path d="M48 376L105 330L162 376Z" fill="${p.c1}"/>
      <rect x="128" y="336" width="12" height="26" fill="${p.c2}"/><rect x="92" y="396" width="20" height="34" fill="${p.c4}"/>
      ${poles}`);
  },
  "1950s": p => {
    const rnd = rng("atomic");
    let deco = "";
    for (let i = 0; i < 14; i++) {
      const x = rnd() * 600, y = rnd() * 420, s = 10 + rnd() * 22;
      deco += `<path d="${starPath(x, y, 4, s, s * .22)}" fill="${i % 3 ? "#fff" : p.c3}" opacity=".9"/>`;
    }
    const boom = (x, y, rot, c) => `<path transform="translate(${x} ${y}) rotate(${rot})" d="M0 0C40 -40 90 -30 110 -10C80 -15 60 -5 40 25C30 15 15 5 0 0Z" fill="${c}"/>`;
    let counter = "";
    for (let i = 0; i < 8; i++) counter += boom(20 + i * 80, 650 + (i % 2) * 45, i * 47, i % 2 ? p.c3 : p.c2);
    let lines = "";
    [[150, 230], [130, 280], [450, 230], [470, 280]].forEach(([x, y]) => lines += `<path d="M${x} ${y}L${x + (x < 300 ? -40 : 40)} ${y - 18}" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`);
    return svg("0 0 600 760", `<defs><linearGradient id="chrome50" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f4f6f7"/><stop offset=".55" stop-color="#b9c1c6"/><stop offset="1" stop-color="#8d979d"/></linearGradient></defs>
      <rect width="600" height="760" fill="${p.c2}"/>${deco}
      <path d="${starPath(300, 330, 16, 250, 200)}" fill="${p.c3}" opacity=".35"/>
      <rect y="600" width="600" height="160" fill="${p.c4}"/>${counter}
      <rect x="225" y="150" width="70" height="170" rx="16" fill="#f0c27a" stroke="#b9793a" stroke-width="8" transform="rotate(-8 260 235)"/>
      <rect x="310" y="130" width="70" height="170" rx="16" fill="#f0c27a" stroke="#b9793a" stroke-width="8" transform="rotate(9 345 215)"/>
      ${lines}
      <rect x="140" y="270" width="320" height="300" rx="70" fill="url(#chrome50)" stroke="${p.ink}" stroke-width="6"/>
      <rect x="200" y="262" width="90" height="22" rx="10" fill="${p.ink}"/><rect x="310" y="262" width="90" height="22" rx="10" fill="${p.ink}"/>
      <path d="M165 360Q300 330 435 360" stroke="#fff" stroke-width="10" fill="none" opacity=".8"/>
      <rect x="440" y="380" width="44" height="22" rx="8" fill="${p.c1}" stroke="${p.ink}" stroke-width="4"/>
      <circle cx="300" cy="470" r="26" fill="${p.c1}" stroke="${p.ink}" stroke-width="4"/>
      <rect x="175" y="566" width="40" height="22" rx="6" fill="${p.ink}"/><rect x="385" y="566" width="40" height="22" rx="6" fill="${p.ink}"/>`);
  },
  "1960s": p => {
    const rnd = rng("space");
    let stars = "";
    for (let i = 0; i < 70; i++) stars += `<circle cx="${r1(rnd() * 600)}" cy="${r1(rnd() * 760)}" r="${r1(.8 + rnd() * 2.2)}" fill="#fff" opacity="${r1(.5 + rnd() * .5)}"/>`;
    let op = "";
    for (let r = 130, i = 0; r > 0; r -= 13, i++) op += `<circle cx="130" cy="600" r="${r}" fill="${i % 2 ? "#fff" : p.ink}"/>`;
    return svg("0 0 600 760", `<rect width="600" height="760" fill="#10285a"/>${stars}
      <circle cx="440" cy="210" r="150" fill="${p.c1}"/><path d="M290 210A150 150 0 0 0 590 210" fill="${p.c4}" opacity=".35"/>
      <ellipse cx="440" cy="210" rx="250" ry="48" fill="none" stroke="${p.c3}" stroke-width="16" transform="rotate(-18 440 210)"/>
      ${op}
      <g transform="translate(320 440) rotate(28)">
        <path d="M-20 140Q0 240 20 140Z" fill="${p.c3}"/><path d="M-12 140Q0 200 12 140Z" fill="${p.c1}"/>
        <path d="M-40 -60Q0 -200 40 -60V130H-40Z" fill="#f4f1ea"/>
        <path d="M-40 -60Q0 -200 40 -60Z" fill="${p.c1}"/>
        <circle cx="0" cy="0" r="22" fill="${p.c2}" stroke="#151515" stroke-width="7"/>
        <path d="M-40 70L-82 140H-40Z" fill="${p.c1}"/><path d="M40 70L82 140H40Z" fill="${p.c1}"/>
        <rect x="-6" y="60" width="12" height="80" fill="${p.c1}"/>
      </g>`);
  },
  "1970s": p => {
    const arcs = [[540, p.c1], [480, p.c2], [420, p.c4], [360, p.c3]]
      .map(([r, c]) => `<path d="M${300 - r} 760A${r} ${r} 0 0 1 ${300 + r} 760" fill="none" stroke="${c}" stroke-width="60"/>`).join("");
    let stripes = "";
    for (let i = 0; i < 5; i++) stripes += `<rect x="150" y="${560 - i * 22 + 40}" width="300" height="${4 + i * 2.2}" fill="#f6e4b6"/>`;
    return svg("0 0 600 760", `<rect width="600" height="760" fill="#f6e4b6"/>${arcs}
      <circle cx="300" cy="520" r="150" fill="${p.c1}"/>${stripes}
      <path d="M0 760L0 640L120 560L210 630L320 520L450 640L520 590L600 640V760Z" fill="${p.c4}"/>
      <path d="M0 760L0 700Q150 640 300 700T600 690V760Z" fill="${p.c3}"/>`);
  },
  "1980s": p => {
    let grid = "";
    for (let x = -900; x <= 1500; x += 75) grid += `<path d="M300 470L${x} 760" stroke="${p.c1}" stroke-width="2.5"/>`;
    for (let k = 1; k < 12; k++) { const y = 470 + Math.pow(k / 11, 2) * 290; grid += `<path d="M0 ${r1(y)}H600" stroke="${p.c1}" stroke-width="2.5"/>`; }
    let cuts = "";
    for (let i = 0; i < 7; i++) cuts += `<rect x="140" y="${r1(390 + i * 12)}" width="320" height="${r1(2 + i * 1.3)}" fill="#000"/>`;
    const rnd = rng("neon");
    let stars = "";
    for (let i = 0; i < 40; i++) stars += `<circle cx="${r1(rnd() * 600)}" cy="${r1(rnd() * 300)}" r="${r1(.8 + rnd() * 1.6)}" fill="#fff" opacity=".8"/>`;
    return svg("0 0 600 760", `<defs><linearGradient id="sky80" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${p.c4}"/><stop offset=".6" stop-color="${p.c3}"/><stop offset="1" stop-color="${p.c1}"/></linearGradient>
      <linearGradient id="sun80" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe14d"/><stop offset="1" stop-color="${p.c1}"/></linearGradient>
      <mask id="m80"><rect width="600" height="760" fill="#fff"/>${cuts}</mask></defs>
      <rect width="600" height="470" fill="url(#sky80)"/>${stars}
      <circle cx="300" cy="350" r="150" fill="url(#sun80)" mask="url(#m80)"/>
      <path d="M0 470L80 390L150 430L240 340L330 450L420 360L520 420L600 380V470Z" fill="#0b0820" stroke="${p.c2}" stroke-width="3"/>
      <rect y="470" width="600" height="290" fill="#0b0820"/>${grid}`);
  },
  "1990s": p => {
    const rnd = rng("zine");
    const torn = (x, y, w, h, fill, rot) => {
      let d = `M${x} ${y}`;
      for (let i = 1; i <= 12; i++) d += `L${r1(x + w * i / 12)} ${r1(y + (rnd() - .5) * 14)}`;
      for (let i = 1; i <= 12; i++) d += `L${r1(x + w + (rnd() - .5) * 14)} ${r1(y + h * i / 12)}`;
      for (let i = 11; i >= 0; i--) d += `L${r1(x + w * i / 12)} ${r1(y + h + (rnd() - .5) * 14)}`;
      for (let i = 11; i > 0; i--) d += `L${r1(x + (rnd() - .5) * 14)} ${r1(y + h * i / 12)}`;
      return `<path d="${d}Z" fill="${fill}" transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"/>`;
    };
    let teeth = "";
    [-90, 90].forEach(dx => { for (let i = 0; i < 6; i++) teeth += `<rect x="${dx - 4}" y="-34" width="8" height="14" fill="${p.ink}" transform="rotate(${i * 60} ${dx} 0)"/>`; });
    return svg("0 0 600 760", `<defs><pattern id="dots90" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="3.2" fill="${p.ink}"/></pattern></defs>
      <rect width="600" height="760" fill="#cfcfca"/>
      ${torn(30, 40, 330, 300, "url(#dots90)", -6)}${torn(250, 90, 320, 260, "#f4f4f0", 7)}
      <circle cx="400" cy="230" r="130" fill="${p.c1}"/>${torn(40, 470, 360, 240, "#f4f4f0", -4)}
      <g transform="translate(300 480) rotate(-9)">
        <rect x="-200" y="-125" width="400" height="250" rx="18" fill="${p.ink}"/>
        <rect x="-170" y="-100" width="340" height="120" rx="6" fill="#f4f4f0"/>
        <path d="M-150 -70H150M-150 -40H60" stroke="${p.ink}" stroke-width="3" opacity=".5"/>
        <text x="0" y="-48" text-anchor="middle" font-family="Permanent Marker" font-size="38" fill="${p.ink}">MIX #3</text>
        <rect x="-130" y="-20" width="260" height="62" rx="30" fill="#555"/>
        <circle cx="-90" cy="11" r="26" fill="#f4f4f0"/><circle cx="90" cy="11" r="26" fill="#f4f4f0"/>
        <g transform="translate(0 11)">${teeth}</g>
        <path d="M-120 125L-95 70H95L120 125Z" fill="#333"/>
      </g>
      <path d="M40 720L90 690L130 730L180 685L230 725" stroke="${p.c4}" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
};

const AD_ART = {
  "1920s": (p, b) => svg("0 0 400 400", `${rays(200, 220, 24, 300, p.c1, .25)}
    <ellipse cx="200" cy="300" rx="130" ry="34" fill="${p.ink}"/><rect x="70" y="220" width="260" height="80" fill="${p.ink}"/>
    <rect x="70" y="238" width="260" height="8" fill="${p.c1}"/><rect x="70" y="276" width="260" height="8" fill="${p.c1}"/>
    <ellipse cx="200" cy="220" rx="130" ry="34" fill="${p.c1}"/>${rays(200, 220, 16, 112, p.c4, .55).replace(/<path/g, '<path transform="translate(200 220) scale(1 .26) translate(-200 -220)"')}
    <text x="200" y="228" text-anchor="middle" font-family="Limelight" font-size="26" fill="${p.ink}">${esc(b).toUpperCase()}</text>
    <circle cx="320" cy="150" r="40" fill="${p.c4}"/><circle cx="320" cy="150" r="12" fill="${p.c3}"/>`, "xMidYMid meet"),
  "1940s": (p, b) => svg("0 0 400 400", `<path d="M250 110L300 80V300L250 340Z" fill="#7d2a22"/><path d="M110 110L160 80H300L250 110Z" fill="#c76a5e"/>
    <rect x="110" y="110" width="140" height="230" fill="${p.c1}"/><ellipse cx="180" cy="210" rx="58" ry="70" fill="${p.c4}"/>
    <text x="180" y="208" text-anchor="middle" font-family="Bebas Neue" font-size="${Math.max(18, 40 - b.length)}" fill="${p.c2}">${esc(b).toUpperCase()}</text>
    <text x="180" y="236" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="14" fill="${p.c1}">SOAP FLAKES</text>
    <path d="M310 120q14 -8 20 4M330 170q14 -8 20 4M318 220q14 -8 20 4M75 150q-14 -8 -20 4M70 220q-14 -8 -20 4" stroke="${p.c2}" stroke-width="5" fill="none" stroke-linecap="round"/>`, "xMidYMid meet"),
  "1950s": (p, b) => svg("0 0 400 400", `<path d="${starPath(310, 90, 8, 44, 18)}" fill="${p.c3}"/><path d="${starPath(80, 300, 4, 30, 7)}" fill="${p.c2}"/>
    <rect x="120" y="40" width="160" height="330" rx="34" fill="#f7f4ee" stroke="${p.ink}" stroke-width="6"/>
    <path d="M120 150H280" stroke="${p.ink}" stroke-width="5"/><rect x="250" y="80" width="12" height="50" rx="6" fill="#9aa3a8" stroke="${p.ink}" stroke-width="3"/>
    <rect x="250" y="175" width="12" height="90" rx="6" fill="#9aa3a8" stroke="${p.ink}" stroke-width="3"/>
    <text x="190" y="230" text-anchor="middle" font-family="Pacifico" font-size="28" fill="${p.c1}">${esc(b)}</text>
    <rect x="140" y="368" width="26" height="16" fill="${p.ink}"/><rect x="234" y="368" width="26" height="16" fill="${p.ink}"/>
    <path d="M135 60Q140 48 152 46" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>`, "xMidYMid meet"),
  "1960s": (p, b) => {
    let dots = "";
    for (let y = 175; y <= 305; y += 14) for (let x = 85; x <= 215; x += 14) if ((x - 150) ** 2 + (y - 240) ** 2 < 66 ** 2) dots += `<circle cx="${x}" cy="${y}" r="4.5" fill="${p.ink}"/>`;
    return svg("0 0 400 400", `<path d="M300 140L360 20" stroke="${p.ink}" stroke-width="6"/><circle cx="360" cy="20" r="7" fill="${p.ink}"/>
      <rect x="50" y="140" width="300" height="200" rx="26" fill="${p.c1}"/><rect x="50" y="140" width="300" height="26" rx="13" fill="${p.c4}" opacity=".35"/>
      ${dots}<circle cx="280" cy="240" r="48" fill="#fff" stroke="${p.ink}" stroke-width="6"/><path d="M280 240L300 210" stroke="${p.c2}" stroke-width="6" stroke-linecap="round"/>
      <text x="200" y="326" text-anchor="middle" font-family="Archivo Black" font-size="20" fill="#fff">${esc(b).toUpperCase()}</text>`, "xMidYMid meet");
  },
  "1970s": (p, b) => svg("0 0 400 400", `${rays(200, 210, 18, 280, p.c1, .3)}
    <rect x="174" y="30" width="52" height="24" rx="6" fill="${p.c4}"/>
    <path d="M178 54V110Q178 140 150 170Q130 190 130 230V360Q130 380 150 380H250Q270 380 270 360V230Q270 190 250 170Q222 140 222 110V54Z" fill="${p.c2}"/>
    <rect x="130" y="240" width="140" height="80" fill="${p.c1}"/>
    <text x="200" y="292" text-anchor="middle" font-family="Shrikhand" font-size="${Math.max(18, 36 - b.length * 1.5)}" fill="${p.c4}">${esc(b)}</text>
    <circle cx="160" cy="200" r="6" fill="#fff" opacity=".6"/><circle cx="240" cy="345" r="8" fill="#fff" opacity=".5"/><circle cx="158" cy="350" r="5" fill="#fff" opacity=".5"/>
    <path d="M150 190Q148 230 150 360" stroke="#fff" stroke-width="7" fill="none" opacity=".35" stroke-linecap="round"/>`, "xMidYMid meet"),
  "1980s": (p, b) => {
    let keys = "";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) keys += `<rect x="${72 + c * 22 + r * 6}" y="${318 + r * 18}" width="17" height="13" rx="2" fill="#d9d6e3"/>`;
    return svg("0 0 400 400", `<rect x="60" y="30" width="280" height="230" rx="14" fill="#e9e6f0" stroke="${p.ink}" stroke-width="5"/>
      <rect x="84" y="52" width="232" height="168" rx="8" fill="#0b0820"/>
      <text x="100" y="92" font-family="VT323" font-size="26" fill="${p.c2}">${esc(b).toUpperCase()} BASIC</text>
      <text x="100" y="122" font-family="VT323" font-size="26" fill="${p.c2}">128K RAM SYSTEM</text>
      <text x="100" y="170" font-family="VT323" font-size="26" fill="${p.c1}">READY.</text><rect x="100" y="180" width="14" height="20" fill="${p.c1}"/>
      <rect x="84" y="232" width="60" height="8" fill="${p.c1}"/><rect x="150" y="232" width="60" height="8" fill="${p.c2}"/><rect x="216" y="232" width="60" height="8" fill="${p.c3}"/>
      <path d="M40 300L60 286H340L360 300V380H40Z" fill="#c9c5d6" stroke="${p.ink}" stroke-width="5"/>${keys}`, "xMidYMid meet");
  },
  "1990s": (p, b) => svg("0 0 400 400", `<path d="${starPath(305, 95, 9, 70, 40, .2)}" fill="${p.c4}"/>
    <rect x="130" y="70" width="140" height="290" fill="${p.ink}"/><ellipse cx="200" cy="360" rx="70" ry="18" fill="${p.ink}"/>
    <ellipse cx="200" cy="70" rx="70" ry="18" fill="#9a9a95"/><ellipse cx="200" cy="70" rx="56" ry="12" fill="#c9c9c4"/>
    <rect x="186" y="56" width="30" height="12" rx="6" fill="#888"/>
    <text transform="translate(222 330) rotate(-90)" font-family="Permanent Marker" font-size="${Math.max(30, 74 - b.length * 4)}" fill="${p.c1}">${esc(b).toUpperCase()}</text>
    <path d="M150 100V330" stroke="#fff" stroke-width="8" opacity=".25"/>
    <path d="M60 330L90 300L80 350L120 320" stroke="${p.c1}" stroke-width="6" fill="none" stroke-linecap="round"/>`, "xMidYMid meet")
};

function barcodeSvg(seed, ink) {
  const rnd = rng(seed);
  let x = 6, bars = "";
  while (x < 112) { const w = rnd() > .6 ? 2.4 : 1.1; if (rnd() > .35) bars += `<rect x="${r1(x)}" y="4" width="${w}" height="${x < 9 || x > 108 ? 44 : 38}" fill="${ink}"/>`; x += w + .9 + rnd() * 1.6; }
  let digits = "";
  for (let i = 0; i < 11; i++) digits += Math.floor(rnd() * 10);
  return svg("0 0 120 58", `<rect width="120" height="58" fill="#fff"/>${bars}<text x="60" y="55" text-anchor="middle" font-family="monospace" font-size="8" fill="${ink}">${digits.slice(0, 1)} ${digits.slice(1, 6)} ${digits.slice(6)}</text>`, "xMidYMid meet");
}

function burstSvg(fill, stroke) {
  return svg("0 0 200 200", `<path d="${starPath(100, 100, 18, 98, 80)}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`, "xMidYMid meet");
}

function noiseUrl(alpha) {
  const n = 220, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d"), img = g.createImageData(n, n), rnd = rng("paper" + alpha);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd(), speck = rnd() > .996;
    img.data[i] = 78; img.data[i + 1] = 62; img.data[i + 2] = 38;
    img.data[i + 3] = Math.min(255, Math.round((speck ? 2.6 : v * v * v * 1.6) * 255 * alpha));
  }
  g.putImageData(img, 0, 0);
  return `url("${c.toDataURL("image/png")}")`;
}
