import { describe, expect, it } from 'vitest';
import {
  consecutiveFreeSeats,
  footprint,
  localSeatPositions,
  nearestFreeSeat,
  seatPositions,
  tableReach,
} from './seating';
import type { Table } from './types';

const table = (over: Partial<Table> = {}): Table => ({
  id: 't',
  label: 'T',
  shape: 'round',
  seats: 10,
  x: 0,
  y: 0,
  rotation: 0,
  locked: false,
  ...over,
});

describe('footprint', () => {
  it('grows a round table with its seat count', () => {
    const small = footprint(table({ seats: 6 }));
    const large = footprint(table({ seats: 12 }));
    expect(large.radius).toBeGreaterThan(small.radius);
  });

  it('never shrinks a round table below a usable minimum', () => {
    expect(footprint(table({ seats: 2 })).radius).toBe(6);
  });

  it('lays a rectangular table out along its long sides', () => {
    const f = footprint(table({ shape: 'rect', seats: 8 }));
    expect(f.kind).toBe('rect');
    expect(f.width).toBeGreaterThan(f.height);
  });
});

describe('seat positions', () => {
  it('produces one position per seat', () => {
    for (const seats of [1, 2, 6, 10, 16]) {
      expect(localSeatPositions(table({ seats }))).toHaveLength(seats);
    }
  });

  it('spaces round seats evenly on a circle', () => {
    const positions = localSeatPositions(table({ seats: 8 }));
    const radii = positions.map((p) => Math.hypot(p.x, p.y));
    for (const r of radii) expect(r).toBeCloseTo(radii[0] as number, 6);

    const gaps = positions.map((p, i) => {
      const next = positions[(i + 1) % positions.length];
      if (!next) return 0;
      return Math.hypot(next.x - p.x, next.y - p.y);
    });
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0] as number, 6);
  });

  it('puts head-table seats all on one side', () => {
    const positions = localSeatPositions(table({ shape: 'head', seats: 6 }));
    expect(positions.every((p) => p.y < 0)).toBe(true);
  });

  it('puts rectangular seats on both long sides', () => {
    const positions = localSeatPositions(table({ shape: 'rect', seats: 8 }));
    expect(positions.filter((p) => p.y < 0)).toHaveLength(4);
    expect(positions.filter((p) => p.y > 0)).toHaveLength(4);
  });

  it('orders rectangular seats around the perimeter, so neighbours are adjacent', () => {
    const positions = localSeatPositions(table({ shape: 'rect', seats: 8 }));
    // Top row runs left to right, bottom row runs back right to left.
    const top = positions.slice(0, 4);
    const bottom = positions.slice(4);
    expect(top.map((p) => p.x)).toEqual([...top.map((p) => p.x)].sort((a, b) => a - b));
    expect(bottom.map((p) => p.x)).toEqual([...bottom.map((p) => p.x)].sort((a, b) => b - a));
  });

  it('applies position and rotation in plan space', () => {
    const moved = seatPositions(table({ seats: 4, x: 100, y: 50 }));
    const centreX = moved.reduce((n, p) => n + p.x, 0) / moved.length;
    const centreY = moved.reduce((n, p) => n + p.y, 0) / moved.length;
    expect(centreX).toBeCloseTo(100, 6);
    expect(centreY).toBeCloseTo(50, 6);

    const spun = seatPositions(table({ seats: 4, rotation: 90 }));
    const first = spun[0];
    // Seat 0 starts due north; a quarter turn puts it due east.
    expect(first?.x).toBeGreaterThan(0);
    expect(Math.abs(first?.y ?? 1)).toBeLessThan(1e-6);
  });

  it('reach covers the chairs, not just the table top', () => {
    const t = table({ seats: 10 });
    expect(tableReach(t)).toBeGreaterThan(footprint(t).radius);
  });
});

describe('nearestFreeSeat', () => {
  it('picks the free seat closest to the drop point', () => {
    const t = table({ seats: 4 }); // seats at N, E, S, W
    const east = seatPositions(t)[1];
    expect(nearestFreeSeat(t, new Set(), { x: east?.x ?? 0, y: east?.y ?? 0 })).toBe(1);
  });

  it('skips taken seats', () => {
    const t = table({ seats: 4 });
    const east = seatPositions(t)[1];
    const chosen = nearestFreeSeat(t, new Set([1]), { x: east?.x ?? 0, y: east?.y ?? 0 });
    expect(chosen).not.toBe(1);
    expect(chosen).not.toBeNull();
  });

  it('returns null when the table is full', () => {
    const t = table({ seats: 3 });
    expect(nearestFreeSeat(t, new Set([0, 1, 2]), { x: 0, y: 0 })).toBeNull();
  });
});

describe('consecutiveFreeSeats', () => {
  it('finds a run the right size', () => {
    const run = consecutiveFreeSeats(table({ seats: 10 }), new Set(), 4);
    expect(run).toHaveLength(4);
    expect(run).toEqual([0, 1, 2, 3]);
  });

  it('refuses when the table has too few free seats overall', () => {
    expect(consecutiveFreeSeats(table({ seats: 6 }), new Set([0, 1, 2]), 4)).toBeNull();
  });

  it('refuses when free seats exist but are not consecutive', () => {
    // Every other seat taken: five free, but never two in a row.
    const taken = new Set([1, 3, 5, 7, 9]);
    expect(consecutiveFreeSeats(table({ seats: 10 }), taken, 2)).toBeNull();
    expect(consecutiveFreeSeats(table({ seats: 10 }), taken, 1)).toHaveLength(1);
  });

  it('wraps around a round table', () => {
    const taken = new Set([2, 3, 4, 5, 6, 7]);
    const run = consecutiveFreeSeats(table({ seats: 10 }), taken, 4);
    expect(run).toEqual([8, 9, 0, 1]);
  });

  it('does not wrap a head table, where the ends are not neighbours', () => {
    const t = table({ shape: 'head', seats: 6 });
    expect(consecutiveFreeSeats(t, new Set([2, 3]), 4)).toBeNull();
    expect(consecutiveFreeSeats(t, new Set([4, 5]), 4)).toEqual([0, 1, 2, 3]);
  });

  it('prefers the run nearest the drop point', () => {
    const t = table({ seats: 12 });
    const positions = seatPositions(t);
    const target = positions[6];
    const run = consecutiveFreeSeats(t, new Set(), 2, { x: target?.x ?? 0, y: target?.y ?? 0 });
    expect(run?.[0]).toBe(6);
  });

  it('refuses a party of zero or a party larger than the table', () => {
    expect(consecutiveFreeSeats(table({ seats: 4 }), new Set(), 0)).toBeNull();
    expect(consecutiveFreeSeats(table({ seats: 4 }), new Set(), 5)).toBeNull();
  });
});
