import { describe, expect, it } from 'vitest';
import { hasRtl, visualOrder } from './bidi';

const rev = (s: string) => [...s].reverse().join('');

describe('hasRtl', () => {
  it('is false for the documents TIKTAK usually produces', () => {
    expect(hasRtl('Dana Levi')).toBe(false);
    expect(hasRtl('Table 7 — 8 seats')).toBe(false);
    expect(hasRtl('Ana Gómez-Ruiz')).toBe(false);
  });

  it('is true for Hebrew and Arabic', () => {
    expect(hasRtl('דנה לוי')).toBe(true);
    expect(hasRtl('محمد')).toBe(true);
  });
});

describe('visualOrder', () => {
  it('leaves Latin alone, character for character', () => {
    const latin = 'Alexandra Rosenbaum-Feldman';
    expect(visualOrder(latin)).toBe(latin);
    expect(visualOrder('Table 12')).toBe('Table 12');
    expect(visualOrder('')).toBe('');
  });

  it('reverses a Hebrew name so it reads correctly on the page', () => {
    expect(visualOrder('דנה לוי')).toBe(rev('דנה לוי'));
  });

  it('keeps a Latin surname readable inside a Hebrew name', () => {
    // Logical: [משפחת][ ][Cohen]. The first logical run sits rightmost, so the
    // page reads "Cohen" then the Hebrew, and "Cohen" is not mirrored.
    expect(visualOrder('משפחת Cohen')).toBe(`Cohen ${rev('משפחת')}`);
  });

  it('leaves digits to the renderer, which orders them itself', () => {
    // Digits are neutral here on purpose: jsPDF reorders European numbers in
    // its own bidi pass, and doing it twice printed table 25 as 52. The proof
    // is the rendered PDF; this only pins the intent so it is not "fixed" back.
    expect(visualOrder('שולחן 25')).toBe(rev('שולחן 25'));
  });

  it('handles a comma-separated Hebrew name as one run', () => {
    expect(visualOrder('כהן, דוד')).toBe(rev('כהן, דוד'));
  });

  it('puts a leading Latin word to the right of the Hebrew that follows it', () => {
    expect(visualOrder('Cohen משפחת')).toBe(`${rev('משפחת')} Cohen`);
  });

  it('never loses or invents characters', () => {
    for (const text of [
      'דנה לוי',
      'משפחת Cohen',
      'שולחן 25',
      'כהן, דוד',
      'Cohen משפחת',
      'א',
      'שולחן 7 — משפחה',
    ]) {
      expect([...visualOrder(text)].sort().join('')).toBe([...text].sort().join(''));
    }
  });

  it('is stable: reordering twice returns to the logical order', () => {
    const name = 'דנה לוי';
    expect(visualOrder(visualOrder(name))).toBe(name);
  });
});
