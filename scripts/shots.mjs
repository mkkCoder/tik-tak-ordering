/**
 * Generate the landing-page screenshots from the running app, so the pictures
 * on the marketing page are always the actual product rather than a mockup.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/shots.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.TIKTAK_PREVIEW ?? 'http://localhost:4173';
const OUT = 'public/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function openApp({ blank = false } = {}) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  // Dismiss the first-run banner so it is not in every screenshot. The import
  // shot starts from an empty event so nothing reads as a duplicate.
  const button = blank ? 'Start a blank event' : 'Keep exploring';
  const el = page.getByRole('button', { name: button });
  if (await el.isVisible().catch(() => false)) await el.click();
  await page.waitForTimeout(400);
}

// --- 1. Import ---------------------------------------------------------------
await openApp({ blank: true });
await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.waitForTimeout(200);
await page.getByLabel('Paste your guest list').fill(
  [
    'Name\tParty\tSeats\tSide',
    'Ruth Cohen\tCohen\t4\tbride',
    'Dov Levi\tLevi\t2\tgroom',
    'Miriam Katz\tKatz\t6\tbride',
    'Hannah Friedman\tFriedman\t2\tgroom',
    'Orit Barzilai\tBarzilai\t3\tbride',
    'Rivka Shapiro\tShapiro\t2\tgroom',
    'Dina Weiss\tWeiss\t3\tbride',
    'Esti Mizrahi\tMizrahi\t4\tgroom',
  ].join('\n'),
);
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(500);
await page.locator('[role="dialog"]').screenshot({ path: `${OUT}/import.png` });

// --- 2. Constraints ----------------------------------------------------------
await openApp();
// The demo project ships with a conflict; open the list and frame the plan.
const conflicts = page.getByRole('button', { name: /conflict/ });
if (await conflicts.isVisible().catch(() => false)) await conflicts.click();
await page.waitForTimeout(500);
await page.locator('main').screenshot({ path: `${OUT}/constraints.png` });

await browser.close();
console.log('wrote import.png and constraints.png');
