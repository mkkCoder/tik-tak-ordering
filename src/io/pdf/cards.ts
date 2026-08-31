import type { jsPDF } from 'jspdf';
import type { Project } from '@/model/types';
import { surnameOf } from './index';

/**
 * Place cards and escort cards.
 *
 * A place card sits on the table and only has to say who this seat belongs to.
 * An escort card sits at the entrance and has to say where to go — so it always
 * carries the table, sorted by surname, because that is how someone looks for
 * their own name in a rack of two hundred.
 *
 * Both are printed onto a sheet of blanks, so the geometry has to match the
 * real card stock to the millimetre or every card comes out crooked.
 */

export type CardKind = 'place' | 'escort';

export interface SheetSpec {
  id: string;
  label: string;
  /** Page size in mm. */
  page: { width: number; height: number };
  /** One card's printable area in mm. For a tent card this is the folded face. */
  card: { width: number; height: number };
  columns: number;
  rows: number;
  margin: { top: number; left: number };
  /** Space between cards. */
  gap: { x: number; y: number };
  /**
   * Tent cards print two faces per slot: the lower half is read by the guest,
   * the upper half is mirrored so it reads correctly from the other side once
   * the card is folded along the middle.
   */
  fold: boolean;
}

const IN = 25.4;

/**
 * Avery 5302 small tent cards: 3.5in × 2in folded, FOUR per Letter sheet in a
 * 2 × 2 grid, each slot 4in tall before folding along its middle.
 *
 * This used to say one column, two per sheet, and it was wrong. Avery's own
 * spec is 160 cards across 40 sheets — four to a sheet — and the arithmetic
 * agrees: two 3.5in columns leave 0.75in either side of a Letter page, two 4in
 * rows leave 1.5in top and bottom, both centred, which is how Avery lays stock
 * out. Printing one centred column put every card across the perforation
 * between the two real columns, and threw away half the packet.
 */
export const AVERY_5302: SheetSpec = {
  id: 'avery5302',
  label: 'Avery 5302 tent cards (3.5 × 2 in, 4 per sheet)',
  page: { width: 8.5 * IN, height: 11 * IN },
  card: { width: 3.5 * IN, height: 2 * IN },
  columns: 2,
  rows: 2,
  margin: { top: 1.5 * IN, left: 0.75 * IN },
  gap: { x: 0, y: 0 },
  fold: true,
};

/** Flat cards, four to an A4 sheet — the fallback when there is no label stock. */
export const A4_FLAT: SheetSpec = {
  id: 'a4flat',
  label: 'Plain A4, 4 cards per sheet (90 × 55 mm)',
  page: { width: 210, height: 297 },
  card: { width: 90, height: 55 },
  columns: 2,
  rows: 4,
  margin: { top: 25, left: 12 },
  gap: { x: 6, y: 8 },
  fold: false,
};

export const SHEET_PRESETS: SheetSpec[] = [AVERY_5302, A4_FLAT];

export interface CustomSheet {
  cardWidth: number;
  cardHeight: number;
  columns: number;
  rows: number;
  fold: boolean;
  page: 'a4' | 'letter';
}

export function customSheet(custom: CustomSheet): SheetSpec {
  const page =
    custom.page === 'a4'
      ? { width: 210, height: 297 }
      : { width: 8.5 * IN, height: 11 * IN };
  const slotHeight = custom.cardHeight * (custom.fold ? 2 : 1);
  const usedW = custom.cardWidth * custom.columns;
  const usedH = slotHeight * custom.rows;
  return {
    id: 'custom',
    label: 'Custom size',
    page,
    card: { width: custom.cardWidth, height: custom.cardHeight },
    columns: custom.columns,
    rows: custom.rows,
    margin: {
      left: Math.max(4, (page.width - usedW) / 2),
      top: Math.max(4, (page.height - usedH) / 2),
    },
    gap: { x: 0, y: 0 },
    fold: custom.fold,
  };
}

export interface CardEntry {
  name: string;
  table: string;
  seat: number;
}

export function buildCards(project: Project, kind: CardKind): CardEntry[] {
  const tableById = new Map(project.tables.map((t) => [t.id, t]));
  const entries: CardEntry[] = [];
  for (const g of project.guests) {
    if (!g.seat) continue;
    const table = tableById.get(g.seat.tableId);
    if (!table) continue;
    entries.push({ name: g.name, table: table.label, seat: g.seat.index + 1 });
  }

  if (kind === 'escort') {
    // Alphabetical, because these are searched by name at the door.
    return entries.sort((a, b) =>
      `${surnameOf(a.name)} ${a.name}`.localeCompare(`${surnameOf(b.name)} ${b.name}`),
    );
  }
  // Place cards are laid out table by table, so they can be carried to the table.
  const order = new Map(project.tables.map((t, i) => [t.label, i]));
  return entries.sort(
    (a, b) => (order.get(a.table) ?? 0) - (order.get(b.table) ?? 0) || a.seat - b.seat,
  );
}

interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
}

function slotsFor(sheet: SheetSpec): Slot[] {
  const slotHeight = sheet.card.height * (sheet.fold ? 2 : 1);
  const slots: Slot[] = [];
  for (let row = 0; row < sheet.rows; row++) {
    for (let col = 0; col < sheet.columns; col++) {
      slots.push({
        x: sheet.margin.left + col * (sheet.card.width + sheet.gap.x),
        y: sheet.margin.top + row * (slotHeight + sheet.gap.y),
        width: sheet.card.width,
        height: slotHeight,
      });
    }
  }
  return slots;
}

const INK = [22, 32, 43] as const;
const SLATE = [87, 103, 117] as const;
const CUT = [176, 172, 162] as const;

function drawCutLines(doc: jsPDF, slot: Slot, fold: boolean): void {
  doc.setDrawColor(...CUT);
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(slot.x, slot.y, slot.width, slot.height, 'S');
  if (fold) {
    // The fold line is the middle; drawn finer so it is not mistaken for a cut.
    doc.setLineDashPattern([0.6, 1.6], 0);
    doc.line(slot.x, slot.y + slot.height / 2, slot.x + slot.width, slot.y + slot.height / 2);
  }
  doc.setLineDashPattern([], 0);
}

/** Points to millimetres, for turning a font size into a line spacing. */
const PT_TO_MM = 25.4 / 72;

/** How much of the card's width the text may occupy. */
const TEXT_WIDTH_RATIO = 0.86;

/** The smallest a name is allowed to shrink before it wraps instead. */
const MIN_NAME_SIZE = 9;

export interface FittedText {
  lines: string[];
  size: number;
}

/**
 * Make a name fit on a card.
 *
 * The old code set the font size from the card's *height* and never looked at
 * its width, so "Alexandra Rosenbaum-Feldman" ran off the edge of an Avery
 * card and through the cut line. A card with a name printed halfway off it is
 * not a card anyone puts on a table.
 *
 * Three steps, in order of what looks best: shrink until one line fits; failing
 * that, break at the most even space and shrink both halves; failing even that
 * — a single unbroken word longer than the card — scale to the exact width. The
 * last step is what makes this a guarantee rather than a heuristic, since text
 * width in jsPDF is linear in font size.
 */
export function fitText(
  measure: (text: string, size: number) => number,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  maxLines: 1 | 2 = 2,
): FittedText {
  for (let size = startSize; size >= minSize; size -= 0.5) {
    if (measure(text, size) <= maxWidth) return { lines: [text], size };
  }

  const split = maxLines === 2 ? splitInTwo(text) : null;
  if (split) {
    for (let size = startSize; size >= minSize; size -= 0.5) {
      if (split.every((line) => measure(line, size) <= maxWidth)) return { lines: split, size };
    }
  }

  // Shrinking has run out. Scale to the exact width instead — and if even the
  // absolute floor is too wide, which takes a single word longer than the card,
  // trim it with an ellipsis. A name that visibly did not fit is bad; a name
  // running off the edge of the card and through the cut line is worse.
  const lines = split ?? [text];
  const widest = Math.max(...lines.map((line) => measure(line, minSize)));
  const size = scaleToFit(minSize, widest, maxWidth);
  return { lines: lines.map((line) => truncateToFit(measure, line, maxWidth, size)), size };
}

/** Below this nothing is readable, so there is no sense scaling past it. */
const ABSOLUTE_MIN_SIZE = 5;

function scaleToFit(size: number, measured: number, maxWidth: number): number {
  if (measured <= maxWidth || measured <= 0) return size;
  return Math.max(ABSOLUTE_MIN_SIZE, (size * maxWidth) / measured);
}

function truncateToFit(
  measure: (text: string, size: number) => number,
  text: string,
  maxWidth: number,
  size: number,
): string {
  if (measure(text, size) <= maxWidth) return text;
  let fits = 0;
  let tooMuch = text.length;
  while (fits < tooMuch) {
    const mid = Math.ceil((fits + tooMuch) / 2);
    if (measure(`${text.slice(0, mid)}…`, size) <= maxWidth) fits = mid;
    else tooMuch = mid - 1;
  }
  return fits > 0 ? `${text.slice(0, fits)}…` : '…';
}

/** Break at whichever space leaves the two halves closest in length. */
function splitInTwo(text: string): [string, string] | null {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return null;

  let best: [string, string] | null = null;
  let bestDifference = Infinity;
  for (let i = 1; i < words.length; i++) {
    const head = words.slice(0, i).join(' ');
    const tail = words.slice(i).join(' ');
    const difference = Math.abs(head.length - tail.length);
    if (difference < bestDifference) {
      bestDifference = difference;
      best = [head, tail];
    }
  }
  return best;
}

/**
 * One face of a card. `flip` draws it rotated 180° about the face's own centre,
 * which is what makes the top half of a tent card readable once folded.
 */
function drawFace(
  doc: jsPDF,
  face: Slot,
  entry: CardEntry,
  kind: CardKind,
  serif: (text: string, weight: 'normal' | 'bold') => void,
  flip: boolean,
): void {
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  const maxWidth = face.width * TEXT_WIDTH_RATIO;

  // Measuring has to use the same font the text will be drawn in — `serif`
  // falls back to a different face for scripts Fraunces cannot render, and a
  // Hebrew name measured in the wrong font is measured wrong.
  const measure = (text: string, size: number, weight: 'normal' | 'bold' = 'normal') => {
    serif(text, weight);
    doc.setFontSize(size);
    return doc.getTextWidth(text);
  };

  const startSize = Math.min(20, Math.max(11, face.height * 0.32));
  const name = fitText(measure, entry.name, maxWidth, startSize, MIN_NAME_SIZE);
  const nameSize = name.size;
  const metaSize = Math.max(7, Math.min(20, Math.max(11, face.height * 0.32)) * 0.5);

  // A wrapped name is centred as a block, so the card stays balanced, and the
  // table line keeps its distance from the *last* line rather than the first.
  const lineGap = nameSize * PT_TO_MM * 1.12;
  const nameY = cy - (kind === 'place' ? nameSize * 0.05 : nameSize * 0.15);
  const firstNameY = nameY - ((name.lines.length - 1) * lineGap) / 2;
  const lastNameY = firstNameY + (name.lines.length - 1) * lineGap;
  const metaY = lastNameY + metaSize * 1.9;

  const place = (text: string, y: number, size: number, bold: boolean, muted: boolean) => {
    serif(text, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const [r, g, b] = muted ? SLATE : INK;
    doc.setTextColor(r, g, b);
    if (!flip) {
      doc.text(text, cx, y, { align: 'center' });
      return;
    }
    // Rotated text and `align: 'center'` disagree in jsPDF — the centring is
    // applied in the unrotated frame and the line ends up off to one side. So
    // the anchor is placed by hand: turned through 180° the text runs leftward
    // and hangs below the baseline, which is exactly the mirror of the upright
    // face when the baseline is reflected across the fold.
    const width = doc.getTextWidth(text);
    doc.text(text, cx + width / 2, 2 * cy - y, { angle: 180 });
  };

  name.lines.forEach((line, i) => place(line, firstNameY + i * lineGap, nameSize, false, false));
  // The table line gets the same treatment but never wraps: a table called
  // "Groom's university friends" broken over two lines reads as a second guest.
  const bold = kind === 'escort';
  const meta = fitText(
    (text, size) => measure(text, size, bold ? 'bold' : 'normal'),
    entry.table,
    maxWidth,
    metaSize,
    6,
    1,
  );
  place(meta.lines[0] ?? entry.table, metaY, meta.size, bold, !bold);
}

export interface CardOptions {
  kind: CardKind;
  sheet: SheetSpec;
  /** Free exports do not reach this code at all; Pro is enforced by the caller. */
  showCutLines: boolean;
}

export async function buildCardsPdf(
  project: Project,
  options: CardOptions,
): Promise<{ bytes: ArrayBuffer; blob: Blob; pages: number; cards: number }> {
  const { jsPDF: JsPdf } = await import('jspdf');
  const { FRAUNCES_REGULAR, FRAUNCES_BOLD, fraunceCanRender } = await import('./fraunces');
  const { fixCidOrdering } = await import('./index');

  const sheet = options.sheet;
  const doc = new JsPdf({
    orientation: sheet.page.width > sheet.page.height ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [sheet.page.width, sheet.page.height],
    compress: true,
  });

  doc.addFileToVFS('Fraunces-Regular.ttf', FRAUNCES_REGULAR);
  doc.addFont('Fraunces-Regular.ttf', 'Fraunces', 'normal');
  doc.addFileToVFS('Fraunces-Bold.ttf', FRAUNCES_BOLD);
  doc.addFont('Fraunces-Bold.ttf', 'Fraunces', 'bold');

  const serif = (text: string, weight: 'normal' | 'bold') => {
    if (fraunceCanRender(text)) doc.setFont('Fraunces', weight);
    else doc.setFont('times', weight);
  };

  const entries = buildCards(project, options.kind);
  const slots = slotsFor(sheet);

  entries.forEach((entry, i) => {
    const slotIndex = i % slots.length;
    if (i > 0 && slotIndex === 0) doc.addPage();
    const slot = slots[slotIndex] as Slot;

    if (options.showCutLines) drawCutLines(doc, slot, sheet.fold);

    if (sheet.fold) {
      const top: Slot = { ...slot, height: slot.height / 2 };
      const bottom: Slot = { ...slot, y: slot.y + slot.height / 2, height: slot.height / 2 };
      drawFace(doc, top, entry, options.kind, serif, true);
      drawFace(doc, bottom, entry, options.kind, serif, false);
    } else {
      drawFace(doc, slot, entry, options.kind, serif, false);
    }
  });

  const bytes = fixCidOrdering(doc.output('arraybuffer'));
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    pages: doc.getNumberOfPages(),
    cards: entries.length,
  };
}
