import { create } from 'zustand';
import { temporal } from 'zundo';
import { nanoid } from 'nanoid';
import type {
  Constraint,
  ConstraintKind,
  Guest,
  Id,
  Party,
  Project,
  Table,
  TableShape,
} from '@/model/types';
import { CURRENT_VERSION, emptyProject } from '@/model/types';
import { defaultSeats, seatRange } from '@/model/seating';
import { findConstraint } from '@/model/constraints';

/**
 * The store is flat — event/guests/parties/tables/constraints/canvas at the top
 * level — because zundo's history works on top-level slices. `canvas` is
 * deliberately outside the undo partition: panning is not an edit.
 */

export interface DocSlice {
  event: Project['event'];
  guests: Guest[];
  parties: Party[];
  tables: Table[];
  constraints: Constraint[];
}

export interface ProjectState extends DocSlice {
  version: typeof CURRENT_VERSION;
  canvas: Project['canvas'];

  // --- guests ---
  addGuest: (name: string, patch?: Partial<Omit<Guest, 'id'>>) => Id;
  addGuests: (guests: Array<Partial<Guest> & { name: string }>) => Id[];
  updateGuest: (id: Id, patch: Partial<Omit<Guest, 'id'>>) => void;
  removeGuests: (ids: Id[]) => void;

  // --- parties ---
  groupAsParty: (guestIds: Id[], label: string) => Id | null;
  updateParty: (id: Id, label: string) => void;
  ungroup: (guestIds: Id[]) => void;

  // --- tables ---
  addTable: (shape: TableShape, at?: { x: number; y: number }, seats?: number) => Id;
  updateTable: (id: Id, patch: Partial<Omit<Table, 'id'>>) => void;
  moveTable: (id: Id, x: number, y: number) => void;
  moveTables: (moves: Array<{ id: Id; x: number; y: number }>) => void;
  removeTables: (ids: Id[]) => void;
  duplicateTables: (ids: Id[]) => Id[];

  // --- assignment ---
  assign: (guestId: Id, tableId: Id, index: number) => boolean;
  assignMany: (pairs: Array<{ guestId: Id; tableId: Id; index: number }>) => boolean;
  unassign: (guestIds: Id[]) => void;
  swapSeats: (aId: Id, bId: Id) => void;

  // --- constraints ---
  addConstraint: (kind: ConstraintKind, a: Id, b: Id) => Id | null;
  removeConstraint: (id: Id) => void;

  // --- document ---
  setEvent: (patch: Partial<Project['event']>) => void;
  setCanvas: (patch: Partial<Project['canvas']>) => void;
  replaceProject: (project: Project) => void;
  newProject: () => void;
}

function clampSeats(shape: TableShape, seats: number): number {
  const { min, max } = seatRange(shape);
  return Math.min(max, Math.max(min, Math.round(seats)));
}

function nextTableLabel(tables: readonly Table[], shape: TableShape): string {
  if (shape === 'sweetheart') return 'Sweetheart';
  if (shape === 'head') {
    const heads = tables.filter((t) => t.shape === 'head').length;
    return heads === 0 ? 'Head table' : `Head table ${heads + 1}`;
  }
  let n = tables.length + 1;
  const used = new Set(tables.map((t) => t.label));
  while (used.has(`Table ${n}`)) n++;
  return `Table ${n}`;
}

/** A seat is free if no *other* guest holds it. */
function seatTaken(guests: readonly Guest[], tableId: Id, index: number, except?: Id): boolean {
  return guests.some(
    (g) => g.id !== except && g.seat?.tableId === tableId && g.seat.index === index,
  );
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set, get) => ({
      ...emptyProject(),

      addGuest: (name, patch) => {
        const id = nanoid();
        const guest: Guest = {
          id,
          name: name.trim(),
          partyId: null,
          tags: [],
          notes: '',
          seat: null,
          locked: false,
          ...patch,
        };
        set((s) => ({ guests: [...s.guests, guest] }));
        return id;
      },

      addGuests: (incoming) => {
        const created: Guest[] = incoming.map((g) => ({
          id: g.id ?? nanoid(),
          name: g.name.trim(),
          partyId: g.partyId ?? null,
          tags: g.tags ?? [],
          notes: g.notes ?? '',
          seat: g.seat ?? null,
          locked: g.locked ?? false,
        }));
        set((s) => ({ guests: [...s.guests, ...created] }));
        return created.map((g) => g.id);
      },

      updateGuest: (id, patch) =>
        set((s) => ({
          guests: s.guests.map((g) => (g.id === id ? { ...g, ...patch, id: g.id } : g)),
        })),

      removeGuests: (ids) => {
        const kill = new Set(ids);
        set((s) => {
          const guests = s.guests.filter((g) => !kill.has(g.id));
          const liveParties = new Set(guests.map((g) => g.partyId).filter(Boolean) as Id[]);
          return {
            guests,
            parties: s.parties.filter((p) => liveParties.has(p.id)),
            constraints: s.constraints.filter((c) => !kill.has(c.a) && !kill.has(c.b)),
          };
        });
      },

      groupAsParty: (guestIds, label) => {
        const ids = new Set(guestIds);
        if (ids.size === 0) return null;
        const party: Party = { id: nanoid(), label: label.trim() || 'Party' };
        // One `set`, so this is one undo step even though it touches two slices.
        set((s) => {
          const guests = s.guests.map((g) => (ids.has(g.id) ? { ...g, partyId: party.id } : g));
          const live = new Set(guests.map((g) => g.partyId).filter(Boolean) as Id[]);
          return {
            guests,
            parties: [...s.parties, party].filter((p) => live.has(p.id)),
          };
        });
        return party.id;
      },

      updateParty: (id, label) =>
        set((s) => ({
          parties: s.parties.map((p) => (p.id === id ? { ...p, label } : p)),
        })),

      ungroup: (guestIds) => {
        const ids = new Set(guestIds);
        set((s) => {
          const guests = s.guests.map((g) => (ids.has(g.id) ? { ...g, partyId: null } : g));
          const live = new Set(guests.map((g) => g.partyId).filter(Boolean) as Id[]);
          return { guests, parties: s.parties.filter((p) => live.has(p.id)) };
        });
      },

      addTable: (shape, at, seats) => {
        const id = nanoid();
        const state = get();
        const table: Table = {
          id,
          label: nextTableLabel(state.tables, shape),
          shape,
          seats: clampSeats(shape, seats ?? defaultSeats(shape)),
          x: at?.x ?? 0,
          y: at?.y ?? 0,
          rotation: 0,
          locked: false,
        };
        set((s) => ({ tables: [...s.tables, table] }));
        return id;
      },

      updateTable: (id, patch) =>
        set((s) => {
          const tables = s.tables.map((t) => {
            if (t.id !== id) return t;
            const shape = patch.shape ?? t.shape;
            const next: Table = { ...t, ...patch, id: t.id, shape };
            next.seats = clampSeats(shape, patch.seats ?? (patch.shape ? defaultSeats(shape) : t.seats));
            return next;
          });
          const table = tables.find((t) => t.id === id);
          if (!table) return { tables };
          // Anyone sitting past the new seat count returns to the pool.
          const guests = s.guests.map((g) =>
            g.seat?.tableId === id && g.seat.index >= table.seats ? { ...g, seat: null } : g,
          );
          return { tables, guests };
        }),

      // A drag that ends where it started must not become an undo step, so
      // these bail out with the identical array when nothing actually moved.
      moveTable: (id, x, y) =>
        set((s) => {
          const current = s.tables.find((t) => t.id === id);
          if (!current || (current.x === x && current.y === y)) return {};
          return { tables: s.tables.map((t) => (t.id === id ? { ...t, x, y } : t)) };
        }),

      moveTables: (moves) =>
        set((s) => {
          const byId = new Map(moves.map((m) => [m.id, m]));
          const changed = s.tables.some((t) => {
            const m = byId.get(t.id);
            return m !== undefined && (m.x !== t.x || m.y !== t.y);
          });
          if (!changed) return {};
          return {
            tables: s.tables.map((t) => {
              const m = byId.get(t.id);
              return m ? { ...t, x: m.x, y: m.y } : t;
            }),
          };
        }),

      removeTables: (ids) => {
        const kill = new Set(ids);
        set((s) => ({
          tables: s.tables.filter((t) => !kill.has(t.id)),
          guests: s.guests.map((g) =>
            g.seat && kill.has(g.seat.tableId) ? { ...g, seat: null } : g,
          ),
        }));
      },

      duplicateTables: (ids) => {
        const kill = new Set(ids);
        const state = get();
        const copies: Table[] = [];
        for (const t of state.tables) {
          if (!kill.has(t.id)) continue;
          copies.push({
            ...t,
            id: nanoid(),
            label: nextTableLabel([...state.tables, ...copies], t.shape),
            x: t.x + 8,
            y: t.y + 8,
            locked: false,
          });
        }
        if (copies.length) set((s) => ({ tables: [...s.tables, ...copies] }));
        return copies.map((t) => t.id);
      },

      assign: (guestId, tableId, index) => {
        const s = get();
        const table = s.tables.find((t) => t.id === tableId);
        if (!table) return false;
        if (index < 0 || index >= table.seats) return false;
        if (seatTaken(s.guests, tableId, index, guestId)) return false;
        set((st) => ({
          guests: st.guests.map((g) =>
            g.id === guestId ? { ...g, seat: { tableId, index } } : g,
          ),
        }));
        return true;
      },

      assignMany: (pairs) => {
        const s = get();
        const moving = new Set(pairs.map((p) => p.guestId));
        const claimed = new Set<string>();
        for (const p of pairs) {
          const table = s.tables.find((t) => t.id === p.tableId);
          if (!table) return false;
          if (p.index < 0 || p.index >= table.seats) return false;
          const key = `${p.tableId}#${p.index}`;
          if (claimed.has(key)) return false;
          claimed.add(key);
          const blocked = s.guests.some(
            (g) =>
              !moving.has(g.id) && g.seat?.tableId === p.tableId && g.seat.index === p.index,
          );
          if (blocked) return false;
        }
        const byGuest = new Map(pairs.map((p) => [p.guestId, p]));
        set((st) => ({
          guests: st.guests.map((g) => {
            const p = byGuest.get(g.id);
            return p ? { ...g, seat: { tableId: p.tableId, index: p.index } } : g;
          }),
        }));
        return true;
      },

      unassign: (guestIds) => {
        const ids = new Set(guestIds);
        set((s) => ({
          guests: s.guests.map((g) => (ids.has(g.id) ? { ...g, seat: null } : g)),
        }));
      },

      swapSeats: (aId, bId) =>
        set((s) => {
          const a = s.guests.find((g) => g.id === aId);
          const b = s.guests.find((g) => g.id === bId);
          if (!a || !b) return {};
          return {
            guests: s.guests.map((g) => {
              if (g.id === aId) return { ...g, seat: b.seat };
              if (g.id === bId) return { ...g, seat: a.seat };
              return g;
            }),
          };
        }),

      addConstraint: (kind, a, b) => {
        if (a === b) return null;
        const s = get();
        const existing = findConstraint(s.constraints, a, b);
        if (existing) {
          if (existing.kind === kind) return existing.id;
          // Flip an existing rule rather than holding two contradictory ones.
          set((st) => ({
            constraints: st.constraints.map((c) =>
              c.id === existing.id ? { ...c, kind } : c,
            ),
          }));
          return existing.id;
        }
        const constraint: Constraint = { id: nanoid(), kind, a, b };
        set((st) => ({ constraints: [...st.constraints, constraint] }));
        return constraint.id;
      },

      removeConstraint: (id) =>
        set((s) => ({ constraints: s.constraints.filter((c) => c.id !== id) })),

      setEvent: (patch) => set((s) => ({ event: { ...s.event, ...patch } })),

      setCanvas: (patch) => set((s) => ({ canvas: { ...s.canvas, ...patch } })),

      replaceProject: (project) =>
        set({
          version: CURRENT_VERSION,
          event: project.event,
          guests: project.guests,
          parties: project.parties,
          tables: project.tables,
          constraints: project.constraints,
          canvas: project.canvas,
        }),

      newProject: () => set({ ...emptyProject() }),
    }),
    {
      limit: 50,
      partialize: (state): DocSlice => ({
        event: state.event,
        guests: state.guests,
        parties: state.parties,
        tables: state.tables,
        constraints: state.constraints,
      }),
      equality: (a, b) =>
        a.event === b.event &&
        a.guests === b.guests &&
        a.parties === b.parties &&
        a.tables === b.tables &&
        a.constraints === b.constraints,
      handleSet: (handleSet) => throttle(handleSet, 300),
    },
  ),
);

/** Leading-edge throttle: the first state in a burst is the one kept. */
function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...(args as never[]));
  }) as T;
}

// ---------------------------------------------------------------------------
// History grouping
// ---------------------------------------------------------------------------

let groupDepth = 0;
let groupSnapshot: DocSlice | null = null;

function snapshot(): DocSlice {
  const s = useProjectStore.getState();
  return {
    event: s.event,
    guests: s.guests,
    parties: s.parties,
    tables: s.tables,
    constraints: s.constraints,
  };
}

/**
 * Collapse everything inside into exactly one undo step. A table drag emits
 * dozens of `moveTable` calls; the user thinks of it as one move, and undo
 * should agree.
 */
export function withHistoryGroup<T>(fn: () => T): T {
  const temporalStore = useProjectStore.temporal;
  if (groupDepth === 0) {
    groupSnapshot = snapshot();
    temporalStore.getState().pause();
  }
  groupDepth++;
  try {
    return fn();
  } finally {
    groupDepth--;
    if (groupDepth === 0) commitGroup();
  }
}

/** Imperative form, for gestures that span many events (pointer drags). */
export function beginHistoryGroup(): void {
  if (groupDepth === 0) {
    groupSnapshot = snapshot();
    useProjectStore.temporal.getState().pause();
  }
  groupDepth++;
}

export function endHistoryGroup(): void {
  if (groupDepth === 0) return;
  groupDepth--;
  if (groupDepth === 0) commitGroup();
}

function commitGroup(): void {
  const temporalStore = useProjectStore.temporal;
  temporalStore.getState().resume();
  const before = groupSnapshot;
  groupSnapshot = null;
  if (!before) return;
  const after = snapshot();
  const unchanged =
    before.event === after.event &&
    before.guests === after.guests &&
    before.parties === after.parties &&
    before.tables === after.tables &&
    before.constraints === after.constraints;
  if (unchanged) return;
  const t = temporalStore.getState();
  temporalStore.setState({
    pastStates: [...t.pastStates, before].slice(-50),
    futureStates: [],
  });
}

export function undo(): void {
  useProjectStore.temporal.getState().undo();
}

export function redo(): void {
  useProjectStore.temporal.getState().redo();
}

export function clearHistory(): void {
  useProjectStore.temporal.getState().clear();
}
