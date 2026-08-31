import type { Table, TableShape } from './types';

/**
 * Geometry for the floor plan. One plan unit = 10cm.
 *
 * Everything here is pure: given a table, produce its footprint and the
 * position of each seat. The canvas renders from these numbers, the PDF
 * exporter draws from the same ones, so print and screen cannot drift apart.
 */

export const UNITS_PER_METER = 10;

/** Radius of a drawn chair, in plan units. */
export const SEAT_RADIUS = 2.1;

/** Gap between the table edge and the centre of a chair. */
const SEAT_GAP = 3.2;

/** Comfortable elbow room per person, in plan units (60cm). */
const SEAT_PITCH = 6;

export interface Point {
  x: number;
  y: number;
}

export interface SeatPosition extends Point {
  index: number;
  /** Outward angle in degrees, for orienting labels and cards. */
  angle: number;
}

export interface Footprint {
  /** Round tables use radius; the rest use width/height. */
  kind: 'circle' | 'rect';
  radius: number;
  width: number;
  height: number;
}

export const SHAPE_LABELS: Record<TableShape, string> = {
  round: 'Round',
  rect: 'Rectangular',
  head: 'Head table',
  sweetheart: 'Sweetheart',
};

export function defaultSeats(shape: TableShape): number {
  switch (shape) {
    case 'round':
      return 10;
    case 'rect':
      return 8;
    case 'head':
      return 6;
    case 'sweetheart':
      return 2;
  }
}

export function seatRange(shape: TableShape): { min: number; max: number } {
  switch (shape) {
    case 'round':
      return { min: 2, max: 16 };
    case 'rect':
      return { min: 2, max: 24 };
    case 'head':
      return { min: 2, max: 20 };
    case 'sweetheart':
      return { min: 1, max: 2 };
  }
}

export function footprint(table: Pick<Table, 'shape' | 'seats'>): Footprint {
  const seats = Math.max(1, table.seats);
  switch (table.shape) {
    case 'round': {
      // Enough circumference to give every chair its pitch, never smaller than 120cm.
      const radius = Math.max(6, (seats * SEAT_PITCH) / (2 * Math.PI));
      return { kind: 'circle', radius, width: radius * 2, height: radius * 2 };
    }
    case 'rect': {
      const perSide = Math.ceil(seats / 2);
      return { kind: 'rect', radius: 0, width: Math.max(12, perSide * SEAT_PITCH), height: 9 };
    }
    case 'head': {
      return { kind: 'rect', radius: 0, width: Math.max(12, seats * SEAT_PITCH), height: 7.5 };
    }
    case 'sweetheart': {
      return { kind: 'rect', radius: 0, width: 12, height: 7.5 };
    }
  }
}

/** Longest half-extent, used for hit-testing and marquee bounds. */
export function tableReach(table: Pick<Table, 'shape' | 'seats'>): number {
  const f = footprint(table);
  if (f.kind === 'circle') return f.radius + SEAT_GAP + SEAT_RADIUS;
  return Math.hypot(f.width / 2, f.height / 2) + SEAT_GAP + SEAT_RADIUS;
}

function rotate(p: Point, degrees: number): Point {
  if (!degrees) return p;
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

/**
 * Seat positions in local table space (origin at the table centre, before rotation).
 * Seat order walks the perimeter, so consecutive indices are neighbours — which is
 * what makes "seat this party in consecutive seats" mean something at the table.
 */
export function localSeatPositions(table: Pick<Table, 'shape' | 'seats'>): SeatPosition[] {
  const seats = Math.max(0, Math.floor(table.seats));
  const f = footprint(table);
  const out: SeatPosition[] = [];

  if (table.shape === 'round') {
    const r = f.radius + SEAT_GAP;
    for (let i = 0; i < seats; i++) {
      const deg = -90 + (360 * i) / seats;
      const rad = (deg * Math.PI) / 180;
      out.push({ index: i, x: Math.cos(rad) * r, y: Math.sin(rad) * r, angle: deg });
    }
    return out;
  }

  const halfW = f.width / 2;
  const halfH = f.height / 2;
  const y = halfH + SEAT_GAP;

  if (table.shape === 'head' || table.shape === 'sweetheart') {
    // One side only, so the party faces the room.
    for (let i = 0; i < seats; i++) {
      const t = seats === 1 ? 0.5 : i / (seats - 1);
      const x = -halfW + SEAT_PITCH / 2 + t * (f.width - SEAT_PITCH);
      out.push({ index: i, x, y: -y, angle: -90 });
    }
    return out;
  }

  // Rectangular: top side left-to-right, then bottom side right-to-left,
  // so index 0 and the last index are neighbours around the corner.
  const top = Math.ceil(seats / 2);
  const bottom = seats - top;
  for (let i = 0; i < top; i++) {
    const t = top === 1 ? 0.5 : i / (top - 1);
    const x = -halfW + SEAT_PITCH / 2 + t * (f.width - SEAT_PITCH);
    out.push({ index: i, x, y: -y, angle: -90 });
  }
  for (let i = 0; i < bottom; i++) {
    const t = bottom === 1 ? 0.5 : i / (bottom - 1);
    const x = halfW - SEAT_PITCH / 2 - t * (f.width - SEAT_PITCH);
    out.push({ index: top + i, x, y, angle: 90 });
  }
  return out;
}

/** Seat positions in plan space, with the table's rotation and position applied. */
export function seatPositions(table: Table): SeatPosition[] {
  return localSeatPositions(table).map((s) => {
    const p = rotate({ x: s.x, y: s.y }, table.rotation);
    return {
      index: s.index,
      x: table.x + p.x,
      y: table.y + p.y,
      angle: s.angle + table.rotation,
    };
  });
}

/** Index of the free seat closest to a point in plan space, or null if the table is full. */
export function nearestFreeSeat(table: Table, taken: ReadonlySet<number>, at: Point): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const s of seatPositions(table)) {
    if (taken.has(s.index)) continue;
    const d = (s.x - at.x) ** 2 + (s.y - at.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = s.index;
    }
  }
  return best;
}

/**
 * The longest run of consecutive free seats that can hold `size` people,
 * starting as close as possible to `at`. Returns the seat indices, or null.
 * Round and rectangular tables wrap around; head tables do not.
 */
export function consecutiveFreeSeats(
  table: Table,
  taken: ReadonlySet<number>,
  size: number,
  at?: Point,
): number[] | null {
  const total = Math.floor(table.seats);
  if (size <= 0 || size > total - taken.size) return null;
  const wraps = table.shape === 'round' || table.shape === 'rect';
  const positions = seatPositions(table);

  const runs: number[][] = [];
  const limit = wraps ? total : total - size + 1;
  for (let start = 0; start < Math.max(0, limit); start++) {
    const run: number[] = [];
    for (let k = 0; k < size; k++) {
      const idx = (start + k) % total;
      if (taken.has(idx)) break;
      run.push(idx);
    }
    if (run.length === size) runs.push(run);
  }
  if (runs.length === 0) return null;
  if (!at) return runs[0] ?? null;

  let best = runs[0] as number[];
  let bestDist = Infinity;
  for (const run of runs) {
    const first = positions[run[0] as number];
    if (!first) continue;
    const d = (first.x - at.x) ** 2 + (first.y - at.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = run;
    }
  }
  return best;
}
