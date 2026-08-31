import { describe, expect, it } from 'vitest';
import { DEFAULT_ITERATIONS, arrange, buildComponents } from './arrange';
import { evaluate } from './constraints';
import type { Constraint, Guest, Project, Table } from './types';
import { emptyProject } from './types';

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

const table = (id: string, seats = 10, over: Partial<Table> = {}): Table => ({
  id,
  label: id,
  shape: 'round',
  seats,
  x: 0,
  y: 0,
  rotation: 0,
  locked: false,
  ...over,
});

function project(over: Partial<Project>): Project {
  return { ...emptyProject(), ...over };
}

function apply(p: Project, result: ReturnType<typeof arrange>): Project {
  const byGuest = new Map(result.placements.map((x) => [x.guestId, x]));
  return {
    ...p,
    guests: p.guests.map((g) => {
      const placement = byGuest.get(g.id);
      if (placement) return { ...g, seat: { tableId: placement.tableId, index: placement.index } };
      // Anything not placed and not frozen is unseated.
      return result.unseated.includes(g.id) ? { ...g, seat: null } : g;
    }),
  };
}

const options = { scope: 'all' as const, seed: 1, iterations: DEFAULT_ITERATIONS };

describe('buildComponents', () => {
  it('groups a party into one component', () => {
    const guests = [
      guest('a', { partyId: 'p1' }),
      guest('b', { partyId: 'p1' }),
      guest('c'),
    ];
    const components = buildComponents(guests, []);
    expect(components).toHaveLength(2);
    expect(components.find((c) => c.guests.length === 2)?.guests.sort()).toEqual(['a', 'b']);
  });

  it('joins guests linked by a together rule', () => {
    const guests = [guest('a'), guest('b'), guest('c')];
    const constraints: Constraint[] = [{ id: 'c1', kind: 'together', a: 'a', b: 'b' }];
    const components = buildComponents(guests, constraints);
    expect(components).toHaveLength(2);
  });

  it('chains transitively: a-b and b-c means all three', () => {
    const guests = [guest('a'), guest('b'), guest('c')];
    const constraints: Constraint[] = [
      { id: 'c1', kind: 'together', a: 'a', b: 'b' },
      { id: 'c2', kind: 'together', a: 'b', b: 'c' },
    ];
    expect(buildComponents(guests, constraints)).toHaveLength(1);
  });

  it('merges two parties joined by a together rule', () => {
    const guests = [
      guest('a', { partyId: 'p1' }),
      guest('b', { partyId: 'p1' }),
      guest('c', { partyId: 'p2' }),
    ];
    const constraints: Constraint[] = [{ id: 'c1', kind: 'together', a: 'a', b: 'c' }];
    expect(buildComponents(guests, constraints)).toHaveLength(1);
  });

  it('ignores apart rules', () => {
    const guests = [guest('a'), guest('b')];
    const constraints: Constraint[] = [{ id: 'c1', kind: 'apart', a: 'a', b: 'b' }];
    expect(buildComponents(guests, constraints)).toHaveLength(2);
  });
});

describe('arrange', () => {
  it('seats everyone when there is room', () => {
    const p = project({
      guests: Array.from({ length: 18 }, (_, i) => guest(`g${i}`)),
      tables: [table('t1'), table('t2')],
    });
    const result = arrange(p, options);
    expect(result.seatedCount).toBe(18);
    expect(result.unseated).toHaveLength(0);
  });

  it('never puts two guests in the same seat', () => {
    const p = project({
      guests: Array.from({ length: 30 }, (_, i) => guest(`g${i}`)),
      tables: [table('t1'), table('t2'), table('t3')],
    });
    const result = arrange(p, options);
    const keys = result.placements.map((x) => `${x.tableId}#${x.index}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never seats anyone past the last seat', () => {
    const p = project({
      guests: Array.from({ length: 12 }, (_, i) => guest(`g${i}`)),
      tables: [table('t1', 6), table('t2', 6)],
    });
    const result = arrange(p, options);
    for (const placement of result.placements) {
      const t = p.tables.find((x) => x.id === placement.tableId);
      expect(placement.index).toBeLessThan(t?.seats ?? 0);
    }
  });

  it('reports guests it could not seat rather than dropping them', () => {
    const p = project({
      guests: Array.from({ length: 15 }, (_, i) => guest(`g${i}`)),
      tables: [table('t1', 10)],
    });
    const result = arrange(p, options);
    expect(result.seatedCount).toBe(10);
    expect(result.unseated).toHaveLength(5);
  });

  it('is deterministic for a given seed', () => {
    const p = project({
      guests: Array.from({ length: 40 }, (_, i) => guest(`g${i}`, { partyId: `p${i % 9}` })),
      tables: [table('t1'), table('t2'), table('t3'), table('t4'), table('t5')],
      constraints: [
        { id: 'c1', kind: 'apart', a: 'g0', b: 'g5' },
        { id: 'c2', kind: 'together', a: 'g1', b: 'g9' },
      ],
    });
    const a = arrange(p, options);
    const b = arrange(p, options);
    expect(a.placements).toEqual(b.placements);
    expect(a.score).toBe(b.score);
  });

  it('a different seed is allowed to differ, but stays valid', () => {
    const p = project({
      guests: Array.from({ length: 40 }, (_, i) => guest(`g${i}`)),
      tables: [table('t1'), table('t2'), table('t3'), table('t4'), table('t5')],
    });
    const a = arrange(p, { ...options, seed: 1 });
    const b = arrange(p, { ...options, seed: 99 });
    expect(a.seatedCount).toBe(b.seatedCount);
  });

  it('keeps a party at one table when it fits', () => {
    const p = project({
      guests: [
        ...Array.from({ length: 6 }, (_, i) => guest(`fam${i}`, { partyId: 'p1' })),
        ...Array.from({ length: 12 }, (_, i) => guest(`other${i}`)),
      ],
      parties: [{ id: 'p1', label: 'Cohen' }],
      tables: [table('t1'), table('t2')],
    });
    const result = arrange(p, options);
    const famTables = new Set(
      result.placements.filter((x) => x.guestId.startsWith('fam')).map((x) => x.tableId),
    );
    expect(famTables.size).toBe(1);
  });

  it('leaves locked guests exactly where they were', () => {
    const p = project({
      guests: [
        guest('pinned', { locked: true, seat: { tableId: 't2', index: 7 } }),
        ...Array.from({ length: 10 }, (_, i) => guest(`g${i}`)),
      ],
      tables: [table('t1'), table('t2')],
    });
    const result = arrange(p, options);
    expect(result.placements.find((x) => x.guestId === 'pinned')).toBeUndefined();
    // And nobody else was given that seat.
    expect(result.placements.some((x) => x.tableId === 't2' && x.index === 7)).toBe(false);
  });

  it('leaves guests at a locked table alone', () => {
    const p = project({
      guests: [
        guest('vip', { seat: { tableId: 'head', index: 0 } }),
        ...Array.from({ length: 8 }, (_, i) => guest(`g${i}`)),
      ],
      tables: [table('head', 6, { locked: true }), table('t1')],
    });
    const result = arrange(p, options);
    expect(result.placements.some((x) => x.guestId === 'vip')).toBe(false);
    expect(result.placements.some((x) => x.tableId === 'head')).toBe(false);
  });

  it('unassigned scope does not move anyone already seated', () => {
    const p = project({
      guests: [
        guest('seated', { seat: { tableId: 't1', index: 3 } }),
        guest('waiting'),
      ],
      tables: [table('t1'), table('t2')],
    });
    const result = arrange(p, { ...options, scope: 'unassigned' });
    expect(result.placements.map((x) => x.guestId)).toEqual(['waiting']);
  });

  it('does not reuse a frozen guest seat index', () => {
    const p = project({
      guests: [
        guest('seated', { seat: { tableId: 't1', index: 0 } }),
        ...Array.from({ length: 9 }, (_, i) => guest(`g${i}`)),
      ],
      tables: [table('t1', 10)],
    });
    const result = arrange(p, { ...options, scope: 'unassigned' });
    expect(result.placements.some((x) => x.tableId === 't1' && x.index === 0)).toBe(false);
    expect(result.placements).toHaveLength(9);
  });

  it('handles an empty room and an empty guest list', () => {
    expect(arrange(project({}), options).placements).toHaveLength(0);
    expect(
      arrange(project({ guests: [guest('a')] }), options).unseated,
    ).toEqual(['a']);
    expect(arrange(project({ tables: [table('t1')] }), options).placements).toHaveLength(0);
  });
});

describe('the specified acceptance case', () => {
  /** 150 guests, 15 tables, 20 constraints — no apart violations, under 3s. */
  function sampleEvent(): Project {
    const guests: Guest[] = [];
    const parties = [];
    let n = 0;
    for (let family = 0; family < 30; family++) {
      const size = (family % 4) + 1;
      const partyId = `p${family}`;
      parties.push({ id: partyId, label: `Family ${family}` });
      for (let i = 0; i < size; i++) {
        guests.push(guest(`g${n++}`, { partyId }));
      }
    }
    while (guests.length < 150) guests.push(guest(`g${n++}`));

    const tables = Array.from({ length: 15 }, (_, i) => table(`t${i}`, 10));

    // 20 rules: alternating apart and together between distant guests.
    const constraints: Constraint[] = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      kind: i % 2 === 0 ? ('apart' as const) : ('together' as const),
      a: `g${i * 3}`,
      b: `g${i * 3 + 71}`,
    }));

    return project({ guests: guests.slice(0, 150), parties, tables, constraints });
  }

  it('produces zero apart violations, in under three seconds', () => {
    const p = sampleEvent();
    const start = performance.now();
    const result = arrange(p, options);
    const elapsed = performance.now() - start;

    const seated = apply(p, result);
    const apartViolations = evaluate(seated).filter((v) => v.kind === 'apart');

    expect(apartViolations).toHaveLength(0);
    expect(result.seatedCount).toBe(150);
    expect(elapsed).toBeLessThan(3000);
  });

  it('reports the violations it could not resolve', () => {
    // A room where two enemies must share the only table.
    const p = project({
      guests: [guest('a'), guest('b')],
      tables: [table('only', 2)],
      constraints: [{ id: 'c1', kind: 'apart', a: 'a', b: 'b' }],
    });
    const result = arrange(p, options);
    expect(result.seatedCount).toBe(2);
    expect(result.violations).toBe(1);
  });
});
