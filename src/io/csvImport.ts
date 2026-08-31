import Papa from 'papaparse';
import type { Guest, Party } from '@/model/types';

/**
 * Getting a guest list out of a spreadsheet and into the app.
 *
 * The design goal is that pasting three columns from Excel needs no
 * configuration at all: delimiter, header row and column meaning are guessed,
 * and the mapping screen exists to correct a guess, not to make one.
 */

export type ColumnRole = 'name' | 'party' | 'quantity' | 'tags' | 'notes' | 'ignore';

export interface ParsedSheet {
  /** Header labels — synthesised ("Column 1", …) when the sheet has no header. */
  headers: string[];
  rows: string[][];
  hasHeader: boolean;
  delimiter: string;
}

const DELIMITERS = ['\t', ',', ';', '|'] as const;

/** Pick the delimiter that yields the most consistent column count. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (sample.length === 0) return ',';

  let best = ',';
  let bestScore = -Infinity;
  for (const d of DELIMITERS) {
    const counts = sample.map((line) => splitLine(line, d).length);
    const first = counts[0] ?? 1;
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length / counts.length;
    // Favour consistency first, then more columns.
    const score = consistent * 10 + first * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Naive split that respects double quotes, used only for delimiter sniffing. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === delimiter) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

const HEADER_WORDS = [
  'name',
  'guest',
  'first',
  'last',
  'surname',
  'party',
  'family',
  'group',
  'household',
  'seats',
  'qty',
  'quantity',
  'count',
  'pax',
  'tags',
  'tag',
  'side',
  'category',
  'notes',
  'note',
  'comment',
  'dietary',
  'meal',
  'שם',
  'אורח',
  'משפחה',
  'הערות',
];

/**
 * A first row is a header when its cells look like labels rather than data:
 * short, non-numeric, and recognisably column-ish.
 */
export function looksLikeHeader(row: string[], next: string[] | undefined): boolean {
  if (row.length === 0) return false;
  const cells = row.map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (cells.length === 0) return false;

  const known = cells.filter((c) => HEADER_WORDS.some((w) => c.includes(w))).length;
  if (known > 0) return true;

  // No recognisable words: fall back on shape. Headers are rarely numeric, and
  // rarely look like a person's full name while the row under them does.
  const numeric = cells.filter((c) => /^\d+(\.\d+)?$/.test(c)).length;
  if (numeric > 0) return false;
  if (!next) return false;
  const rowHasSpace = cells.some((c) => c.includes(' '));
  const nextHasSpace = next.some((c) => c.trim().includes(' '));
  return !rowHasSpace && nextHasSpace;
}

export function parseSheet(text: string, forcedDelimiter?: string): ParsedSheet {
  const delimiter = forcedDelimiter ?? detectDelimiter(text);
  const result = Papa.parse<string[]>(text.trim(), {
    delimiter,
    skipEmptyLines: 'greedy',
  });
  const all = (result.data ?? []).map((row) => row.map((cell) => (cell ?? '').trim()));
  if (all.length === 0) {
    return { headers: [], rows: [], hasHeader: false, delimiter };
  }

  const width = all.reduce((n, row) => Math.max(n, row.length), 0);
  const padded = all.map((row) => {
    const copy = row.slice(0, width);
    while (copy.length < width) copy.push('');
    return copy;
  });

  const first = padded[0] as string[];
  const hasHeader = looksLikeHeader(first, padded[1]);
  return {
    headers: hasHeader ? first.map((h, i) => h || `Column ${i + 1}`) : first.map((_, i) => `Column ${i + 1}`),
    rows: hasHeader ? padded.slice(1) : padded,
    hasHeader,
    delimiter,
  };
}

const ROLE_HINTS: Array<[ColumnRole, RegExp]> = [
  ['quantity', /^(seats?|qty|quantity|count|pax|guests?|#|total|how many)$/i],
  ['party', /(party|family|household|group|table group|surname|last name)/i],
  ['tags', /(tags?|side|category|group type|meal|dietary)/i],
  ['notes', /(notes?|comment|remark|הערות)/i],
  ['name', /(name|guest|full name|שם|אורח)/i],
];

/** Best guess at what each column means, from its header and its contents. */
export function guessRoles(sheet: ParsedSheet): ColumnRole[] {
  const roles: ColumnRole[] = sheet.headers.map(() => 'ignore');
  const used = new Set<ColumnRole>();

  if (sheet.hasHeader) {
    sheet.headers.forEach((header, i) => {
      for (const [role, pattern] of ROLE_HINTS) {
        if (used.has(role)) continue;
        if (pattern.test(header.trim())) {
          roles[i] = role;
          used.add(role);
          return;
        }
      }
    });
  }

  // Whatever is still unassigned: the first mostly-numeric column is a
  // quantity, and the first text column with spaces is the name.
  sheet.headers.forEach((_, i) => {
    if (roles[i] !== 'ignore') return;
    const values = sheet.rows.slice(0, 30).map((r) => r[i] ?? '').filter(Boolean);
    if (values.length === 0) return;
    const numeric = values.filter((v) => /^\d{1,3}$/.test(v)).length / values.length;
    if (!used.has('quantity') && numeric > 0.8) {
      roles[i] = 'quantity';
      used.add('quantity');
      return;
    }
    if (!used.has('name') && numeric < 0.3) {
      roles[i] = 'name';
      used.add('name');
    }
  });

  // A single-column sheet is a list of names, whatever it is called.
  if (!used.has('name') && roles.length > 0) roles[0] = 'name';

  return roles;
}

export interface ImportRow {
  name: string;
  party: string;
  quantity: number;
  tags: string[];
  notes: string;
  /** Row number as the user sees it in their spreadsheet, for error messages. */
  line: number;
}

export function extractRows(sheet: ParsedSheet, roles: ColumnRole[]): ImportRow[] {
  const col = (role: ColumnRole) => roles.indexOf(role);
  const nameCol = col('name');
  const partyCol = col('party');
  const qtyCol = col('quantity');
  const tagsCol = col('tags');
  const notesCol = col('notes');
  const offset = sheet.hasHeader ? 2 : 1;

  const out: ImportRow[] = [];
  sheet.rows.forEach((row, i) => {
    const name = (nameCol >= 0 ? row[nameCol] : '')?.trim() ?? '';
    if (!name) return;
    const rawQty = qtyCol >= 0 ? Number((row[qtyCol] ?? '').replace(/[^\d]/g, '')) : NaN;
    out.push({
      name,
      party: (partyCol >= 0 ? row[partyCol] : '')?.trim() ?? '',
      quantity: Number.isFinite(rawQty) && rawQty > 0 ? Math.min(50, rawQty) : 1,
      tags: splitTags((tagsCol >= 0 ? row[tagsCol] : '') ?? ''),
      notes: (notesCol >= 0 ? row[notesCol] : '')?.trim() ?? '',
      line: i + offset,
    });
  });
  return out;
}

function splitTags(value: string): string[] {
  return value
    .split(/[,;/|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Names are the same person if they match ignoring case, accents and spacing. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export interface DuplicateReport {
  /** Rows whose name already exists in the project. */
  existing: ImportRow[];
  /** Rows that repeat another row inside this same import. */
  internal: ImportRow[];
}

export function findDuplicates(rows: readonly ImportRow[], existingGuests: readonly Guest[]): DuplicateReport {
  const known = new Set(existingGuests.map((g) => normalizeName(g.name)));
  const seen = new Set<string>();
  const existing: ImportRow[] = [];
  const internal: ImportRow[] = [];

  for (const row of rows) {
    const key = normalizeName(row.name);
    if (known.has(key)) existing.push(row);
    else if (seen.has(key)) internal.push(row);
    seen.add(key);
  }
  return { existing, internal };
}

export type DuplicateStrategy = 'skip' | 'merge';

export interface BuiltImport {
  guests: Array<Partial<Guest> & { name: string }>;
  parties: Party[];
  skipped: number;
}

/**
 * Turn mapped rows into guests and parties.
 *
 * A quantity greater than one means "this person plus guests": the row becomes
 * a party of that size, the named person plus "<name> +1", "+2"… so the count
 * on the door matches the count in the plan.
 */
export function buildImport(
  rows: readonly ImportRow[],
  existingGuests: readonly Guest[],
  strategy: DuplicateStrategy,
  makeId: () => string,
): BuiltImport {
  const known = new Set(existingGuests.map((g) => normalizeName(g.name)));
  const guests: Array<Partial<Guest> & { name: string }> = [];
  const parties: Party[] = [];
  const partyByLabel = new Map<string, Party>();
  let skipped = 0;

  for (const row of rows) {
    const key = normalizeName(row.name);
    if (strategy === 'skip' && known.has(key)) {
      skipped++;
      continue;
    }
    known.add(key);

    const needsParty = row.quantity > 1 || row.party !== '';
    let partyId: string | null = null;

    if (needsParty) {
      const label = row.party || (row.quantity > 1 ? `${row.name} +${row.quantity - 1}` : row.name);
      let party = partyByLabel.get(label.toLowerCase());
      if (!party) {
        party = { id: makeId(), label };
        partyByLabel.set(label.toLowerCase(), party);
        parties.push(party);
      }
      partyId = party.id;
    }

    guests.push({
      name: row.name,
      partyId,
      tags: row.tags,
      notes: row.notes,
    });

    for (let i = 1; i < row.quantity; i++) {
      guests.push({
        name: `${row.name} +${i}`,
        partyId,
        tags: row.tags,
        notes: '',
      });
    }
  }

  return { guests, parties, skipped };
}
