import type { Constraint, Guest, Id, Project, Table } from './types';

/**
 * Automatic seating.
 *
 * Deterministic given a seed, so the same plan and the same button press always
 * produce the same room — a planner who runs it twice and gets two different
 * answers stops trusting it.
 *
 * The shape of the problem is a constrained bin-packing, which is NP-hard, so
 * this does not search for the optimum: it builds a sensible arrangement
 * greedily and then improves it with a bounded hill climb. Being fast and
 * predictable matters more than being perfect, because the planner is going to
 * adjust it by hand afterwards anyway.
 */

export interface ArrangeOptions {
  /** 'unassigned' leaves seated guests where they are. */
  scope: 'unassigned' | 'all';
  seed: number;
  /** Iterations of the improvement pass. */
  iterations: number;
}

export const DEFAULT_ITERATIONS = 2000;

export interface Placement {
  guestId: Id;
  tableId: Id;
  index: number;
}

export interface ArrangeResult {
  placements: Placement[];
  /** Guests that could not be seated at all — the room is too small. */
  unseated: Id[];
  seatedCount: number;
  score: number;
  violations: number;
}

/** Weights from the specification; lower total is better. */
export const WEIGHTS = {
  apart: 100,
  togetherSplit: 50,
  partySplit: 10,
  seatWaste: 1,
} as const;

/** Small, fast, seeded PRNG. Same seed, same room. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class UnionFind {
  private parent = new Map<Id, Id>();

  find(id: Id): Id {
    const seen: Id[] = [];
    let current = id;
    while (this.parent.has(current) && this.parent.get(current) !== current) {
      seen.push(current);
      current = this.parent.get(current) as Id;
    }
    if (!this.parent.has(current)) this.parent.set(current, current);
    for (const node of seen) this.parent.set(node, current);
    return current;
  }

  union(a: Id, b: Id): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export interface Component {
  key: Id;
  guests: Id[];
  /** Parties represented, for the party-split part of the score. */
  parties: Set<Id>;
}

/**
 * Group guests that must end up together: everyone in a party, plus anyone
 * joined by a `together` rule. These move as one unit.
 */
export function buildComponents(guests: readonly Guest[], constraints: readonly Constraint[]): Component[] {
  const uf = new UnionFind();
  const byId = new Map(guests.map((g) => [g.id, g]));

  for (const g of guests) uf.find(g.id);
  for (const g of guests) {
    if (g.partyId) uf.union(g.id, `party:${g.partyId}`);
  }
  for (const c of constraints) {
    if (c.kind !== 'together') continue;
    if (byId.has(c.a) && byId.has(c.b)) uf.union(c.a, c.b);
  }

  const grouped = new Map<Id, Component>();
  for (const g of guests) {
    const key = uf.find(g.id);
    let component = grouped.get(key);
    if (!component) {
      component = { key, guests: [], parties: new Set() };
      grouped.set(key, component);
    }
    component.guests.push(g.id);
    if (g.partyId) component.parties.add(g.partyId);
  }
  return [...grouped.values()];
}

interface Assignment {
  /** tableId -> guest ids seated there. */
  byTable: Map<Id, Id[]>;
  guestTable: Map<Id, Id>;
}

/** Total score for a candidate arrangement. Lower is better. */
export function scoreAssignment(
  assignment: Assignment,
  tables: readonly Table[],
  constraints: readonly Constraint[],
  guests: readonly Guest[],
): number {
  let score = 0;

  for (const c of constraints) {
    const ta = assignment.guestTable.get(c.a);
    const tb = assignment.guestTable.get(c.b);
    if (ta === undefined || tb === undefined) continue;
    if (c.kind === 'apart' && ta === tb) score += WEIGHTS.apart;
    if (c.kind === 'together' && ta !== tb) score += WEIGHTS.togetherSplit;
  }

  // A party spread over N tables costs (N-1) splits.
  const partyTables = new Map<Id, Set<Id>>();
  for (const g of guests) {
    if (!g.partyId) continue;
    const table = assignment.guestTable.get(g.id);
    if (table === undefined) continue;
    let set = partyTables.get(g.partyId);
    if (!set) {
      set = new Set();
      partyTables.set(g.partyId, set);
    }
    set.add(table);
  }
  for (const set of partyTables.values()) score += WEIGHTS.partySplit * (set.size - 1);

  // Empty seats at tables that are in use: a half-full room reads as a mistake.
  for (const table of tables) {
    const seated = assignment.byTable.get(table.id)?.length ?? 0;
    if (seated > 0) score += WEIGHTS.seatWaste * (table.seats - seated);
  }

  return score;
}

export function countHardViolations(
  assignment: Assignment,
  constraints: readonly Constraint[],
): number {
  let n = 0;
  for (const c of constraints) {
    const ta = assignment.guestTable.get(c.a);
    const tb = assignment.guestTable.get(c.b);
    if (ta === undefined || tb === undefined) continue;
    if (c.kind === 'apart' && ta === tb) n++;
    if (c.kind === 'together' && ta !== tb) n++;
  }
  return n;
}

export function arrange(project: Project, options: ArrangeOptions): ArrangeResult {
  const random = mulberry32(options.seed);
  const { guests, tables, constraints } = project;

  const tableById = new Map(tables.map((t) => [t.id, t]));

  // Who is being moved, and who is nailed down.
  const frozen = new Map<Id, Id>(); // guestId -> tableId
  const movable: Guest[] = [];
  for (const g of guests) {
    const tableLocked = g.seat ? (tableById.get(g.seat.tableId)?.locked ?? false) : false;
    const keep =
      (g.seat !== null && (g.locked || tableLocked)) ||
      (options.scope === 'unassigned' && g.seat !== null);
    if (keep && g.seat) frozen.set(g.id, g.seat.tableId);
    else movable.push(g);
  }

  // Remaining capacity per table, after the frozen guests.
  const capacity = new Map<Id, number>();
  for (const t of tables) capacity.set(t.id, t.locked && options.scope === 'all' ? 0 : t.seats);
  for (const tableId of frozen.values()) {
    capacity.set(tableId, (capacity.get(tableId) ?? 0) - 1);
  }
  for (const [id, left] of capacity) capacity.set(id, Math.max(0, left));

  const assignment: Assignment = { byTable: new Map(), guestTable: new Map() };
  for (const t of tables) assignment.byTable.set(t.id, []);
  for (const [guestId, tableId] of frozen) {
    assignment.byTable.get(tableId)?.push(guestId);
    assignment.guestTable.set(guestId, tableId);
  }

  // --- greedy placement -----------------------------------------------------
  const components = buildComponents(movable, constraints)
    .slice()
    .sort((a, b) => b.guests.length - a.guests.length || a.key.localeCompare(b.key));

  const apartPairs = new Map<Id, Set<Id>>();
  for (const c of constraints) {
    if (c.kind !== 'apart') continue;
    if (!apartPairs.has(c.a)) apartPairs.set(c.a, new Set());
    if (!apartPairs.has(c.b)) apartPairs.set(c.b, new Set());
    apartPairs.get(c.a)?.add(c.b);
    apartPairs.get(c.b)?.add(c.a);
  }

  const conflicts = (guestIds: readonly Id[], tableId: Id): boolean => {
    const seated = assignment.byTable.get(tableId) ?? [];
    for (const candidate of guestIds) {
      const enemies = apartPairs.get(candidate);
      if (!enemies) continue;
      for (const other of seated) if (enemies.has(other)) return true;
      for (const other of guestIds) if (other !== candidate && enemies.has(other)) return true;
    }
    return false;
  };

  const unseated: Id[] = [];

  for (const component of components) {
    let remaining = component.guests.slice();

    while (remaining.length > 0) {
      // Prefer the table with the most room that has no `apart` clash; among
      // equals, the earliest table, so the result stays deterministic.
      let best: { id: Id; free: number } | null = null;
      for (const table of tables) {
        const free = capacity.get(table.id) ?? 0;
        if (free <= 0) continue;
        if (conflicts(remaining.slice(0, free), table.id)) continue;
        if (!best || free > best.free) best = { id: table.id, free };
      }

      if (!best) {
        // No conflict-free table: take the roomiest table that exists at all,
        // so people are still seated and the conflict is reported rather than
        // the guest silently vanishing.
        for (const table of tables) {
          const free = capacity.get(table.id) ?? 0;
          if (free > 0 && (!best || free > best.free)) best = { id: table.id, free };
        }
      }

      if (!best) {
        unseated.push(...remaining);
        break;
      }

      const take = remaining.slice(0, best.free);
      remaining = remaining.slice(best.free);
      for (const guestId of take) {
        assignment.byTable.get(best.id)?.push(guestId);
        assignment.guestTable.set(guestId, best.id);
      }
      capacity.set(best.id, (capacity.get(best.id) ?? 0) - take.length);
    }
  }

  // --- local search ---------------------------------------------------------
  const swappable = movable.map((g) => g.id).filter((id) => assignment.guestTable.has(id));
  let score = scoreAssignment(assignment, tables, constraints, guests);

  if (swappable.length > 1) {
    for (let i = 0; i < options.iterations; i++) {
      const a = swappable[Math.floor(random() * swappable.length)] as Id;
      const b = swappable[Math.floor(random() * swappable.length)] as Id;
      if (a === b) continue;
      const ta = assignment.guestTable.get(a) as Id;
      const tb = assignment.guestTable.get(b) as Id;
      if (ta === tb) continue;

      swap(assignment, a, ta, b, tb);
      const next = scoreAssignment(assignment, tables, constraints, guests);
      if (next < score) {
        score = next;
      } else {
        swap(assignment, a, tb, b, ta); // put it back
      }
    }
  }

  // --- turn tables into seats ----------------------------------------------
  const placements: Placement[] = [];
  for (const table of tables) {
    const occupants = assignment.byTable.get(table.id) ?? [];
    const takenIndices = new Set<number>();
    // Frozen guests keep their exact seat.
    for (const guestId of occupants) {
      if (!frozen.has(guestId)) continue;
      const guest = guests.find((g) => g.id === guestId);
      if (guest?.seat) takenIndices.add(guest.seat.index);
    }
    let cursor = 0;
    for (const guestId of occupants) {
      if (frozen.has(guestId)) continue;
      while (takenIndices.has(cursor) && cursor < table.seats) cursor++;
      if (cursor >= table.seats) break;
      takenIndices.add(cursor);
      placements.push({ guestId, tableId: table.id, index: cursor });
      cursor++;
    }
  }

  return {
    placements,
    unseated,
    seatedCount: placements.length,
    score,
    violations: countHardViolations(assignment, constraints),
  };
}

function swap(assignment: Assignment, a: Id, ta: Id, b: Id, tb: Id): void {
  const listA = assignment.byTable.get(ta);
  const listB = assignment.byTable.get(tb);
  if (!listA || !listB) return;
  const ia = listA.indexOf(a);
  const ib = listB.indexOf(b);
  if (ia === -1 || ib === -1) return;
  listA[ia] = b;
  listB[ib] = a;
  assignment.guestTable.set(a, tb);
  assignment.guestTable.set(b, ta);
}
