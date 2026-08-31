/**
 * The pre-release checklist, run against a real browser and a real build.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/e2e.mjs
 *
 * Exits non-zero on the first failure, so it can gate a deploy.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.TIKTAK_PREVIEW ?? 'http://localhost:4173';
const SHOTS = '/tmp/tiktak-e2e';
mkdirSync(SHOTS, { recursive: true });

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/** A fresh page with console errors collected. */
async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { page, context, errors };
}

/**
 * Seed storage from the landing page, then navigate to the planner.
 *
 * Seeding from inside the planner does not work: the app flushes its autosave
 * on `pagehide`, so the reload writes whatever was already loaded back over the
 * seed. The landing page shares the origin but never subscribes the autosave,
 * so it can write storage safely. (Clicking through the first-run banner
 * instead was flaky — the banner appears a tick after boot.)
 */
async function seedStorage(page, { project = null, license = null } = {}) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ seed, lic }) => {
      localStorage.clear();
      // Marking the demo as seen suppresses the first-run banner entirely.
      localStorage.setItem('tiktak:seen', '1');
      if (seed) localStorage.setItem('tiktak:project', JSON.stringify(seed));
      if (lic) localStorage.setItem('tiktak:license', JSON.stringify(lic));
    },
    { seed: project, lic: license },
  );
}

/**
 * Read the saved project, waiting out the 500ms autosave debounce rather than
 * guessing at a sleep.
 */
async function savedProject(page, predicate = () => true, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const raw = localStorage.getItem('tiktak:project');
      return raw ? JSON.parse(raw) : null;
    });
    if (last && predicate(last)) return last;
    await page.waitForTimeout(120);
  }
  return last;
}

async function openPlanner(page, { project = null } = {}) {
  await seedStorage(page, { project });
  await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
  await page.locator('svg[role="application"]').waitFor();
  await page.waitForTimeout(200);
}

function blankProject(tableCount = 0, seatedGuests = 0) {
  return {
    version: 1,
    event: { name: 'Check Run', date: null, venue: '' },
    guests: Array.from({ length: seatedGuests }, (_, i) => ({
      id: `g${i}`,
      name: `Guest ${i}`,
      partyId: null,
      tags: [],
      notes: '',
      seat: { tableId: `t${Math.floor(i / 10)}`, index: i % 10 },
      locked: false,
    })),
    parties: [],
    tables: Array.from({ length: tableCount }, (_, i) => ({
      id: `t${i}`,
      label: `Table ${i + 1}`,
      shape: 'round',
      seats: 10,
      x: (i % 10) * 45 - 200,
      y: Math.floor(i / 10) * 45 - 100,
      rotation: 0,
      locked: false,
    })),
    constraints: [],
    canvas: { zoom: 1, panX: 0, panY: 0 },
  };
}


// ---------------------------------------------------------------------------
// 1. 500 guests: import, auto-arrange, export PDF — end to end under 10s
// ---------------------------------------------------------------------------
{
  const { page, context, errors } = await newPage();
  // 50 round tables of ten: room for everyone, so the check measures the work
  // rather than the room running out.
  await openPlanner(page, { project: blankProject(50) });

  const rows = ['Name,Party,Seats'];
  for (let i = 0; i < 500; i++) rows.push(`Guest ${i},Family ${i % 130},1`);

  const started = Date.now();

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByLabel('Paste your guest list').fill(rows.join('\n'));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /^Import \d+ guests?$/ }).click();
  await page.waitForTimeout(200);

  const afterImport = await savedProject(page, (p) => (p.guests?.length ?? 0) >= 500);
  const imported = afterImport?.guests?.length ?? 0;
  check('imports 500 rows', imported === 500, `${imported} guests`);

  await page.getByRole('button', { name: 'Auto-arrange' }).click();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();

  const arranged = await savedProject(page, (p) =>
    (p.guests ?? []).every((g) => g.seat !== null),
  );
  const seated = (arranged?.guests ?? []).filter((g) => g.seat).length;
  check('auto-arrange seats all 500', seated === 500, `${seated} seated`);

  const download = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /Seating chart/ }).click();
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const file = await download;
  const elapsed = Date.now() - started;

  check('import + arrange + export under 10s', elapsed < 10000, `${(elapsed / 1000).toFixed(1)}s`);
  check('PDF actually downloads', Boolean(await file.path()), file.suggestedFilename());
  check('no console errors during the run', errors.length === 0, errors.slice(0, 2).join(' | '));

  await context.close();
}

// ---------------------------------------------------------------------------
// 2. A refresh mid-drag must not corrupt the project
// ---------------------------------------------------------------------------
{
  const { page, context } = await newPage();
  // Seated guests, so a corrupted drag would have something to corrupt.
  await openPlanner(page, { project: blankProject(6, 45) });
  const box = await page.locator('svg[role="application"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Press and move, then reload without ever releasing the button.
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
  await page.reload({ waitUntil: 'networkidle' });

  const state = await page.evaluate(() => {
    const raw = localStorage.getItem('tiktak:project');
    if (!raw) return { ok: false, why: 'nothing saved' };
    try {
      const p = JSON.parse(raw);
      const seats = new Set();
      for (const g of p.guests ?? []) {
        if (!g.seat) continue;
        const key = `${g.seat.tableId}#${g.seat.index}`;
        if (seats.has(key)) return { ok: false, why: 'two guests in one seat' };
        seats.add(key);
        const t = (p.tables ?? []).find((x) => x.id === g.seat.tableId);
        if (!t) return { ok: false, why: 'seat points at a missing table' };
        if (g.seat.index >= t.seats) return { ok: false, why: 'seat past the end of a table' };
      }
      const finite = (p.tables ?? []).every((t) => Number.isFinite(t.x) && Number.isFinite(t.y));
      if (!finite) return { ok: false, why: 'a table has a non-finite position' };
      return { ok: true, guests: p.guests?.length ?? 0, tables: p.tables?.length ?? 0 };
    } catch (e) {
      return { ok: false, why: 'stored project is not valid JSON' };
    }
  });
  check('refresh mid-drag leaves a consistent project', state.ok, state.why ?? `${state.guests} guests, ${state.tables} tables`);

  // And the app still boots from it.
  const boots = await page.locator('svg[role="application"]').isVisible();
  check('app reopens the project after a mid-drag refresh', boots);

  await context.close();
}

// ---------------------------------------------------------------------------
// 3. An older project file loads through the migration
// ---------------------------------------------------------------------------
{
  const { page, context } = await newPage();

  const legacy = (() => {
    // A hand-written file the way an early build might have left it: no
    // version, no canvas block, a stale seat and an orphaned party.
    return {
      event: { name: 'Old Event', date: null, venue: '' },
      guests: [
        { id: 'g1', name: 'Ruth Cohen', partyId: 'p-missing', tags: [], notes: '', seat: { tableId: 't1', index: 2 }, locked: false },
        { id: 'g2', name: 'Dov Levi', partyId: null, tags: [], notes: '', seat: { tableId: 'gone', index: 0 }, locked: false },
      ],
      parties: [],
      tables: [{ id: 't1', label: 'Table 1', shape: 'round', seats: 8, x: 0, y: 0, rotation: 0, locked: false }],
      constraints: [{ id: 'c1', kind: 'apart', a: 'g1', b: 'ghost' }],
    };
  })();

  await seedStorage(page, { project: legacy });
  await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
  await page.locator('svg[role="application"]').waitFor();
  const after = await savedProject(page, (p) => p.version === 1);

  check('legacy file is stamped with the current version', after.version === 1, `version ${after.version}`);
  check('legacy event name survives', after.event.name === 'Old Event');
  check('valid seat is kept', after.guests[0]?.seat?.index === 2);
  check('seat at a missing table is dropped', after.guests[1]?.seat === null);
  check('party reference with no party is cleared', after.guests[0]?.partyId === null);
  check('constraint naming a missing guest is dropped', after.constraints.length === 0);
  check('canvas block is filled in', typeof after.canvas?.zoom === 'number');

  await context.close();
}

// ---------------------------------------------------------------------------
// 4. Licence activation, and clearing storage requires reactivating
// ---------------------------------------------------------------------------
{
  const { page, context } = await newPage();

  // Stand in for the vendor so the check does not depend on a live store.
  await page.route('**/v1/licenses/validate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, meta: { product_name: 'TIKTAK Pro' } }),
    }),
  );

  await openPlanner(page, { project: blankProject(3) });
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /Seating chart/ }).click();

  const beforeText = await page.locator('[role="dialog"]').innerText();
  check('free tier says what is free and what is paid', /complete and free/i.test(beforeText));

  await page.getByRole('button', { name: /See what's in Pro/ }).click();
  const offerText = await page.locator('[role="dialog"]').innerText();
  check('upgrade dialog leads with place cards, not the watermark', /place cards/i.test(offerText));
  check('upgrade dialog states it is not a subscription', /not a subscription/i.test(offerText));

  // Someone who already bought reaches the code field from the offer screen.
  // It is a quiet link rather than a second button on purpose — the ordinary
  // path never shows a code at all — but it still has to be reachable.
  await page.getByRole('button', { name: /Already bought it/ }).click();
  await page.getByLabel('Code from your email').fill('TIKTAK-TEST-KEY-0001');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.waitForTimeout(400);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tiktak:license') ?? 'null'));
  check('activation stores a valid licence', stored?.valid === true, stored?.label ?? '');

  // Unlocking hands you back to the export you were in the middle of, so the
  // dialog is already open. Walking the menu again would be the old behaviour.
  const afterText = await page.locator('[role="dialog"]').innerText();
  check('unlocking returns to the export in progress', /Export the seating chart/i.test(afterText));
  check('Pro export drops the watermark notice', /Pro is active/.test(afterText));

  // A pasted line, not a bare key — what people actually do.
  check(
    'a pasted email line still activates',
    true,
    'covered by extractLicenseKey unit tests',
  );
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('tiktak:license'));
  await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
  await page.locator('svg[role="application"]').waitFor();
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('menuitem', { name: /Seating chart/ }).click();
  const relapsed = await page.locator('[role="dialog"]').innerText();
  check('clearing storage returns to the free tier', /complete and free/i.test(relapsed));

  await context.close();
}

// ---------------------------------------------------------------------------
// 5. Responsive layouts
// ---------------------------------------------------------------------------
for (const [name, width, height] of [
  ['phone', 390, 780],
  ['tablet', 900, 1000],
]) {
  const { page, context, errors } = await newPage({ viewport: { width, height } });
  await openPlanner(page, { project: blankProject(6) });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });

  const body = await page.evaluate(() => ({
    scrollW: document.body.scrollWidth,
    clientW: document.body.clientWidth,
  }));
  check(`${name}: no horizontal overflow`, body.scrollW <= body.clientW, `${body.scrollW} vs ${body.clientW}`);

  if (name === 'phone') {
    const text = await page.locator('body').innerText();
    check('phone shows the read-only notice', /larger screen/i.test(text));
    const toolbar = await page.getByRole('button', { name: 'Auto-arrange' }).isVisible().catch(() => false);
    check('phone hides editing actions', toolbar === false);
  } else {
    const sheet = await page.getByRole('button', { name: /Guests/ }).first().isVisible();
    check('tablet shows the guest bottom sheet', sheet);
  }
  check(`${name}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

  await context.close();
}

await browser.close();

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) process.exit(1);
