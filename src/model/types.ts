export type Id = string; // nanoid

export interface Guest {
  id: Id;
  name: string;
  partyId: Id | null; // family/unit that arrives together
  tags: string[]; // "bride side", "vegetarian", "kids"
  notes: string;
  seat: { tableId: Id; index: number } | null;
  locked: boolean; // auto-arrange won't touch
}

export interface Party {
  id: Id;
  label: string;
}

export type TableShape = 'round' | 'rect' | 'head' | 'sweetheart';

export interface Table {
  id: Id;
  label: string;
  shape: TableShape;
  seats: number;
  x: number;
  y: number; // center, in plan units
  rotation: number; // degrees
  locked: boolean;
}

export type ConstraintKind = 'together' | 'apart';

export interface Constraint {
  id: Id;
  kind: ConstraintKind;
  a: Id;
  b: Id;
}

export interface Project {
  version: 1;
  event: { name: string; date: string | null; venue: string };
  guests: Guest[];
  parties: Party[];
  tables: Table[];
  constraints: Constraint[];
  canvas: { zoom: number; panX: number; panY: number };
}

export const CURRENT_VERSION = 1 as const;

export function emptyProject(): Project {
  return {
    version: CURRENT_VERSION,
    event: { name: 'Untitled event', date: null, venue: '' },
    guests: [],
    parties: [],
    tables: [],
    constraints: [],
    canvas: { zoom: 1, panX: 0, panY: 0 },
  };
}
