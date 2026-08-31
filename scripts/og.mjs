/**
 * Compose the Open Graph card. Rendered from the same tokens and fonts as the
 * product, so a shared link looks like the thing it links to.
 *
 *   node scripts/og.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const fontFile = (name) =>
  `data:font/woff2;base64,${readFileSync(`public/fonts/${name}`).toString('base64')}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Fraunces'; src: url('${fontFile('fraunces-latin-full-normal.woff2')}') format('woff2-variations'); font-weight: 100 900; }
@font-face { font-family: 'Inter Tight'; src: url('${fontFile('inter-tight-latin-wght-normal.woff2')}') format('woff2-variations'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #FBF9F5; font-family: 'Inter Tight', sans-serif; color: #16202B; display: flex; }
.left { padding: 72px 0 72px 72px; width: 620px; display: flex; flex-direction: column; }
.mark { font-family: 'Fraunces', serif; font-weight: 600; font-size: 26px; letter-spacing: .01em; }
h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 62px; line-height: 1.06; letter-spacing: -0.015em; margin-top: auto; }
p { font-size: 25px; color: #576775; margin-top: 22px; max-width: 20ch; }
.pill { margin-top: auto; align-self: flex-start; background: #4E6B57; color: #FBF9F5; font-size: 20px; padding: 12px 22px; border-radius: 4px; }
.right { flex: 1; position: relative; border-left: 1px solid rgba(22,32,43,.12); overflow: hidden; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; }
</style></head><body>
<div class="left">
  <div class="mark">TIKTAK</div>
  <h1>Seat 200 guests without a spreadsheet.</h1>
  <p>Drag guests onto tables. Print the chart.</p>
  <div class="pill">Free to plan &middot; $19 to print clean</div>
</div>
<div class="right"><svg viewBox="0 0 400 500" id="plan"></svg></div>
<script>
const ns='http://www.w3.org/2000/svg';
const host=document.getElementById('plan');
const el=(n,a)=>{const e=document.createElementNS(ns,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
const g=el('g',{stroke:'#576775','stroke-opacity':'0.15','stroke-width':'1'});
for(let y=0;y<500;y+=40) g.appendChild(el('path',{d:'M0 '+y+'h400'}));
for(let x=0;x<400;x+=40) g.appendChild(el('path',{d:'M'+x+' 0v500'}));
host.appendChild(g);
[[130,120],[280,120],[130,270],[280,270],[130,420],[280,420]].forEach(([cx,cy],i)=>{
  host.appendChild(el('circle',{cx,cy,r:42,fill:'#FBF9F5',stroke:'#16202B','stroke-width':'2'}));
  for(let s=0;s<10;s++){
    const a=(-90+36*s)*Math.PI/180;
    const taken=(s+i*3)%10<7;
    host.appendChild(el('circle',{cx:cx+Math.cos(a)*54,cy:cy+Math.sin(a)*54,r:8,
      fill: taken?'#16202B':'#FBF9F5', stroke:'#576775','stroke-width':'1.5'}));
  }
});
</script>
</body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.screenshot({ path: 'public/og.png' });
await browser.close();
console.log('wrote public/og.png');
