// Bundle budget check for T20: JS + CSS shipped to the browser, gzipped.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = 500 * 1024;
const dir = 'dist/assets';

let total = 0;
const rows = [];
for (const name of readdirSync(dir)) {
  if (!/\.(js|css)$/.test(name)) continue;
  const path = join(dir, name);
  const gz = gzipSync(readFileSync(path)).length;
  total += gz;
  rows.push([name, statSync(path).size, gz]);
}

rows.sort((a, b) => b[2] - a[2]);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
for (const [name, raw, gz] of rows) {
  console.log(`  ${name.padEnd(34)} ${kb(raw).padStart(10)}  gzip ${kb(gz).padStart(9)}`);
}
console.log(`\n  total gzipped: ${kb(total)} / budget ${kb(BUDGET)}`);
if (total > BUDGET) {
  console.error('  OVER BUDGET');
  process.exit(1);
}
