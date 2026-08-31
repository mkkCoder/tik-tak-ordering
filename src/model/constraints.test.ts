import { describe, expect, it } from 'vitest';
import { evaluate, findConstraint, statusOf, violatingGuests, violatingTables } from './constraints';
import type { Constraint, Guest } from './types';

const guest = (id: string, tableId?: string, index = 0): Guest => ({
  id,
  name: id.toUpperCase(),
  partyId: null,
  tags: [],
  notes: '',
  seat: tableId ? { tableId, index } : null,
  locked: false,
});

const apart = (a: string, b: string): Constraint => ({ id: `c-${a}-${b}`, kind: 'apart', a, b });
const together = (a: string, b: string): Constraint => ({
  id: `c-${a}-${b}`,
  kind: 'together',
  a,
  b,
});

describe('statusOf', () => {
  it('apart: same table violates, different tables satisfies', () => {
    expect(statusOf('apart', 't1', 't1')).toBe('violated');
    expect(statusOf('apart', 't1', 't2')).toBe('satisfied');
  });

  it('together: different tables violates, same table satisfies', () => {
    expect(statusOf('together', 't1', 't2')).toBe('violated');
    expect(statusOf('together', 't1', 't1')).toBe('satisfied');
  });

  it('an unseated guest makes either kind pending, never violated', () => {
    for (const kind of ['apart', 'together'] as const) {
      expect(statusOf(kind, null, 't1')).toBe('pending');
      expect(statusOf(kind, 't1', null)).toBe('pending');
      expect(statusOf(kind, null, null)).toBe('pending');
    }
  });
});

describe('evaluate', () => {
  it('finds nothing in an empty project', () => {
    expect(evaluate({ guests: [], constraints: [] })).toEqual([]);
  });

  it('reports an apart pair sharing a table, and names the table', () => {
    const result = evaluate({
      guests: [guest('a', 't1', 0), guest('b', 't1', 1)],
      constraints: [apart('a', 'b')],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'apart', tables: ['t1'] });
    expect(result[0]?.message).toBe('A and B must not sit together');
  });

  it('says nothing about an apart pair at different tables', () => {
    expect(
      evaluate({
        guests: [guest('a', 't1'), guest('b', 't2')],
        constraints: [apart('a', 'b')],
      }),
    ).toEqual([]);
  });

  it('reports a together pair split across tables, and names both', () => {
    const result = evaluate({
      guests: [guest('a', 't1'), guest('b', 't2')],
      constraints: [together('a', 'b')],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.tables).toEqual(['t1', 't2']);
    expect(result[0]?.message).toBe('A and B must sit together');
  });

  it('says nothing about a together pair at one table', () => {
    expect(
      evaluate({
        guests: [guest('a', 't1', 0), guest('b', 't1', 1)],
        constraints: [together('a', 'b')],
      }),
    ).toEqual([]);
  });

  it('BOTH UNSEATED is pending, not a violation — for either kind', () => {
    expect(
      evaluate({
        guests: [guest('a'), guest('b')],
        constraints: [apart('a', 'b'), together('a', 'b')],
      }),
    ).toEqual([]);
  });

  it('one seated and one not is pending too', () => {
    expect(
      evaluate({
        guests: [guest('a', 't1'), guest('b')],
        constraints: [apart('a', 'b'), together('a', 'b')],
      }),
    ).toEqual([]);
  });

  it('ignores a constraint naming a guest who no longer exists', () => {
    expect(
      evaluate({ guests: [guest('a', 't1')], constraints: [apart('a', 'ghost')] }),
    ).toEqual([]);
  });

  it('reports every broken rule, not just the first', () => {
    const result = evaluate({
      guests: [guest('a', 't1', 0), guest('b', 't1', 1), guest('c', 't1', 2)],
      constraints: [apart('a', 'b'), apart('b', 'c'), apart('a', 'c')],
    });
    expect(result).toHaveLength(3);
  });
});

describe('violation indexes', () => {
  const result = evaluate({
    guests: [guest('a', 't1', 0), guest('b', 't1', 1), guest('c', 't2')],
    constraints: [apart('a', 'b'), together('a', 'c')],
  });

  it('collects the tables to mark', () => {
    expect([...violatingTables(result)].sort()).toEqual(['t1', 't2']);
  });

  it('collects the guests to badge', () => {
    expect([...violatingGuests(result)].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('findConstraint', () => {
  it('matches a pair in either direction', () => {
    const list = [apart('a', 'b')];
    expect(findConstraint(list, 'a', 'b')?.id).toBe('c-a-b');
    expect(findConstraint(list, 'b', 'a')?.id).toBe('c-a-b');
    expect(findConstraint(list, 'a', 'c')).toBeUndefined();
  });
});

describe('performance', () => {
  it('evaluates 500 guests and 200 constraints inside one frame', () => {
    const guests: Guest[] = Array.from({ length: 500 }, (_, i) =>
      guest(`g${i}`, `t${i % 50}`, i % 10),
    );
    const constraints: Constraint[] = Array.from({ length: 200 }, (_, i) => ({
      id: `c${i}`,
      kind: i % 2 ? 'apart' : 'together',
      a: `g${i}`,
      b: `g${(i * 7 + 3) % 500}`,
    }));

    // Warm up, then measure a run of evaluations.
    evaluate({ guests, constraints });
    const start = performance.now();
    const runs = 50;
    for (let i = 0; i < runs; i++) evaluate({ guests, constraints });
    const per = (performance.now() - start) / runs;
    expect(per).toBeLessThan(16);
  });
});
