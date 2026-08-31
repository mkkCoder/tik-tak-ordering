import type { jsPDF } from 'jspdf';
import type { Guest, Project, Table } from '@/model/types';
import { footprint, seatPositions } from '@/model/seating';

/**
 * The printed chart. This is the artefact people pay for, so it is drawn as
 * real vectors and real text — never a screenshot — which means it stays sharp
 * at any print size and can be searched in a PDF reader.
 */

export type PageFormat = 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';

export interface PdfOptions {
  format: PageFormat;
  orientation: Orientation;
  /** Free exports carry a watermark and a truncated index. */
  watermark: boolean;
  indexLimit: number | null;
}

export const FREE_INDEX_LIMIT = 20;

export function freeOptions(format: PageFormat, orientation: Orientation): PdfOptions {
  return { format, orientation, watermark: true, indexLimit: FREE_INDEX_LIMIT };
}

export function proOptions(format: PageFormat, orientation: Orientation): PdfOptions {
  return { format, orientation, watermark: false, indexLimit: null };
}

const INK = [22, 32, 43] as const;
const SLATE = [87, 103, 117] as const;
const HAIRLINE = [200, 196, 186] as const;

const MARGIN = 14; // mm

interface Layout {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

let canRender: (text: string) => boolean = () => false;

/** Registered once per document; jsPDF keeps fonts in a per-document VFS. */
async function installFonts(doc: jsPDF): Promise<void> {
  const { FRAUNCES_REGULAR, FRAUNCES_BOLD, fraunceCanRender } = await import('./fraunces');
  doc.addFileToVFS('Fraunces-Regular.ttf', FRAUNCES_REGULAR);
  doc.addFont('Fraunces-Regular.ttf', 'Fraunces', 'normal');
  doc.addFileToVFS('Fraunces-Bold.ttf', FRAUNCES_BOLD);
  doc.addFont('Fraunces-Bold.ttf', 'Fraunces', 'bold');
  canRender = fraunceCanRender;
}

/**
 * Select Fraunces for a specific string, or Times if that string contains a
 * character the embedded subset lacks. jsPDF truncates a string at the first
 * glyph it cannot encode, so an unchecked name would come out half-printed.
 */
function serifFor(doc: jsPDF, text: string, weight: 'normal' | 'bold'): void {
  if (canRender(text)) doc.setFont('Fraunces', weight);
  else doc.setFont('times', weight);
}

function layoutOf(doc: jsPDF): Layout {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  return {
    width,
    height,
    left: MARGIN,
    right: width - MARGIN,
    top: MARGIN,
    bottom: height - MARGIN,
  };
}

/** "Ruth Cohen +2" sorts under C, like everyone else called Cohen. */
export function surnameOf(name: string): string {
  const cleaned = name.replace(/\s*\+\d+\s*$/, '').trim();
  const parts = cleaned.split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0]) ?? cleaned;
}

export interface IndexEntry {
  name: string;
  sortKey: string;
  table: string;
}

/** Every seated guest, by surname, with their table. This is what gets hung up. */
export function buildIndex(project: Pick<Project, 'guests' | 'tables'>): IndexEntry[] {
  const tableById = new Map(project.tables.map((t) => [t.id, t]));
  const entries: IndexEntry[] = [];
  for (const g of project.guests) {
    if (!g.seat) continue;
    const table = tableById.get(g.seat.tableId);
    if (!table) continue;
    entries.push({
      name: g.name,
      sortKey: `${surnameOf(g.name)} ${g.name}`.toLowerCase(),
      table: table.label,
    });
  }
  return entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export interface TableSection {
  table: Table;
  guests: Array<{ seat: number; name: string }>;
}

export function buildTableSections(project: Pick<Project, 'guests' | 'tables'>): TableSection[] {
  const bySeat = new Map<string, Guest>();
  for (const g of project.guests) {
    if (g.seat) bySeat.set(`${g.seat.tableId}#${g.seat.index}`, g);
  }
  return project.tables.map((table) => {
    const guests: Array<{ seat: number; name: string }> = [];
    for (let i = 0; i < table.seats; i++) {
      const g = bySeat.get(`${table.id}#${i}`);
      if (g) guests.push({ seat: i + 1, name: g.name });
    }
    return { table, guests };
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function drawHeader(doc: jsPDF, layout: Layout, project: Project, subtitle: string): number {
  const title = project.event.name || 'Untitled event';
  serifFor(doc, title, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(title, layout.left, layout.top + 5);

  const meta = [formatDate(project.event.date), project.event.venue].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  if (meta) doc.text(meta, layout.left, layout.top + 10.5);
  doc.text(subtitle, layout.right, layout.top + 10.5, { align: 'right' });

  const y = layout.top + 13.5;
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.2);
  doc.line(layout.left, y, layout.right, y);
  return y + 7;
}

export const WATERMARK_NOMINAL_PT = 30;

/**
 * How large the diagonal watermark may be. The domain is part of the string, so
 * a longer one has to shrink rather than run off the page — this is pure so the
 * fit can be asserted without rendering a document.
 *
 * @param widthAtNominal width of the line measured at WATERMARK_NOMINAL_PT
 */
export function watermarkFontSize(
  widthAtNominal: number,
  usableWidth: number,
  usableHeight: number,
  angleDeg: number,
): number {
  const rad = (angleDeg * Math.PI) / 180;
  const allowed = Math.min(usableWidth / Math.cos(rad), usableHeight / Math.sin(rad));
  if (widthAtNominal <= allowed) return WATERMARK_NOMINAL_PT;
  return Math.max(10, (WATERMARK_NOMINAL_PT * allowed) / widthAtNominal);
}

function drawWatermark(doc: jsPDF, layout: Layout, domain: string): void {
  doc.saveGraphicsState();
  // @ts-expect-error GState is present at runtime but missing from the typings.
  doc.setGState(new doc.GState({ opacity: 0.11 }));
  const mark = `Made with TIKTAK — ${domain}`;
  const angle = 34;
  serifFor(doc, mark, 'bold');

  /*
   * Fit the mark to the page rather than trusting a fixed size: the domain is
   * part of the string, so a longer one would run off the edge and print as
   * "Made wi… tik-tak.onlin". Measure at the nominal size, work out how wide
   * the rotated line is allowed to be, and shrink if it does not fit. Never
   * grow past the nominal size — a short domain should not shout.
   */
  const rad = (angle * Math.PI) / 180;
  doc.setFontSize(WATERMARK_NOMINAL_PT);
  doc.setFontSize(
    watermarkFontSize(doc.getTextWidth(mark), layout.right - layout.left, layout.bottom - layout.top, angle),
  );
  const finalWidth = doc.getTextWidth(mark);

  doc.setTextColor(...INK);
  /*
   * `align: 'center'` and `angle` do not compose in jsPDF — the centring is
   * worked out before the rotation, so the line ends up hanging off a corner.
   * The anchor is therefore placed by hand: the baseline runs along
   * (cos θ, −sin θ), so stepping back half the text width from the page centre
   * puts the middle of the line exactly there.
   */
  doc.text(
    mark,
    layout.width / 2 - (finalWidth / 2) * Math.cos(rad),
    layout.height / 2 + (finalWidth / 2) * Math.sin(rad),
    { angle },
  );
  doc.restoreGraphicsState();
}

/**
 * The floor plan, drawn to fill the page. Same geometry functions as the
 * canvas, so what was arranged on screen is what comes out of the printer.
 */
function drawFloorPlan(doc: jsPDF, layout: Layout, project: Project, top: number): void {
  const tables = project.tables;
  if (tables.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    doc.text('No tables in this plan yet.', layout.left, top + 6);
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tables) {
    const f = footprint(t);
    const reach = (f.kind === 'circle' ? f.radius : Math.hypot(f.width / 2, f.height / 2)) + 6;
    minX = Math.min(minX, t.x - reach);
    maxX = Math.max(maxX, t.x + reach);
    minY = Math.min(minY, t.y - reach);
    maxY = Math.max(maxY, t.y + reach);
  }

  const availableW = layout.right - layout.left;
  const availableH = layout.bottom - top - 4;
  const scale = Math.min(availableW / (maxX - minX), availableH / (maxY - minY));
  const offsetX = layout.left + (availableW - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = top + (availableH - (maxY - minY) * scale) / 2 - minY * scale;
  const px = (x: number) => offsetX + x * scale;
  const py = (y: number) => offsetY + y * scale;

  doc.setLineWidth(Math.max(0.15, 0.5 * scale));

  for (const table of tables) {
    const f = footprint(table);
    doc.setDrawColor(...INK);
    doc.setFillColor(255, 255, 255);

    if (f.kind === 'circle') {
      doc.circle(px(table.x), py(table.y), f.radius * scale, 'S');
    } else {
      // Rotate the four corners rather than asking jsPDF for a rotated rect.
      const corners = rotatedRect(table, f.width, f.height);
      doc.lines(
        corners.slice(1).map((c, i) => {
          const prev = corners[i] as { x: number; y: number };
          return [(c.x - prev.x) * scale, (c.y - prev.y) * scale];
        }),
        px(corners[0]?.x ?? 0),
        py(corners[0]?.y ?? 0),
        [1, 1],
        'S',
        true,
      );
    }

    // Chairs: small circles, filled where someone is sitting.
    const occupied = new Set(
      project.guests
        .filter((g) => g.seat?.tableId === table.id)
        .map((g) => g.seat?.index as number),
    );
    const seatR = Math.max(0.5, 2.1 * scale);
    for (const s of seatPositions(table)) {
      if (occupied.has(s.index)) {
        doc.setFillColor(...INK);
        doc.circle(px(s.x), py(s.y), seatR, 'F');
      } else {
        doc.setDrawColor(...SLATE);
        doc.circle(px(s.x), py(s.y), seatR, 'S');
      }
    }

    const labelSize = Math.max(5, Math.min(11, 3.6 * scale));
    serifFor(doc, table.label, 'bold');
    doc.setFontSize(labelSize);
    doc.setTextColor(...INK);
    doc.text(table.label, px(table.x), py(table.y), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(Math.max(4, labelSize * 0.72));
    doc.setTextColor(...SLATE);
    doc.text(
      `${occupied.size}/${table.seats}`,
      px(table.x),
      py(table.y) + labelSize * 0.5,
      { align: 'center' },
    );
  }
}

function rotatedRect(table: Table, w: number, h: number) {
  const rad = (table.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
    { x: -w / 2, y: -h / 2 },
  ];
  return local.map((p) => ({
    x: table.x + p.x * cos - p.y * sin,
    y: table.y + p.x * sin + p.y * cos,
  }));
}

/** Multi-column flow used by both the per-table lists and the index. */
function flowColumns(
  layout: Layout,
  startY: number,
  columns: number,
  lineHeight: number,
  onNewPage: () => number,
  draw: (write: (render: (x: number, y: number, colWidth: number) => void, lines?: number) => void) => void,
): void {
  const gutter = 8;
  const colWidth = (layout.right - layout.left - gutter * (columns - 1)) / columns;
  let col = 0;
  let y = startY;

  const write = (render: (x: number, y: number, colWidth: number) => void, lines = 1) => {
    if (y + lineHeight * lines > layout.bottom) {
      col++;
      y = startY;
      if (col >= columns) {
        col = 0;
        y = onNewPage();
      }
    }
    render(layout.left + col * (colWidth + gutter), y, colWidth);
    y += lineHeight * lines;
  };

  draw(write);
}

export interface ExportResult {
  /** Raw bytes, so callers can save, hash or inspect without a Blob shim. */
  bytes: ArrayBuffer;
  blob: Blob;
  pages: number;
  indexTruncated: boolean;
}

export async function buildSeatingPdf(
  project: Project,
  options: PdfOptions,
  domain = 'tik-tak.online',
): Promise<ExportResult> {
  const { jsPDF: JsPdf } = await import('jspdf');
  const doc = new JsPdf({
    orientation: options.orientation,
    unit: 'mm',
    format: options.format,
    compress: true,
  });
  await installFonts(doc);

  const layout = layoutOf(doc);
  const sections = buildTableSections(project);
  const index = buildIndex(project);
  const seatedCount = index.length;

  // ---- 1. Floor plan -------------------------------------------------------
  let top = drawHeader(doc, layout, project, 'Floor plan');
  drawFloorPlan(doc, layout, project, top);
  if (options.watermark) drawWatermark(doc, layout, domain);

  // ---- 2. Per-table lists --------------------------------------------------
  doc.addPage();
  top = drawHeader(doc, layout, project, 'Tables');
  const columns = options.orientation === 'landscape' ? 4 : 3;

  const newTablePage = () => {
    if (options.watermark) drawWatermark(doc, layout, domain);
    doc.addPage();
    return drawHeader(doc, layout, project, 'Tables (continued)');
  };

  flowColumns(layout, top, columns, 4.6, newTablePage, (write) => {
    for (const section of sections) {
      write((x, y) => {
        serifFor(doc, section.table.label, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...INK);
        doc.text(section.table.label, x, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...SLATE);
        doc.text(`${section.guests.length}/${section.table.seats}`, x, y + 3.6);
      }, 2);

      if (section.guests.length === 0) {
        write((x, y) => {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(...SLATE);
          doc.text('empty', x, y);
        });
      }

      for (const g of section.guests) {
        write((x, y, colWidth) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...SLATE);
          doc.text(String(g.seat), x, y);
          doc.setTextColor(...INK);
          doc.text(fit(doc, g.name, colWidth - 6), x + 5, y);
        });
      }

      write(() => {}); // breathing room between tables
    }
  });

  // ---- 3. Alphabetical index ----------------------------------------------
  if (options.watermark) drawWatermark(doc, layout, domain);
  doc.addPage();
  const shown = options.indexLimit === null ? index : index.slice(0, options.indexLimit);
  const truncated = shown.length < index.length;

  top = drawHeader(
    doc,
    layout,
    project,
    truncated ? `Guests A–Z (${shown.length} of ${index.length})` : 'Guests A–Z',
  );

  const newIndexPage = () => {
    if (options.watermark) drawWatermark(doc, layout, domain);
    doc.addPage();
    return drawHeader(doc, layout, project, 'Guests A–Z (continued)');
  };

  let lastInitial = '';
  flowColumns(layout, top, columns, 4.4, newIndexPage, (write) => {
    for (const entry of shown) {
      const initial = (surnameOf(entry.name)[0] ?? '').toUpperCase();
      if (initial && initial !== lastInitial) {
        lastInitial = initial;
        write((x, y) => {
          serifFor(doc, initial, 'bold');
          doc.setFontSize(10);
          doc.setTextColor(...INK);
          doc.text(initial, x, y);
        }, 1.4);
      }
      write((x, y, colWidth) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...INK);
        doc.text(fit(doc, entry.name, colWidth - 20), x, y);
        doc.setTextColor(...SLATE);
        doc.text(entry.table, x + colWidth - 1, y, { align: 'right' });
      });
    }

    if (truncated) {
      write(() => {}, 1);
      write((x, y, colWidth) => {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...SLATE);
        doc.text(
          doc.splitTextToSize(
            `${index.length - shown.length} more guests are in the full index, available with TIKTAK Pro.`,
            colWidth,
          ),
          x,
          y,
        );
      }, 3);
    }
  });

  if (options.watermark) drawWatermark(doc, layout, domain);

  // Page numbers last, once the total is known.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(`${p} / ${pages}`, layout.right, layout.bottom + 6, { align: 'right' });
    if (p === 1) {
      doc.text(
        `${seatedCount} of ${project.guests.length} guests seated`,
        layout.left,
        layout.bottom + 6,
      );
    }
  }

  const bytes = fixCidOrdering(doc.output('arraybuffer'));
  return {
    bytes,
    blob: new Blob([bytes], { type: 'application/pdf' }),
    pages,
    indexTruncated: truncated,
  };
}

const BAD_ORDERING = '/Ordering (Identity-H)';
// Same byte length, so every xref offset in the file stays valid.
const GOOD_ORDERING = '/Ordering (Identity)  ';

/**
 * jsPDF writes the embedded font's CIDSystemInfo as
 * `/Registry (Adobe) /Ordering (Identity-H)`, using the *encoding* name where
 * the PDF spec wants the *ordering* name. Readers then look for a character
 * collection called "Adobe-Identity-H", fail to find it, and give up on the
 * font's ToUnicode map — which means the text is drawn but cannot be selected,
 * searched or copied. Since a searchable chart is the whole point of the paid
 * export, the ordering is corrected here, in place.
 *
 * The replacement is deliberately the same number of bytes as the original, so
 * the cross-reference table stays correct without rebuilding the document.
 */
export function fixCidOrdering(input: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(input);
  const needle = new TextEncoder().encode(BAD_ORDERING);
  const replacement = new TextEncoder().encode(GOOD_ORDERING);
  if (needle.length !== replacement.length) return input;

  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    bytes.set(replacement, i);
    i += needle.length - 1;
  }
  return bytes.buffer;
}

/** Trim a string until it fits the given width, with an ellipsis. */
function fit(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}
