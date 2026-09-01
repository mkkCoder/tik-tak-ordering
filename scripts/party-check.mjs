/**
 * Adding a late RSVP to a family that already exists.
 *
 * The store test proves `addToParty` keeps the party id. This proves a person
 * can reach it: select the guest, press Group…, and the family is there to
 * click. Every previous UI bug in this project — the stuck buy button, the
 * Avery geometry, the Hebrew mojibake — passed its unit tests and failed here.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4173';
// Screenshots go to /tmp, matching the other check scripts: they are evidence
// for the run, not files the repository should carry.
const shots = '/tmp';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

// Seed from the landing page — the planner flushes its autosave over any seed
// written from inside it. Same reasoning as scripts/e2e.mjs.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('tiktak:seen', '1');
  localStorage.setItem(
    'tiktak:project',
    JSON.stringify({
      version: 1,
      event: { name: 'Party Check', date: null, venue: '' },
      guests: ['Ruth Cohen', 'Dov Cohen', 'Noa Levi', 'Amit Cohen'].map((name, i) => ({
        id: `g${i}`,
        name,
        partyId: null,
        tags: [],
        notes: '',
        seat: null,
        locked: false,
      })),
      parties: [],
      tables: [],
      constraints: [],
      canvas: { zoom: 1, panX: 0, panY: 0 },
    }),
  );
});
await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
await page.locator('svg[role="application"]').waitFor();

/** Tick the checkbox on the row carrying this name. */
async function select(name) {
  const row = page.getByRole('listitem').filter({ hasText: name }).first();
  await row.getByRole('checkbox').first().check();
}

async function readProject() {
  const state = await page.evaluate(() => {
    const raw = localStorage.getItem('tiktak:project');
    return raw ? JSON.parse(raw) : null;
  });
  return state?.state ?? state;
}

// Make the family first — creating one must still work.
await select('Ruth Cohen');
await select('Dov Cohen');
await page.getByRole('button', { name: 'Group…' }).click();
await page.getByLabel('Party name').fill('Cohen');
await page.getByRole('button', { name: /^Group 2$/ }).click();
await page.waitForTimeout(700);

const made = await readProject();
check('a new party can still be created', made?.parties?.length === 1, made?.parties?.[0]?.label);

// Now the late RSVP — the case that had no answer before.
await select('Amit Cohen');
await page.getByRole('button', { name: 'Group…' }).click();
await page.getByText('Add to an existing party').waitFor();
await page.screenshot({ path: `${shots}/party-dialog.png` });

check('the dialog names the selection', await page.getByText('Put 1 guest in a party').isVisible());
check(
  'the new-party field is empty, not still holding the last name',
  (await page.getByLabel('Or start a new party').inputValue()) === '',
);

const existing = page.getByRole('button', { name: /Cohen\s*2 guests/ });
check('the existing family is offered, with its size', await existing.isVisible());

await existing.click();
await page.waitForTimeout(700);

const project = await readProject();
const parties = project?.parties ?? [];
const guests = project?.guests ?? [];
const cohen = parties.find((p) => p.label === 'Cohen');
const members = guests.filter((g) => g.partyId === cohen?.id).length;

check('exactly one party exists — the original was not replaced', parties.length === 1, `${parties.length}`);
check('its name survived', cohen?.label === 'Cohen');
check('all three Cohens are in it', members === 3, `${members} members`);
check('Noa Levi was left alone', guests.find((g) => g.name === 'Noa Levi')?.partyId === null);

// Undo puts it back, in one press.
await page.keyboard.press('Control+z');
await page.waitForTimeout(700);
const after = await readProject();
const stillCohen = after?.parties?.[0];
check('one undo keeps the family', after?.parties?.length === 1, stillCohen?.label);
check(
  'and the member count is back to two',
  after?.guests?.filter((g) => g.partyId === stillCohen?.id).length === 2,
);

await page.screenshot({ path: `${shots}/party-after.png` });
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
