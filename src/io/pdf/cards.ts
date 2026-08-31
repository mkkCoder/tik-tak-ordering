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
 * Avery 5302 small tent cards: 3.5in × 2in folded, two per Letter sheet, each
 * slot 4in tall before folding.
 */
export const AVERY_5302: SheetSpec = {
  id: 'avery5302',
  label: 'Avery 5302 tent cards (3.5 × 2 in)',
  page: { width: 8.5 * IN, height: 11 * IN },
  card: { width: 3.5 * IN, height: 2 * IN },
  columns: 1,
  rows: 2,
  margin: { top: 1.5 * IN, left: 2.5 * IN },
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
  const nameSize = Math.min(20, Math.max(11, face.height * 0.32));
  const metaSize = Math.max(7, nameSize * 0.5);

  const nameY = cy - (kind === 'place' ? nameSize * 0.05 : nameSize * 0.15);
  const metaY = nameY + metaSize * 1.9;

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

  place(entry.name, nameY, nameSize, false, false);
  if (kind === 'escort') {
    place(entry.table, metaY, metaSize, true, false);
  } else {
    place(entry.table, metaY, metaSize, false, true);
  }
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
