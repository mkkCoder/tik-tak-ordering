/**
 * Generate Pinterest pin creatives (1000×1500, 2:3) for TIKTAK wedding layouts.
 *
 *   node scripts/generate-pins.js
 *
 * Writes PNGs to output/pins/ and a bulk-upload CSV beside them.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'output', 'pins');
const CSV_PATH = join(OUT_DIR, 'pins-bulk-upload.csv');
const DEST = 'https://tik-tak.online';
const WIDTH = 1000;
const HEIGHT = 1500;
const FOOTER = 'Free Browser Tool • No Login Required';

const fontFile = (name) =>
  `data:font/woff2;base64,${readFileSync(join(ROOT, 'public', 'fonts', name)).toString('base64')}`;

/**
 * Ten high-intent wedding seating layouts. Each carries a layout recipe so the
 * embedded plan preview matches the pin topic.
 */
const PINS = [
  {
    slug: 'round-vs-long-tables',
    title: 'Round Tables vs. Long Tables: Reception Layout',
    description:
      'Compare round and long banquet tables on one floor plan. Drag seats in TIKTAK and print a clean wedding seating chart — free in the browser, no login.',
    layout: 'roundVsLong',
    background: 'linear-gradient(165deg, #1a2e24 0%, #4e6b57 48%, #8fa892 100%)',
  },
  {
    slug: '150-guest-seating',
    title: '150-Guest Wedding Seating Arrangement',
    description:
      'Plan a 150-guest reception with capacity you can see. Seat parties on round tables, resolve conflicts, and export a print-ready chart with TIKTAK.',
    layout: 'denseRounds',
    background: 'linear-gradient(160deg, #16202b 0%, #2c3d4f 45%, #576775 100%)',
  },
  {
    slug: 'head-vs-sweetheart',
    title: 'Head Table vs. Sweetheart Table Setup',
    description:
      'See head table and sweetheart table setups side by side. Build your bridal party seats and guest floor plan free in TIKTAK — no account required.',
    layout: 'headVsSweetheart',
    background: 'linear-gradient(170deg, #3d2a24 0%, #6b4e46 50%, #c4a484 100%)',
  },
  {
    slug: 'divorced-parents-seating',
    title: 'Separated Seating: Divorced Parents Guide',
    description:
      'Keep divorced parents comfortably apart with clear side-based seating. Map family tables in TIKTAK’s free drag-and-drop wedding seating chart.',
    layout: 'separatedSides',
    background: 'linear-gradient(155deg, #1e2430 0%, #3a4556 42%, #7a8694 100%)',
  },
  {
    slug: 'free-drag-drop-chart',
    title: 'Free Drag-and-Drop Wedding Seating Chart',
    description:
      'Build your wedding seating chart in the browser — drag guests onto tables, check conflicts, print clean. Free to plan on TIKTAK, no login required.',
    layout: 'classicPlan',
    background: 'linear-gradient(165deg, #243528 0%, #4e6b57 55%, #a8b8a4 100%)',
  },
  {
    slug: 'bridal-party-template',
    title: 'Bridal Party Seating Chart Template',
    description:
      'Seat the bridal party at a long head table and place guest rounds beyond. Use TIKTAK’s free template-style floor plan — edit in the browser.',
    layout: 'bridalParty',
    background: 'linear-gradient(168deg, #2a1f2e 0%, #5a4560 48%, #b89eb0 100%)',
  },
  {
    slug: 'family-table-placement',
    title: 'Family Table Placement for Wedding Reception',
    description:
      'Place family tables near the couple without crowding the dance floor. Arrange parties visually in TIKTAK and print your reception seating chart.',
    layout: 'familyClusters',
    background: 'linear-gradient(162deg, #1f2a22 0%, #3d5344 50%, #9aaf9c 100%)',
  },
  {
    slug: 'u-shape-banquet',
    title: 'U-Shape Banquet Layout for Weddings',
    description:
      'Lay out a U-shape banquet for speeches and sightlines. Prototype long-table geometry in TIKTAK’s free wedding seating tool — no signup.',
    layout: 'uShape',
    background: 'linear-gradient(158deg, #1a2430 0%, #35506b 46%, #7a9bb0 100%)',
  },
  {
    slug: '100-guest-floor-plan',
    title: 'Wedding Floor Plan for 100 Guests',
    description:
      'A clear 100-guest wedding floor plan with rounds, aisles, and room to move. Build and print it free in TIKTAK — browser-based, no login.',
    layout: 'hundredGuests',
    background: 'linear-gradient(166deg, #2b2418 0%, #5c5040 48%, #c4b49a 100%)',
  },
  {
    slug: 'who-sits-where-etiquette',
    title: 'Who Sits Where: Wedding Seating Etiquette',
    description:
      'Turn seating etiquette into a visual map — VIP tables, friends, and coworkers in the right zones. Plan free with TIKTAK’s drag-and-drop chart.',
    layout: 'etiquetteZones',
    background: 'linear-gradient(160deg, #221c28 0%, #4a3f55 50%, #9b8fb0 100%)',
  },
];

function buildHtml(pin) {
  const fonts = {
    fraunces: fontFile('fraunces-latin-full-normal.woff2'),
    inter: fontFile('inter-tight-latin-wght-normal.woff2'),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Fraunces';
  src: url('${fonts.fraunces}') format('woff2-variations');
  font-weight: 100 900;
}
@font-face {
  font-family: 'Inter Tight';
  src: url('${fonts.inter}') format('woff2-variations');
  font-weight: 100 900;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${WIDTH}px;
  height: ${HEIGHT}px;
  overflow: hidden;
  font-family: 'Inter Tight', sans-serif;
  color: #FBF9F5;
  background: ${pin.background};
}
.pin {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 56px 52px 48px;
  position: relative;
}
.pin::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(251,249,245,0.12), transparent 55%),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(0,0,0,0.18), transparent 50%);
  pointer-events: none;
}
.brand {
  position: relative;
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: 28px;
  letter-spacing: 0.04em;
  opacity: 0.92;
}
header {
  position: relative;
  margin-top: 36px;
}
h1 {
  font-family: 'Fraunces', serif;
  font-weight: 650;
  font-size: 58px;
  line-height: 1.08;
  letter-spacing: -0.02em;
  text-shadow: 0 2px 24px rgba(0,0,0,0.25);
  max-width: 16ch;
}
.preview-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 40px 0 28px;
}
.preview {
  width: 820px;
  height: 820px;
  background: #FBF9F5;
  border-radius: 8px;
  box-shadow:
    0 4px 6px rgba(22,32,43,0.08),
    0 24px 48px -12px rgba(22,32,43,0.35);
  overflow: hidden;
  position: relative;
}
.preview svg {
  width: 100%;
  height: 100%;
  display: block;
}
footer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.tag {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: rgba(251,249,245,0.95);
  color: #16202B;
  padding: 14px 22px;
  border-radius: 4px;
}
.url {
  font-size: 20px;
  font-weight: 500;
  opacity: 0.85;
  letter-spacing: 0.01em;
}
</style>
</head>
<body>
<div class="pin">
  <div class="brand">TIKTAK</div>
  <header>
    <h1>${escapeHtml(pin.title)}</h1>
  </header>
  <div class="preview-wrap">
    <div class="preview">
      <svg viewBox="0 0 820 820" id="plan" xmlns="http://www.w3.org/2000/svg"></svg>
    </div>
  </div>
  <footer>
    <div class="tag">${escapeHtml(FOOTER)}</div>
    <div class="url">tik-tak.online</div>
  </footer>
</div>
<script>
(() => {
${layoutScript(pin.layout)}
})();
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Inline SVG drawer — mirrors the product floor-plan look (paper, ink, seats). */
function layoutScript(layout) {
  return `
const ns = 'http://www.w3.org/2000/svg';
const host = document.getElementById('plan');
const el = (n, a = {}, kids = []) => {
  const e = document.createElementNS(ns, n);
  for (const k in a) e.setAttribute(k, a[k]);
  for (const c of kids) e.appendChild(c);
  return e;
};
const ink = '#16202B';
const slate = '#576775';
const paper = '#FBF9F5';
const sage = '#4E6B57';
const linen = '#E8E2D6';

function grid() {
  const g = el('g', { stroke: slate, 'stroke-opacity': '0.14', 'stroke-width': '1' });
  for (let y = 0; y <= 820; y += 40) g.appendChild(el('path', { d: 'M0 ' + y + 'h820' }));
  for (let x = 0; x <= 820; x += 40) g.appendChild(el('path', { d: 'M' + x + ' 0v820' }));
  host.appendChild(g);
}

function roundTable(cx, cy, seats, { r = 48, fillRatio = 0.7, accent = ink, label } = {}) {
  host.appendChild(el('circle', {
    cx, cy, r, fill: paper, stroke: accent, 'stroke-width': '2.5'
  }));
  for (let s = 0; s < seats; s++) {
    const a = (-90 + (360 / seats) * s) * Math.PI / 180;
    const taken = (s / seats) < fillRatio || ((s * 3 + Math.floor(cx)) % seats) < seats * fillRatio;
    host.appendChild(el('circle', {
      cx: cx + Math.cos(a) * (r + 16),
      cy: cy + Math.sin(a) * (r + 16),
      r: 9,
      fill: taken ? accent : paper,
      stroke: slate,
      'stroke-width': '1.5'
    }));
  }
  if (label) {
    const t = el('text', {
      x: cx, y: cy + 5, 'text-anchor': 'middle',
      'font-family': 'Inter Tight, sans-serif', 'font-size': '13',
      'font-weight': '600', fill: accent
    });
    t.textContent = label;
    host.appendChild(t);
  }
}

function longTable(x, y, w, h, seatsLong, seatsShort, { fillRatio = 0.75, accent = ink, label } = {}) {
  host.appendChild(el('rect', {
    x, y, width: w, height: h, rx: '6', fill: paper, stroke: accent, 'stroke-width': '2.5'
  }));
  const seats = [];
  for (let i = 0; i < seatsLong; i++) {
    const t = (i + 0.5) / seatsLong;
    seats.push([x + w * t, y - 16], [x + w * t, y + h + 16]);
  }
  for (let i = 0; i < seatsShort; i++) {
    const t = (i + 0.5) / Math.max(seatsShort, 1);
    if (seatsShort > 0) {
      seats.push([x - 16, y + h * t], [x + w + 16, y + h * t]);
    }
  }
  seats.forEach(([sx, sy], i) => {
    const taken = (i % 5) < Math.round(5 * fillRatio);
    host.appendChild(el('circle', {
      cx: sx, cy: sy, r: 9,
      fill: taken ? accent : paper, stroke: slate, 'stroke-width': '1.5'
    }));
  });
  if (label) {
    const t = el('text', {
      x: x + w / 2, y: y + h / 2 + 5, 'text-anchor': 'middle',
      'font-family': 'Inter Tight, sans-serif', 'font-size': '13',
      'font-weight': '600', fill: accent
    });
    t.textContent = label;
    host.appendChild(t);
  }
}

function zone(x, y, w, h, label, color) {
  host.appendChild(el('rect', {
    x, y, width: w, height: h, rx: '10',
    fill: color, 'fill-opacity': '0.12', stroke: color, 'stroke-width': '1.5',
    'stroke-dasharray': '6 4'
  }));
  const t = el('text', {
    x: x + 14, y: y + 24,
    'font-family': 'Inter Tight, sans-serif', 'font-size': '14',
    'font-weight': '600', fill: color, 'fill-opacity': '0.85'
  });
  t.textContent = label;
  host.appendChild(t);
}

grid();
const layout = ${JSON.stringify(layout)};

if (layout === 'roundVsLong') {
  roundTable(220, 260, 10, { label: 'R1' });
  roundTable(220, 480, 10, { label: 'R2' });
  roundTable(220, 700, 8, { label: 'R3' });
  longTable(420, 200, 280, 56, 8, 0, { label: 'Long A' });
  longTable(420, 360, 280, 56, 8, 0, { label: 'Long B' });
  longTable(420, 520, 280, 56, 8, 0, { label: 'Long C' });
  longTable(420, 680, 280, 56, 6, 0, { label: 'Long D' });
} else if (layout === 'denseRounds') {
  const cols = [180, 410, 640];
  const rows = [170, 360, 550, 720];
  let n = 1;
  for (const cy of rows) for (const cx of cols) {
    roundTable(cx, cy, 10, { r: 42, fillRatio: 0.85, label: String(n++) });
  }
} else if (layout === 'headVsSweetheart') {
  longTable(180, 90, 460, 52, 10, 0, { accent: sage, label: 'Head Table' });
  roundTable(200, 320, 2, { r: 36, accent: sage, fillRatio: 1, label: '♥' });
  const t = el('text', {
    x: 200, y: 390, 'text-anchor': 'middle',
    'font-family': 'Inter Tight, sans-serif', 'font-size': '13',
    'font-weight': '600', fill: sage
  });
  t.textContent = 'Sweetheart';
  host.appendChild(t);
  [[420, 300], [640, 300], [200, 520], [420, 520], [640, 520], [310, 700], [550, 700]].forEach(([cx, cy], i) => {
    roundTable(cx, cy, 10, { r: 44, label: 'T' + (i + 1) });
  });
} else if (layout === 'separatedSides') {
  zone(40, 80, 340, 680, 'Bride side', sage);
  zone(440, 80, 340, 680, 'Groom side', '#5B6B7A');
  roundTable(140, 220, 8, { accent: sage, label: 'Mom' });
  roundTable(300, 220, 8, { accent: sage, label: 'Fam' });
  roundTable(140, 420, 10, { accent: sage, label: 'B2' });
  roundTable(300, 420, 10, { accent: sage, label: 'B3' });
  roundTable(220, 620, 10, { accent: sage, label: 'B4' });
  roundTable(520, 220, 8, { accent: '#3D4F5F', label: 'Dad' });
  roundTable(680, 220, 8, { accent: '#3D4F5F', label: 'Fam' });
  roundTable(520, 420, 10, { accent: '#3D4F5F', label: 'G2' });
  roundTable(680, 420, 10, { accent: '#3D4F5F', label: 'G3' });
  roundTable(600, 620, 10, { accent: '#3D4F5F', label: 'G4' });
} else if (layout === 'classicPlan') {
  longTable(250, 70, 320, 48, 8, 0, { accent: sage, label: 'Couple' });
  [[180, 250], [410, 250], [640, 250], [180, 470], [410, 470], [640, 470], [295, 680], [525, 680]].forEach(([cx, cy], i) => {
    roundTable(cx, cy, 10, { label: String(i + 1) });
  });
} else if (layout === 'bridalParty') {
  longTable(90, 100, 640, 58, 14, 0, { accent: sage, fillRatio: 1, label: 'Bridal Party' });
  [[180, 340], [410, 340], [640, 340], [180, 560], [410, 560], [640, 560], [295, 720], [525, 720]].forEach(([cx, cy], i) => {
    roundTable(cx, cy, 10, { r: 40, label: 'G' + (i + 1) });
  });
} else if (layout === 'familyClusters') {
  zone(60, 60, 700, 280, 'Family near couple', sage);
  longTable(250, 100, 320, 48, 8, 0, { accent: sage, label: 'Couple' });
  roundTable(160, 230, 10, { accent: sage, label: 'Bride fam' });
  roundTable(410, 230, 10, { accent: sage, label: 'Groom fam' });
  roundTable(660, 230, 8, { accent: sage, label: 'VIPs' });
  [[180, 460], [410, 460], [640, 460], [180, 660], [410, 660], [640, 660]].forEach(([cx, cy], i) => {
    roundTable(cx, cy, 10, { label: 'T' + (i + 1) });
  });
} else if (layout === 'uShape') {
  longTable(140, 140, 540, 52, 12, 0, { accent: sage, label: 'Top' });
  longTable(140, 200, 52, 420, 0, 10, { accent: sage, label: '' });
  longTable(628, 200, 52, 420, 0, 10, { accent: sage, label: '' });
  const t = el('text', {
    x: 410, y: 420, 'text-anchor': 'middle',
    'font-family': 'Inter Tight, sans-serif', 'font-size': '18',
    'font-weight': '600', fill: slate
  });
  t.textContent = 'Open floor / dance';
  host.appendChild(t);
  roundTable(300, 720, 8, { r: 36, label: 'Kids' });
  roundTable(520, 720, 8, { r: 36, label: 'Extra' });
} else if (layout === 'hundredGuests') {
  longTable(260, 80, 300, 48, 8, 0, { accent: sage, label: 'Head' });
  const spots = [
    [160, 240], [410, 240], [660, 240],
    [160, 430], [410, 430], [660, 430],
    [160, 620], [410, 620], [660, 620],
    [285, 750], [535, 750],
  ];
  spots.forEach(([cx, cy], i) => roundTable(cx, cy, 10, { r: 40, fillRatio: 0.8, label: String(i + 1) }));
} else if (layout === 'etiquetteZones') {
  zone(50, 50, 720, 200, 'VIP / family', sage);
  zone(50, 280, 340, 280, 'Friends', '#3D4F5F');
  zone(430, 280, 340, 280, 'Coworkers', '#6B5B4E');
  zone(50, 590, 720, 180, 'Plus-ones & open seats', slate);
  longTable(260, 80, 300, 44, 8, 0, { accent: sage, label: 'Couple' });
  roundTable(180, 180, 8, { accent: sage, r: 34 });
  roundTable(410, 180, 8, { accent: sage, r: 34 });
  roundTable(640, 180, 8, { accent: sage, r: 34 });
  roundTable(160, 400, 10, { r: 40 });
  roundTable(320, 400, 10, { r: 40 });
  roundTable(540, 400, 10, { r: 40 });
  roundTable(700, 400, 10, { r: 40 });
  roundTable(220, 680, 10, { r: 38 });
  roundTable(410, 680, 10, { r: 38 });
  roundTable(600, 680, 10, { r: 38 });
} else {
  roundTable(410, 410, 10, { label: '1' });
}
`;
}

function csvEscape(value) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function writeCsv(rows) {
  const header = ['Title', 'Description', 'Destination Link', 'Media File Path'];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.title, r.description, r.destination, r.mediaPath].map(csvEscape).join(','),
    ),
  ];
  writeFileSync(CSV_PATH, lines.join('\n') + '\n', 'utf8');
}

mkdirSync(OUT_DIR, { recursive: true });

/** Prefer the container Chromium; fall back to Playwright's installed browser. */
function resolveChromium() {
  const candidates = [
    process.env.CHROMIUM,
    '/opt/pw-browsers/chromium',
  ].filter(Boolean);
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return undefined;
}

const executablePath = resolveChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const csvRows = [];

for (const pin of PINS) {
  const fileName = `${pin.slug}.png`;
  const outPath = join(OUT_DIR, fileName);
  // Fresh page per pin so layout scripts cannot collide across renders.
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(buildHtml(pin), { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: outPath, type: 'png' });
  await page.close();
  const mediaPath = relative(ROOT, outPath).replaceAll('\\', '/');
  csvRows.push({
    title: pin.title,
    description: pin.description,
    destination: DEST,
    mediaPath,
  });
  console.log(`wrote ${mediaPath}`);
}

await browser.close();
writeCsv(csvRows);
console.log(`wrote ${relative(ROOT, CSV_PATH).replaceAll('\\', '/')} (${csvRows.length} rows)`);
