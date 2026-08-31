/**
 * Try several ways of preparing the Fraunces TTF and report which one jsPDF can
 * actually map to Unicode. Diagnostic only — not part of the build.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsPDF } from '../node_modules/jspdf/dist/jspdf.node.js';

const SOURCE = 'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-ext-full-normal.woff2';
const UNICODES = 'U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2015,U+2018-201D,U+2026,U+20AC';
const SAMPLE = 'Dana & Yoav — Table 12';

const work = mkdtempSync(join(tmpdir(), 'probe-'));
const py = (code) => execFileSync('python3', ['-c', code]);

function instance(out) {
  py(`
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f = TTFont(${JSON.stringify(SOURCE)})
f.flavor = None
f = instancer.instantiateVariableFont(f, {"wght": 400, "SOFT": 0, "WONK": 0, "opsz": 14}, inplace=True, updateFontNames=False)
f.save(${JSON.stringify(out)})
`);
}

const variants = {
  'no subset': (out) => instance(out),
  'subset default': (out) => {
    const base = join(work, 'base.ttf');
    instance(base);
    execFileSync('python3', ['-m', 'fontTools.subset', base, `--unicodes=${UNICODES}`, `--output-file=${out}`]);
  },
  'subset + glyph-names': (out) => {
    const base = join(work, 'base2.ttf');
    instance(base);
    execFileSync('python3', [
      '-m', 'fontTools.subset', base, `--unicodes=${UNICODES}`,
      '--glyph-names', `--output-file=${out}`,
    ]);
  },
  'subset + drop layout': (out) => {
    const base = join(work, 'base3.ttf');
    instance(base);
    execFileSync('python3', [
      '-m', 'fontTools.subset', base, `--unicodes=${UNICODES}`,
      '--glyph-names', '--drop-tables+=GSUB,GPOS,STAT,gasp,DSIG',
      '--no-hinting', `--output-file=${out}`,
    ]);
  },
  'subset + notdef-outline + recalc cmap4': (out) => {
    const base = join(work, 'base4.ttf');
    instance(base);
    const mid = join(work, 'mid4.ttf');
    execFileSync('python3', [
      '-m', 'fontTools.subset', base, `--unicodes=${UNICODES}`,
      '--glyph-names', '--notdef-outline',
      '--drop-tables+=GSUB,GPOS,STAT,gasp,DSIG', '--no-hinting',
      `--output-file=${mid}`,
    ]);
    // Keep only the Windows BMP format-4 subtable, which is what old parsers expect.
    py(`
from fontTools.ttLib import TTFont
f = TTFont(${JSON.stringify(mid)})
f['cmap'].tables = [t for t in f['cmap'].tables if t.platformID == 3 and t.platEncID == 1 and t.format == 4]
f.save(${JSON.stringify(out)})
`);
  },
};

for (const [name, make] of Object.entries(variants)) {
  const out = join(work, `${name.replace(/\W+/g, '_')}.ttf`);
  try {
    make(out);
    const b64 = readFileSync(out).toString('base64');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.addFileToVFS('Probe.ttf', b64);
    doc.addFont('Probe.ttf', 'Probe', 'normal');
    doc.setFont('Probe', 'normal');
    doc.text(SAMPLE, 20, 20);
    const pdf = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    const m = pdf.match(/(\d+) beginbfchar/);
    const mapped = m ? Number(m[1]) : 0;
    const unique = new Set(SAMPLE.split('')).size;
    console.log(
      `${name.padEnd(38)} ttf ${(readFileSync(out).length / 1024).toFixed(0).padStart(4)} kB  mapped ${String(mapped).padStart(2)}/${unique}`,
    );
  } catch (err) {
    console.log(`${name.padEnd(38)} FAILED: ${String(err).slice(0, 120)}`);
  }
}
