import type { jsPDF } from 'jspdf';
import { hasRtl, visualOrder } from './bidi';

/**
 * Which embedded font can draw a given string, and getting RTL text out in the
 * order a PDF will render it.
 *
 * Two things used to go wrong here, both silently. jsPDF stops encoding a
 * string at the first character the font lacks, so a name outside the Fraunces
 * subset came out truncated. And its built-in fallback fonts are WinAnsi, which
 * cannot represent Hebrew at all — "אלכסנדרה" printed as `ÐÜÛáàÓèÔ` on every
 * card and every chart, with nothing in the console to say so.
 *
 * So: Fraunces where it can, a Hebrew serif where it cannot, and Times only for
 * scripts neither covers — at which point the name is wrong either way, but at
 * least the rest of the document is not.
 */

export type Weight = 'normal' | 'bold';

/**
 * Sets the font for `text` and returns it in drawing order. Always draw the
 * string this returns, never the one you passed in.
 */
export type SelectFont = (text: string, weight: Weight) => string;

/**
 * Register the fonts this document needs and return the selector.
 *
 * `sample` should contain every string the document will draw — the Hebrew font
 * is 44 kB per weight and is only fetched and embedded when something in the
 * document actually needs it, so a Latin guest list pays nothing for it.
 */
export async function installFonts(doc: jsPDF, sample: string): Promise<SelectFont> {
  const { FRAUNCES_REGULAR, FRAUNCES_BOLD, fraunceCanRender } = await import('./fraunces');
  doc.addFileToVFS('Fraunces-Regular.ttf', FRAUNCES_REGULAR);
  doc.addFont('Fraunces-Regular.ttf', 'Fraunces', 'normal');
  doc.addFileToVFS('Fraunces-Bold.ttf', FRAUNCES_BOLD);
  doc.addFont('Fraunces-Bold.ttf', 'Fraunces', 'bold');

  let hebrewCanRender: ((text: string) => boolean) | null = null;
  if (hasRtl(sample)) {
    const hebrew = await import('./hebrew');
    doc.addFileToVFS('Hebrew-Regular.ttf', hebrew.HEBREW_REGULAR);
    doc.addFont('Hebrew-Regular.ttf', 'HebrewSerif', 'normal');
    doc.addFileToVFS('Hebrew-Bold.ttf', hebrew.HEBREW_BOLD);
    doc.addFont('Hebrew-Bold.ttf', 'HebrewSerif', 'bold');
    hebrewCanRender = hebrew.hebrewCanRender;
  }

  installRtlDrawing(doc, hebrewCanRender);

  return (text: string, weight: Weight): string => {
    if (fraunceCanRender(text)) doc.setFont('Fraunces', weight);
    else if (hebrewCanRender?.(text)) doc.setFont('HebrewSerif', weight);
    else doc.setFont('times', weight);
    return visualOrder(text);
  };
}

/**
 * Make one document draw right-to-left text correctly, everywhere.
 *
 * Two dozen `doc.text` calls draw a chart, and only some of them pick a font
 * first — the guest index, for instance, inherits whatever was set last. A
 * Hebrew name reaching a Latin font does not throw or warn; it prints as
 * `ÓÔÓ ,ßÔÛ` on 150 cards. And a name in the right font still prints backwards
 * unless it is reordered.
 *
 * Both belong at the point of drawing rather than at every call site, where the
 * next one somebody adds would quietly miss them. Strings with no RTL character
 * take an early return, so this costs a regex test per draw for everyone else.
 */
function installRtlDrawing(doc: jsPDF, hebrewCanRender: ((text: string) => boolean) | null): void {
  const original = doc.text.bind(doc);

  doc.text = function patched(this: jsPDF, text: unknown, ...rest: unknown[]) {
    const lines = typeof text === 'string' ? [text] : Array.isArray(text) ? text : null;
    const needsRtl = lines?.some((line) => typeof line === 'string' && hasRtl(line)) ?? false;

    if (!needsRtl) return (original as (...args: unknown[]) => jsPDF)(text, ...rest);

    const reorder = (line: unknown) => (typeof line === 'string' ? visualOrder(line) : line);
    const reordered =
      typeof text === 'string' ? visualOrder(text) : (lines as unknown[]).map(reorder);

    // Whatever font is current cannot draw Hebrew unless it is the Hebrew one.
    const before = doc.getFont();
    const drawable = lines?.every((line) => typeof line !== 'string' || hebrewCanRender?.(line));
    if (drawable && before.fontName !== 'HebrewSerif') {
      doc.setFont('HebrewSerif', before.fontStyle === 'bold' ? 'bold' : 'normal');
    }

    const result = (original as (...args: unknown[]) => jsPDF)(reordered, ...rest);
    if (drawable && before.fontName !== 'HebrewSerif')
      doc.setFont(before.fontName, before.fontStyle);
    return result;
  } as typeof doc.text;
}
