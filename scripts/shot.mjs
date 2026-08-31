// Screenshot helper for acceptance checks.
//   node scripts/shot.mjs <url> <out.png> <width> <height>
import { chromium } from 'playwright';

const [, , url, out, w = '1280', h = '800'] = process.argv;

// The container ships its own Chromium build; don't download another.
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const overflow = await page.evaluate(() => ({
  bodyScrollW: document.body.scrollWidth,
  bodyClientW: document.body.clientWidth,
  bodyScrollH: document.body.scrollHeight,
  bodyClientH: document.body.clientHeight,
  docScrollH: document.documentElement.scrollHeight,
  docClientH: document.documentElement.clientHeight,
}));

await page.screenshot({ path: out });
await browser.close();

console.log(JSON.stringify({ overflow, errors }, null, 2));
