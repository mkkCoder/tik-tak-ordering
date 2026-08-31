import type { Constraint, Id, Project } from './types';

/**
 * The constraint engine. One pure function, no store, no React — so it can be
 * tested exhaustively and called from auto-arrange's inner loop.
 */

export interface Violation {
  constraintId: Id;
  kind: Constraint['kind'];
  /** Guest ids involved. */
  guests: [Id, Id];
  /** Tables to mark. For `apart` this is the shared table; for `together`, both. */
  tables: Id[];
  message: string;
}

export type ConstraintStatus = 'violated' | 'satisfied' | 'pending';

/**
 * `apart` is violated when both guests sit at the same table.
 * `together` is violated when both are seated, at different tables.
 * Anything with an unseated guest is pending — not yet a violation.
 */
export function statusOf(
  kind: Constraint['kind'],
  tableA: Id | null,
  tableB: Id | null,
): ConstraintStatus {
  if (tableA === null || tableB === null) return 'pending';
  const same = tableA === tableB;
  if (kind === 'apart') return same ? 'violated' : 'satisfied';
  return same ? 'satisfied' : 'violated';
}

export function evaluate(project: Pick<Project, 'guests' | 'constraints'>): Violation[] {
  // One pass to index seats, then O(constraints).
  const tableOf = new Map<Id, Id | null>();
  const nameOf = new Map<Id, string>();
  for (const g of project.guests) {
    tableOf.set(g.id, g.seat ? g.seat.tableId : null);
    nameOf.set(g.id, g.name);
  }

  const out: Violation[] = [];
  for (const c of project.constraints) {
    const ta = tableOf.get(c.a);
    const tb = tableOf.get(c.b);
    // A constraint referring to a deleted guest is inert, not broken.
    if (ta === undefined || tb === undefined) continue;
    if (statusOf(c.kind, ta, tb) !== 'violated') continue;

    const a = nameOf.get(c.a) ?? 'Guest';
    const b = nameOf.get(c.b) ?? 'Guest';
    if (c.kind === 'apart') {
      out.push({
        constraintId: c.id,
        kind: c.kind,
        guests: [c.a, c.b],
        tables: ta ? [ta] : [],
        message: `${a} and ${b} must not sit together`,
      });
    } else {
      const tables = [ta, tb].filter((t): t is Id => t !== null);
      out.push({
        constraintId: c.id,
        kind: c.kind,
        guests: [c.a, c.b],
        tables,
        message: `${a} and ${b} must sit together`,
      });
    }
  }
  return out;
}

/** Tables carrying at least one violation. */
export function violatingTables(violations: readonly Violation[]): Set<Id> {
  const s = new Set<Id>();
  for (const v of violations) for (const t of v.tables) s.add(t);
  return s;
}

/** Guests carrying at least one violation. */
export function violatingGuests(violations: readonly Violation[]): Set<Id> {
  const s = new Set<Id>();
  for (const v of violations) {
    s.add(v.guests[0]);
    s.add(v.guests[1]);
  }
  return s;
}

/** Existing constraint between two guests, in either direction. */
export function findConstraint(
  constraints: readonly Constraint[],
  a: Id,
  b: Id,
): Constraint | undefined {
  return constraints.find(
    (c) => (c.a === a && c.b === b) || (c.a === b && c.b === a),
  );
}
