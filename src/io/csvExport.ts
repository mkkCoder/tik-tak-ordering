import type { Project } from '@/model/types';

/**
 * CSV export. Free, deliberately: a planner who cannot get their own guest list
 * back out of the tool has been trapped, and a tool that traps people does not
 * deserve the twenty dollars either.
 */

function escape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsv(headers: readonly string[], rows: readonly string[][]): string {
  // BOM so Excel opens accented names correctly instead of mangling them.
  const body = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  return `\uFEFF${body}\r\n`;
}

export function guestsCsv(project: Project): string {
  const tables = new Map(project.tables.map((t) => [t.id, t]));
  const parties = new Map(project.parties.map((p) => [p.id, p]));

  const rows = project.guests.map((g) => [
    g.name,
    g.partyId ? (parties.get(g.partyId)?.label ?? '') : '',
    g.seat ? (tables.get(g.seat.tableId)?.label ?? '') : '',
    g.seat ? String(g.seat.index + 1) : '',
    g.tags.join('; '),
    g.notes,
  ]);

  return toCsv(['name', 'party', 'table', 'seat', 'tags', 'notes'], rows);
}

export function tablesCsv(project: Project): string {
  const counts = new Map<string, number>();
  for (const g of project.guests) {
    if (!g.seat) continue;
    counts.set(g.seat.tableId, (counts.get(g.seat.tableId) ?? 0) + 1);
  }

  const rows = project.tables.map((t) => [
    t.label,
    t.shape,
    String(t.seats),
    String(counts.get(t.id) ?? 0),
  ]);

  return toCsv(['label', 'shape', 'seats', 'occupied'], rows);
}
