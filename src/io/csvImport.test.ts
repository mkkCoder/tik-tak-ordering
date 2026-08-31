import { describe, expect, it } from 'vitest';
import {
  buildImport,
  detectDelimiter,
  extractRows,
  findDuplicates,
  guessRoles,
  looksLikeHeader,
  normalizeName,
  parseSheet,
} from './csvImport';
import type { Guest } from '@/model/types';

let counter = 0;
const makeId = () => `id-${counter++}`;

const guest = (name: string): Guest => ({
  id: name,
  name,
  partyId: null,
  tags: [],
  notes: '',
  seat: null,
  locked: false,
});

describe('detectDelimiter', () => {
  it('finds tabs in a spreadsheet paste', () => {
    expect(detectDelimiter('Name\tParty\tSeats\nRuth\tCohen\t4')).toBe('\t');
  });

  it('finds commas in a CSV', () => {
    expect(detectDelimiter('Name,Party\nRuth,Cohen')).toBe(',');
  });

  it('finds semicolons, as European Excel exports them', () => {
    expect(detectDelimiter('Name;Party\nRuth;Cohen')).toBe(';');
  });

  it('falls back to comma for a single column', () => {
    expect(detectDelimiter('Ruth\nDavid\nMaya')).toBe(',');
  });

  it('is not fooled by commas inside one tab-separated field', () => {
    expect(detectDelimiter('Name\tNotes\nRuth\tvegetarian, no nuts\nDavid\tnone')).toBe('\t');
  });
});

describe('looksLikeHeader', () => {
  it('recognises familiar column names', () => {
    expect(looksLikeHeader(['Name', 'Party', 'Seats'], ['Ruth', 'Cohen', '4'])).toBe(true);
  });

  it('rejects a first row that is clearly data', () => {
    expect(looksLikeHeader(['Ruth Cohen', 'Cohen', '4'], ['David Cohen', 'Cohen', '2'])).toBe(false);
  });

  it('rejects a numeric first row', () => {
    expect(looksLikeHeader(['1', '2'], ['3', '4'])).toBe(false);
  });

  it('accepts unfamiliar single-word labels above full names', () => {
    expect(looksLikeHeader(['Who', 'Where'], ['Ruth Cohen', 'Top table'])).toBe(true);
  });
});

describe('parseSheet', () => {
  it('parses a three-column Excel paste with no configuration', () => {
    const sheet = parseSheet('Name\tParty\tSeats\nRuth Cohen\tCohen\t4\nDov Levi\tLevi\t2');
    expect(sheet.delimiter).toBe('\t');
    expect(sheet.hasHeader).toBe(true);
    expect(sheet.headers).toEqual(['Name', 'Party', 'Seats']);
    expect(sheet.rows).toHaveLength(2);
  });

  it('synthesises headers when the sheet has none', () => {
    const sheet = parseSheet('Ruth Cohen,Cohen\nDov Levi,Levi');
    expect(sheet.hasHeader).toBe(false);
    expect(sheet.headers).toEqual(['Column 1', 'Column 2']);
    expect(sheet.rows).toHaveLength(2);
  });

  it('pads short rows so columns line up', () => {
    const sheet = parseSheet('Name,Party,Notes\nRuth,Cohen\nDov,Levi,vegetarian');
    expect(sheet.rows.every((r) => r.length === 3)).toBe(true);
  });

  it('handles quoted fields containing the delimiter', () => {
    const sheet = parseSheet('Name,Notes\nRuth,"vegetarian, no nuts"');
    expect(sheet.rows[0]?.[1]).toBe('vegetarian, no nuts');
  });

  it('skips blank lines', () => {
    const sheet = parseSheet('Name\nRuth\n\n\nDov\n');
    expect(sheet.rows.map((r) => r[0])).toEqual(['Ruth', 'Dov']);
  });
});

describe('guessRoles', () => {
  it('maps a familiar header row', () => {
    const sheet = parseSheet('Name\tParty\tSeats\tTags\tNotes\nRuth\tCohen\t4\tbride\thi');
    expect(guessRoles(sheet)).toEqual(['name', 'party', 'quantity', 'tags', 'notes']);
  });

  it('guesses from the data when there is no header', () => {
    const sheet = parseSheet('Ruth Cohen,4\nDov Levi,2\nMaya Katz,6');
    const roles = guessRoles(sheet);
    expect(roles[0]).toBe('name');
    expect(roles[1]).toBe('quantity');
  });

  it('treats a bare list of names as names', () => {
    const sheet = parseSheet('Ruth Cohen\nDov Levi');
    expect(guessRoles(sheet)[0]).toBe('name');
  });

  it('recognises Hebrew headers', () => {
    const sheet = parseSheet('שם\tהערות\nרות\tצמחונית');
    expect(guessRoles(sheet)[0]).toBe('name');
  });
});

describe('extractRows', () => {
  it('reads the mapped columns and defaults quantity to one', () => {
    const sheet = parseSheet('Name,Party\nRuth Cohen,Cohen');
    const rows = extractRows(sheet, guessRoles(sheet));
    expect(rows[0]).toMatchObject({ name: 'Ruth Cohen', party: 'Cohen', quantity: 1 });
  });

  it('skips rows with no name', () => {
    const sheet = parseSheet('Name,Party\n,Cohen\nDov,Levi');
    expect(extractRows(sheet, guessRoles(sheet))).toHaveLength(1);
  });

  it('splits multi-value tag cells', () => {
    const sheet = parseSheet('Name,Tags\nRuth,"bride side; vegetarian"');
    const rows = extractRows(sheet, guessRoles(sheet));
    expect(rows[0]?.tags).toEqual(['bride side', 'vegetarian']);
  });

  it('reports spreadsheet line numbers so errors can be found', () => {
    const sheet = parseSheet('Name\nRuth\nDov');
    const rows = extractRows(sheet, guessRoles(sheet));
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });

  it('reads a quantity written as "4 seats"', () => {
    const sheet = parseSheet('Name,Seats\nRuth,4 seats');
    expect(extractRows(sheet, guessRoles(sheet))[0]?.quantity).toBe(4);
  });
});

describe('duplicates', () => {
  it('matches ignoring case, accents and punctuation', () => {
    expect(normalizeName('José  Álvarez')).toBe(normalizeName('jose alvarez'));
    expect(normalizeName("O'Brien")).toBe(normalizeName('O Brien'));
  });

  it('separates duplicates of existing guests from repeats within the file', () => {
    const sheet = parseSheet('Name\nRuth Cohen\nDov Levi\nDOV LEVI');
    const rows = extractRows(sheet, guessRoles(sheet));
    const report = findDuplicates(rows, [guest('Ruth Cohen')]);
    expect(report.existing.map((r) => r.name)).toEqual(['Ruth Cohen']);
    expect(report.internal.map((r) => r.name)).toEqual(['DOV LEVI']);
  });
});

describe('buildImport', () => {
  it('expands a quantity into a party', () => {
    const sheet = parseSheet('Name,Seats\nRuth Cohen,4');
    const rows = extractRows(sheet, guessRoles(sheet));
    const built = buildImport(rows, [], 'skip', makeId);
    expect(built.guests.map((g) => g.name)).toEqual([
      'Ruth Cohen',
      'Ruth Cohen +1',
      'Ruth Cohen +2',
      'Ruth Cohen +3',
    ]);
    expect(built.parties[0]?.label).toBe('Ruth Cohen +3');
    expect(new Set(built.guests.map((g) => g.partyId)).size).toBe(1);
  });

  it('groups everyone sharing a party label', () => {
    const sheet = parseSheet('Name,Party\nRuth,Cohen\nDavid,Cohen\nDov,Levi');
    const rows = extractRows(sheet, guessRoles(sheet));
    const built = buildImport(rows, [], 'skip', makeId);
    expect(built.parties).toHaveLength(2);
    expect(built.guests[0]?.partyId).toBe(built.guests[1]?.partyId);
    expect(built.guests[2]?.partyId).not.toBe(built.guests[0]?.partyId);
  });

  it('leaves a lone guest with no party at all', () => {
    const sheet = parseSheet('Name\nRuth Cohen');
    const built = buildImport(extractRows(sheet, guessRoles(sheet)), [], 'skip', makeId);
    expect(built.guests[0]?.partyId).toBeNull();
    expect(built.parties).toHaveLength(0);
  });

  it('skip strategy leaves existing guests alone', () => {
    const sheet = parseSheet('Name\nRuth Cohen\nDov Levi');
    const built = buildImport(
      extractRows(sheet, guessRoles(sheet)),
      [guest('ruth cohen')],
      'skip',
      makeId,
    );
    expect(built.guests.map((g) => g.name)).toEqual(['Dov Levi']);
    expect(built.skipped).toBe(1);
  });

  it('merge strategy brings the duplicate in anyway', () => {
    const sheet = parseSheet('Name\nRuth Cohen');
    const built = buildImport(
      extractRows(sheet, guessRoles(sheet)),
      [guest('Ruth Cohen')],
      'merge',
      makeId,
    );
    expect(built.guests).toHaveLength(1);
    expect(built.skipped).toBe(0);
  });

  it('caps an absurd quantity rather than creating thousands of guests', () => {
    const sheet = parseSheet('Name,Seats\nRuth,9999');
    const built = buildImport(extractRows(sheet, guessRoles(sheet)), [], 'skip', makeId);
    expect(built.guests).toHaveLength(50);
  });
});

describe('scale', () => {
  it('imports 500 rows in well under a second', () => {
    const text = ['Name,Party,Seats']
      .concat(
        Array.from({ length: 500 }, (_, i) => `Guest ${i},Family ${i % 120},${(i % 4) + 1}`),
      )
      .join('\n');

    const start = performance.now();
    const sheet = parseSheet(text);
    const rows = extractRows(sheet, guessRoles(sheet));
    const built = buildImport(rows, [], 'skip', makeId);
    const elapsed = performance.now() - start;

    expect(rows).toHaveLength(500);
    expect(built.guests.length).toBeGreaterThan(500);
    expect(elapsed).toBeLessThan(1000);
  });
});
