import type { Guest, Id, Party, Project, Table } from '@/model/types';
import { evaluate, type Violation } from '@/model/constraints';
import { CURRENT_VERSION } from '@/model/types';
import type { ProjectState } from './project';
import { useProjectStore } from './project';

/**
 * Derived views. Each is memoised on the identity of the arrays it reads, so a
 * pan or a text edit does not force the constraint engine to run again.
 */

function memo1<A extends object, R>(fn: (a: A) => R): (a: A) => R {
  let key: A | undefined;
  let value: R;
  return (a: A) => {
    if (a !== key) {
      key = a;
      value = fn(a);
    }
    return value;
  };
}

function memo2<A extends object, B extends object, R>(fn: (a: A, b: B) => R): (a: A, b: B) => R {
  let ka: A | undefined;
  let kb: B | undefined;
  let value: R;
  return (a: A, b: B) => {
    if (a !== ka || b !== kb) {
      ka = a;
      kb = b;
      value = fn(a, b);
    }
    return value;
  };
}

export type Occupancy = Map<Id, Map<number, Guest>>;

const buildOccupancy = memo1((guests: readonly Guest[]): Occupancy => {
  const out: Occupancy = new Map();
  for (const g of guests) {
    if (!g.seat) continue;
    let table = out.get(g.seat.tableId);
    if (!table) {
      table = new Map();
      out.set(g.seat.tableId, table);
    }
    table.set(g.seat.index, g);
  }
  return out;
});

export function occupancy(state: Pick<ProjectState, 'guests'>): Occupancy {
  return buildOccupancy(state.guests);
}

const buildUnassigned = memo1((guests: readonly Guest[]) => guests.filter((g) => !g.seat));

export function unassignedGuests(state: Pick<ProjectState, 'guests'>): Guest[] {
  return buildUnassigned(state.guests);
}

export interface TableOccupancy {
  table: Table;
  seats: number;
  seated: number;
  free: number;
  /** Index-aligned; null where the seat is empty. */
  bySeat: Array<Guest | null>;
  guests: Guest[];
}

export function tableOccupancy(
  state: Pick<ProjectState, 'guests' | 'tables'>,
  tableId: Id,
): TableOccupancy | null {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) return null;
  const seated = occupancy(state).get(tableId) ?? new Map<number, Guest>();
  const bySeat: Array<Guest | null> = [];
  for (let i = 0; i < table.seats; i++) bySeat.push(seated.get(i) ?? null);
  const guests = bySeat.filter((g): g is Guest => g !== null);
  return {
    table,
    seats: table.seats,
    seated: guests.length,
    free: table.seats - guests.length,
    bySeat,
    guests,
  };
}

const runEvaluate = memo2(
  (guests: readonly Guest[], constraints: Project['constraints']): Violation[] =>
    evaluate({ guests: guests as Guest[], constraints }),
);

export function violations(state: Pick<ProjectState, 'guests' | 'constraints'>): Violation[] {
  return runEvaluate(state.guests, state.constraints);
}

const buildPartyIndex = memo1((guests: readonly Guest[]) => {
  const out = new Map<Id, Guest[]>();
  for (const g of guests) {
    if (!g.partyId) continue;
    const list = out.get(g.partyId);
    if (list) list.push(g);
    else out.set(g.partyId, [g]);
  }
  return out;
});

export function guestsByParty(state: Pick<ProjectState, 'guests'>): Map<Id, Guest[]> {
  return buildPartyIndex(state.guests);
}

const buildPartyLookup = memo1((parties: readonly Party[]) => {
  const out = new Map<Id, Party>();
  for (const p of parties) out.set(p.id, p);
  return out;
});

export function partyLookup(state: Pick<ProjectState, 'parties'>): Map<Id, Party> {
  return buildPartyLookup(state.parties);
}

export interface Counters {
  guests: number;
  seated: number;
  unassigned: number;
  tables: number;
  capacity: number;
}

export function counters(state: Pick<ProjectState, 'guests' | 'tables'>): Counters {
  const seated = state.guests.length - unassignedGuests(state).length;
  return {
    guests: state.guests.length,
    seated,
    unassigned: state.guests.length - seated,
    tables: state.tables.length,
    capacity: state.tables.reduce((n, t) => n + t.seats, 0),
  };
}

/** The full Project object, for save and export. */
export function toProject(state: ProjectState): Project {
  return {
    version: CURRENT_VERSION,
    event: state.event,
    guests: state.guests,
    parties: state.parties,
    tables: state.tables,
    constraints: state.constraints,
    canvas: state.canvas,
  };
}

export function getProject(): Project {
  return toProject(useProjectStore.getState());
}
