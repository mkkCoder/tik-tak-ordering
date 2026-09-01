/**
 * Right-to-left text, in a PDF that has no idea what that means.
 *
 * A PDF draws glyphs in the order it is handed them, left to right, and stops
 * there. There is no bidi algorithm inside the file and jsPDF does not run one,
 * so "משפחת כהן" written in logical order comes out reversed on the page —
 * readable only in a mirror.
 *
 * This is the minimum that fixes real guest lists. It is not the Unicode
 * bidirectional algorithm: no explicit embedding levels, no isolates, no
 * bracket matching. It handles the cases a seating plan actually contains —
 * Hebrew names, Hebrew with a Latin surname, Hebrew with a table number — and
 * leaves anything without RTL characters untouched, which is almost every
 * document TIKTAK produces.
 */

/**
 * Hebrew, Arabic and their presentation forms. Written as escapes rather than
 * literal characters so the source stays readable in an editor that is not
 * bidi-aware — and so the direction marks in it cannot be mistaken for stray
 * whitespace by a linter.
 */
const RTL = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Latin, Greek and Cyrillic — scripts that keep their own order inside an RTL
 * line, so "משפחת Cohen" does not come out with the surname mirrored.
 *
 * Digits are deliberately NOT here. jsPDF runs its own bidi pass over the
 * string as it writes it, and that pass reorders European numbers itself; if
 * this function ordered them too they would be reordered twice and table 25
 * would print as 52. Verified by rendering the PDF, not by reasoning about it.
 */
const LTR = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;

/** Does this string contain anything that reads right to left? */
export function hasRtl(text: string): boolean {
  return RTL.test(text);
}

type Direction = 'rtl' | 'ltr' | 'neutral';

interface Run {
  direction: Direction;
  text: string;
}

function classify(ch: string): Direction {
  if (RTL.test(ch)) return 'rtl';
  if (LTR.test(ch)) return 'ltr';
  return 'neutral';
}

/**
 * Reorder a string from logical order into the order a PDF should draw it.
 *
 * Strings with no RTL character are returned unchanged, so this is free for
 * Latin documents and cannot regress them.
 */
export function visualOrder(text: string): string {
  if (!hasRtl(text)) return text;

  // Split into runs of one direction each, neutrals included as their own.
  const runs: Run[] = [];
  for (const ch of text) {
    const direction = classify(ch);
    const last = runs[runs.length - 1];
    if (last && last.direction === direction) last.text += ch;
    else runs.push({ direction, text: ch });
  }

  // A neutral run only behaves as a separator where the direction actually
  // changes. Between two Hebrew words — "כהן, דוד" — the comma is part of the
  // Hebrew flow and has to reverse with it, or it lands on the wrong side.
  const merged: Run[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i] as Run;
    if (run.direction !== 'neutral') {
      merged.push({ ...run });
      continue;
    }

    const before = runs[i - 1];
    const after = runs[i + 1];

    // Between two directions it stays put and separates them.
    if (before && after && before.direction !== after.direction) {
      merged.push({ ...run });
    } else if (before) {
      (merged[merged.length - 1] as Run).text += run.text;
    } else if (after) {
      runs[i + 1] = { ...after, text: run.text + after.text };
    } else {
      merged.push({ ...run }); // the whole string is punctuation
    }
  }

  // The base direction is RTL, so the first logical run is drawn rightmost.
  // Within an RTL run the characters themselves also reverse; an LTR run — a
  // surname, a table number — keeps its own order inside the reversed sequence.
  return merged
    .reverse()
    .map((run) => (run.direction === 'rtl' ? reverse(run.text) : run.text))
    .join('');
}

function reverse(text: string): string {
  return [...text].reverse().join('');
}
