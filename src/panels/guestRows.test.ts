import { describe, expect, it } from 'vitest';
import { buildRows, normalize, rowGuestIds } from './guestRows';
import type { Guest, Party, Table } from '@/model/types';

const guest = (id: string, over: Partial<Guest> = {}): Guest => ({
  id,
  name: id,
  partyId: null,
  tags: [],
  notes: '',
  seat: null,
  locked: false,
  ...over,
});

const table: Table = {
  id: 't1',
  label: 'Table 1',
  shape: 'round',
  seats: 10,
  x: 0,
  y: 0,
  rotation: 0,
  locked: false,
};

const base = {
  parties: [] as Party[],
  tables: [table],
  query: '',
  scope: 'all' as const,
  collapsed: new Set<string>(),
};

describe('normalize', () => {
  it('folds case and accents', () => {
    expect(normalize('José')).toBe('jose');
    expect(normalize('  MÜLLER ')).toBe('muller');
  });
});

describe('buildRows', () => {
  it('lists loose guests', () => {
    const rows = buildRows({ ...base, guests: [guest('a'), guest('b')] });
    expect(rows.map((r) => r.key)).toEqual(['guest:a', 'guest:b']);
  });

  it('puts parties first, with their members beneath', () => {
    const parties = [{ id: 'p1', label: 'Cohen' }];
    const rows = buildRows({
      ...base,
      parties,
      guests: [guest('loose'), guest('a', { partyId: 'p1' }), guest('b', { partyId: 'p1' })],
    });
    expect(rows.map((r) => r.key)).toEqual([
      'party:p1',
      'guest:a',
      'guest:b',
      'guest:loose',
    ]);
    expect(rows[1]).toMatchObject({ indented: true });
    expect(rows[3]).toMatchObject({ indented: false });
  });

  it('hides members of a collapsed party but keeps the party row', () => {
    const rows = buildRows({
      ...base,
      parties: [{ id: 'p1', label: 'Cohen' }],
      guests: [guest('a', { partyId: 'p1' })],
      collapsed: new Set(['p1']),
    });
    expect(rows.map((r) => r.key)).toEqual(['party:p1']);
  });

  it('drops a party whose members all filtered out', () => {
    const rows = buildRows({
      ...base,
      parties: [{ id: 'p1', label: 'Cohen' }],
      guests: [guest('Ruth', { partyId: 'p1' })],
      query: 'zzz',
    });
    expect(rows).toHaveLength(0);
  });

  it('unassigned scope hides seated guests', () => {
    const rows = buildRows({
      ...base,
      scope: 'unassigned',
      guests: [guest('a'), guest('b', { seat: { tableId: 't1', index: 0 } })],
    });
    expect(rows.map((r) => r.key)).toEqual(['guest:a']);
  });

  it('counts how many of a party are already seated', () => {
    const rows = buildRows({
      ...base,
      parties: [{ id: 'p1', label: 'Cohen' }],
      guests: [
        guest('a', { partyId: 'p1', seat: { tableId: 't1', index: 0 } }),
        guest('b', { partyId: 'p1' }),
      ],
    });
    expect(rows[0]).toMatchObject({ kind: 'party', seatedCount: 1 });
  });
});

describe('search', () => {
  const guests = [
    guest('g1', { name: 'Ruth Cohen', partyId: 'p1', tags: ['bride side'] }),
    guest('g2', { name: 'José Álvarez', notes: 'vegetarian' }),
    guest('g3', { name: 'Dov Levi', seat: { tableId: 't1', index: 2 } }),
  ];
  const parties = [{ id: 'p1', label: 'Cohen +3' }];

  const find = (query: string) =>
    buildRows({ ...base, parties, guests, query })
      .filter((r) => r.kind === 'guest')
      .map((r) => (r.kind === 'guest' ? r.guest.name : ''));

  it('matches names', () => {
    expect(find('ruth')).toEqual(['Ruth Cohen']);
  });

  it('matches accented names typed without accents', () => {
    expect(find('jose alvarez')).toEqual(['José Álvarez']);
  });

  it('matches party labels', () => {
    expect(find('cohen +3')).toEqual(['Ruth Cohen']);
  });

  it('matches tags and notes', () => {
    expect(find('bride')).toEqual(['Ruth Cohen']);
    expect(find('vegetarian')).toEqual(['José Álvarez']);
  });

  it('matches the table someone is sitting at', () => {
    expect(find('table 1')).toEqual(['Dov Levi']);
  });

  it('requires every word to match, in any order', () => {
    expect(find('cohen ruth')).toEqual(['Ruth Cohen']);
    expect(find('ruth levi')).toEqual([]);
  });
});

describe('rowGuestIds', () => {
  it('a party row stands for all its members', () => {
    const rows = buildRows({
      ...base,
      parties: [{ id: 'p1', label: 'Cohen' }],
      guests: [guest('a', { partyId: 'p1' }), guest('b', { partyId: 'p1' })],
    });
    expect(rowGuestIds(rows[0] as never)).toEqual(['a', 'b']);
    expect(rowGuestIds(rows[1] as never)).toEqual(['a']);
  });
});

describe('scale', () => {
  it('filters 1,000 guests in well under the 100ms search budget', () => {
    const guests = Array.from({ length: 1000 }, (_, i) =>
      guest(`g${i}`, { name: `Guest Number ${i}`, tags: [i % 2 ? 'bride side' : 'groom side'] }),
    );
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      buildRows({ ...base, guests, query: 'guest number 9' });
    }
    const perSearch = (performance.now() - start) / 10;
    expect(perSearch).toBeLessThan(100);
  });
});
