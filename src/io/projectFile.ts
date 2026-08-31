import { z } from 'zod';
import type { Project } from '@/model/types';
import { CURRENT_VERSION, emptyProject } from '@/model/types';

/**
 * Reading and writing .tiktak.json. Project files will outlive this schema, so
 * everything here is defensive: unknown shapes are rejected with a message a
 * non-technical person can act on, and a corrupt file never replaces good work.
 */

export const STORAGE_KEY = 'tiktak:project';

const idSchema = z.string().min(1);

const guestSchema = z.object({
  id: idSchema,
  name: z.string(),
  partyId: idSchema.nullable().catch(null),
  tags: z.array(z.string()).catch([]),
  notes: z.string().catch(''),
  seat: z
    .object({ tableId: idSchema, index: z.number().int().min(0) })
    .nullable()
    .catch(null),
  locked: z.boolean().catch(false),
});

const partySchema = z.object({ id: idSchema, label: z.string() });

const tableSchema = z.object({
  id: idSchema,
  label: z.string(),
  shape: z.enum(['round', 'rect', 'head', 'sweetheart']),
  seats: z.number().int().min(0).max(64),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite().catch(0),
  locked: z.boolean().catch(false),
});

const constraintSchema = z.object({
  id: idSchema,
  kind: z.enum(['together', 'apart']),
  a: idSchema,
  b: idSchema,
});

export const projectSchema = z.object({
  version: z.number().int().min(1),
  event: z.object({
    name: z.string().catch('Untitled event'),
    date: z.string().nullable().catch(null),
    venue: z.string().catch(''),
  }),
  guests: z.array(guestSchema),
  parties: z.array(partySchema),
  tables: z.array(tableSchema),
  constraints: z.array(constraintSchema),
  canvas: z
    .object({
      zoom: z.number().finite().min(0.05).max(20).catch(1),
      panX: z.number().finite().catch(0),
      panY: z.number().finite().catch(0),
    })
    .catch({ zoom: 1, panX: 0, panY: 0 }),
});

export class ProjectFileError extends Error {}

/**
 * Bring an older file up to the current schema. Version 1 is the first, so
 * there is nothing to do yet — but the branch exists from day one, because the
 * moment it is needed is the moment it is too late to add.
 */
function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) {
    throw new ProjectFileError("That file isn't a TIKTAK project.");
  }
  const doc = raw as Record<string, unknown>;
  const version = typeof doc.version === 'number' ? doc.version : 0;

  if (version > CURRENT_VERSION) {
    throw new ProjectFileError(
      'This project was saved by a newer version of TIKTAK. Reload the page and try again.',
    );
  }

  let out = doc;
  if (version < 1) {
    // Pre-versioned files: assume the v1 shape and let validation judge it.
    out = { ...out, version: 1 };
  }
  return out;
}

/**
 * Repair references that validation alone cannot catch: a seat pointing at a
 * table that is gone, a party with no members, a constraint naming a deleted
 * guest. A file that survives this is guaranteed internally consistent.
 */
function reconcile(project: Project): Project {
  const tables = new Map(project.tables.map((t) => [t.id, t]));
  const guestIds = new Set(project.guests.map((g) => g.id));
  const partyIds = new Set(project.parties.map((p) => p.id));

  const claimed = new Set<string>();
  const guests = project.guests.map((g) => {
    let seat = g.seat;
    if (seat) {
      const table = tables.get(seat.tableId);
      const key = `${seat.tableId}#${seat.index}`;
      // Drop the seat if the table vanished, the seat is past the end, or
      // someone earlier in the file already claimed it.
      if (!table || seat.index >= table.seats || claimed.has(key)) seat = null;
      else claimed.add(key);
    }
    const partyId = g.partyId && partyIds.has(g.partyId) ? g.partyId : null;
    return seat === g.seat && partyId === g.partyId ? g : { ...g, seat, partyId };
  });

  const liveParties = new Set(guests.map((g) => g.partyId).filter(Boolean) as string[]);

  return {
    ...project,
    guests,
    parties: project.parties.filter((p) => liveParties.has(p.id)),
    constraints: project.constraints.filter(
      (c) => c.a !== c.b && guestIds.has(c.a) && guestIds.has(c.b),
    ),
  };
}

/** Parse an unknown value into a Project, or throw a ProjectFileError. */
export function parseProject(raw: unknown): Project {
  const migrated = migrate(raw);
  const result = projectSchema.safeParse(migrated);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` (at ${first.path.join('.')})` : '';
    throw new ProjectFileError(
      `This project file is damaged and can't be opened${where}. Your current plan hasn't been changed.`,
    );
  }
  return reconcile({ ...result.data, version: CURRENT_VERSION });
}

export function parseProjectText(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError(
      "That file isn't valid JSON, so it can't be opened. Your current plan hasn't been changed.",
    );
  }
  return parseProject(raw);
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ ...project, version: CURRENT_VERSION }, null, 2);
}

/** "Dana & Yoav" -> "dana-and-yoav.tiktak.json" */
export function projectFileName(eventName: string): string {
  const slug = eventName
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'untitled-event'}.tiktak.json`;
}

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

export function loadStoredProject(): Project | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private browsing, storage disabled
  }
  if (!raw) return null;
  try {
    return parseProjectText(raw);
  } catch {
    // A damaged autosave must never take the app down with it. Keep the bad
    // copy under a side key so the plan is not silently destroyed.
    try {
      localStorage.setItem(`${STORAGE_KEY}:corrupt`, raw);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing more we can do */
    }
    return null;
  }
}

export type SaveOutcome = 'saved' | 'quota' | 'unavailable';

export function saveStoredProject(project: Project): SaveOutcome {
  try {
    localStorage.setItem(STORAGE_KEY, serializeProject(project));
    return 'saved';
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
      ? 'quota'
      : 'unavailable';
  }
}

export function clearStoredProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

export function blankProject(): Project {
  return emptyProject();
}
