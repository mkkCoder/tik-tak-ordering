/** Screenshot the upgrade path so the copy can be judged as a person sees it. */
import { chromium } from 'playwright';

const BASE = process.env.TIKTAK_PREVIEW ?? 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('tiktak:seen', '1');
});
await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
await page.locator('svg[role="application"]').waitFor();

await page.getByRole('button', { name: 'Export' }).click();
await page.waitForTimeout(200);
await page.locator('[role="menu"]').screenshot({ path: '/tmp/up-menu.png' });

await page.getByRole('menuitem', { name: /Seating chart/ }).click();
await page.waitForTimeout(200);
await page.locator('[role="dialog"]').screenshot({ path: '/tmp/up-export.png' });

await page.getByRole('button', { name: /See what's in Pro/ }).click();
await page.waitForTimeout(200);
await page.locator('[role="dialog"]').screenshot({ path: '/tmp/up-offer.png' });

await page.getByRole('button', { name: 'I already paid' }).click();
await page.waitForTimeout(200);
await page.locator('[role="dialog"]').screenshot({ path: '/tmp/up-code.png' });

await browser.close();
console.log('wrote /tmp/up-{menu,export,offer,code}.png');
