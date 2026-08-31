/**
 * The Escape bug, reproduced against the built app.
 *
 * lemon.js is unreachable from this sandbox, so the overlay is stubbed: Url.Open
 * does nothing, which is exactly the state the page is in while someone stares
 * at the checkout — and the state it stays in if they close it without paying.
 * The button must be usable again either way.
 */
import { chromium } from 'playwright';

const BASE = process.env.TIKTAK_PREVIEW ?? 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
};
const pass = (msg) => console.log(`ok   ${msg}`);

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('tiktak:seen', '1');
});

// Stand in for lemon.js, and record what the app asks it to open.
await page.addInitScript(() => {
  window.__opened = [];
  window.LemonSqueezy = {
    Setup: (o) => {
      window.__handler = o.eventHandler;
    },
    Url: { Open: (url) => window.__opened.push(url) },
  };
});

await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
await page.locator('svg[role="application"]').waitFor();

await page.getByRole('button', { name: 'Export' }).click();
await page.getByRole('menuitem', { name: /Seating chart/ }).click();
await page.getByRole('button', { name: /See what's in Pro/ }).click();

const buyButton = page.getByRole('button', { name: /Unlock for|Opening/ });
await buyButton.click();

// The overlay is now "open" and nobody has paid. This is the moment the button
// used to freeze.
await page.waitForTimeout(600);
const label = (await buyButton.innerText()).trim();
if (label === 'Opening…') fail('button stuck on "Opening…" with the overlay open');
else pass(`button recovered: "${label}"`);

if (await buyButton.isDisabled()) fail('button still disabled with the overlay open');
else pass('button is clickable again');

const opened = await page.evaluate(() => window.__opened);
if (opened.length !== 1 || !opened[0].includes('embed=1')) {
  fail(`expected one embedded checkout url, got ${JSON.stringify(opened)}`);
} else {
  pass('opened the embedded checkout once');
}

// Pressing it again must work, not wedge.
await buyButton.click();
await page.waitForTimeout(300);
if ((await page.evaluate(() => window.__opened)).length !== 2) fail('second click did nothing');
else pass('a second attempt still opens the checkout');

// And a payment arriving later still activates, dialog untouched in between.
await page.evaluate(() =>
  window.__handler?.({
    event: 'Checkout.Success',
    data: { order: { data: { attributes: { license_key: 'TIKTAK-TEST-KEY-0000' } } } },
  }),
);
// Validation cannot reach the vendor from here, so activation fails and the
// dialog should fall through to the code field — which only happens if the
// event was seen at all.
try {
  await page.getByRole('heading', { name: 'Enter your code' }).waitFor({ timeout: 4000 });
  pass('a late Checkout.Success is still handled');
} catch {
  fail('the success event was ignored');
}

await page.screenshot({ path: '/tmp/co-code.png' });

// --- Back to the export you were in the middle of ----------------------------
// A fresh page, this time with the vendor answering "valid" so a licence can
// actually activate. Paying is an interruption; the export has to still be
// there afterwards, settings and all.
const second = await browser.newPage({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 2,
});
await second.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await second.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('tiktak:seen', '1');
});
await second.addInitScript(() => {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url ?? '');
    if (url.includes('lemonsqueezy.com') || url.includes('gumroad.com')) {
      return Promise.resolve(
        new Response(JSON.stringify({ valid: true, meta: { product_name: 'TIKTAK Pro' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return real(input, init);
  };
});

await second.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
await second.locator('svg[role="application"]').waitFor();

await second.getByRole('button', { name: 'Export' }).click();
await second.getByRole('menuitem', { name: /Seating chart/ }).click();

// Change a setting, so we can tell whether the dialog really came back or was
// merely rebuilt from scratch.
await second.getByLabel('Orientation').selectOption('landscape');

await second.getByRole('button', { name: /See what's in Pro/ }).click();
await second.waitForTimeout(200);
await second.locator('[role="dialog"]').screenshot({ path: '/tmp/co-offer.png' });

if (await second.getByRole('button', { name: 'I already paid' }).count()) {
  fail('the old "I already paid" button is still there');
} else {
  pass('the offer screen has one button');
}

await second.getByRole('button', { name: /Already bought it/ }).click();
await second.getByLabel('Code from your email').fill('3b1f2c8a-9d4e-4a71-b6c2-77e0f1a9d3b4');
await second.getByRole('button', { name: 'Unlock' }).click();

try {
  await second
    .getByRole('heading', { name: 'Export the seating chart' })
    .waitFor({ timeout: 4000 });
  pass('unlocking lands back on the export they wanted');
} catch {
  fail('unlocking did not return to the export dialog');
}

const orientation = await second.getByLabel('Orientation').inputValue();
if (orientation !== 'landscape') fail(`export settings were lost (orientation=${orientation})`);
else pass('their export settings survived the detour');

const exportButton = second.getByRole('button', { name: 'Export PDF' });
if (await exportButton.isDisabled()) fail('the export button came back disabled');
else pass('the export button is ready');

if (!(await second.evaluate(() => document.activeElement?.textContent?.includes('Export PDF')))) {
  fail('the export button is not focused');
} else {
  pass('the export button has focus');
}

await second.locator('[role="dialog"]').screenshot({ path: '/tmp/co-resumed.png' });

await browser.close();
console.log(process.exitCode ? 'checkout check FAILED' : 'checkout check passed');
