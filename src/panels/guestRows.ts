import type { Guest, Id, Party, Table } from '@/model/types';

/**
 * Turning the guest list into a flat array of rows, so one virtualiser can
 * handle parties and people together. Pure, so the 1,000-guest case is easy to
 * test without rendering anything.
 */

export type GuestRow =
  | { kind: 'party'; key: string; party: Party; members: Guest[]; seatedCount: number }
  | { kind: 'guest'; key: string; guest: Guest; indented: boolean };

export interface BuildRowsInput {
  guests: readonly Guest[];
  parties: readonly Party[];
  tables: readonly Table[];
  query: string;
  scope: 'unassigned' | 'all';
  collapsed: ReadonlySet<Id>;
}

/** Fold accents so "Jose" finds "José". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesQuery(
  guest: Guest,
  party: Party | undefined,
  table: Table | undefined,
  needles: readonly string[],
): boolean {
  if (needles.length === 0) return true;
  const haystack = normalize(
    [guest.name, party?.label ?? '', guest.tags.join(' '), guest.notes, table?.label ?? ''].join(
      ' ',
    ),
  );
  return needles.every((n) => haystack.includes(n));
}

export function buildRows({
  guests,
  parties,
  tables,
  query,
  scope,
  collapsed,
}: BuildRowsInput): GuestRow[] {
  const needles = normalize(query).split(/\s+/).filter(Boolean);
  const partyById = new Map(parties.map((p) => [p.id, p]));
  const tableById = new Map(tables.map((t) => [t.id, t]));

  // Bucket first, so party membership survives filtering.
  const loose: Guest[] = [];
  const grouped = new Map<Id, Guest[]>();

  for (const g of guests) {
    if (scope === 'unassigned' && g.seat) continue;
    const party = g.partyId ? partyById.get(g.partyId) : undefined;
    const table = g.seat ? tableById.get(g.seat.tableId) : undefined;
    if (!matchesQuery(g, party, table, needles)) continue;
    if (party) {
      const list = grouped.get(party.id);
      if (list) list.push(g);
      else grouped.set(party.id, [g]);
    } else {
      loose.push(g);
    }
  }

  const rows: GuestRow[] = [];

  // Parties first, in their document order — they are the unit people think in.
  for (const party of parties) {
    const members = grouped.get(party.id);
    if (!members || members.length === 0) continue;
    rows.push({
      kind: 'party',
      key: `party:${party.id}`,
      party,
      members,
      seatedCount: members.filter((m) => m.seat).length,
    });
    if (collapsed.has(party.id)) continue;
    for (const guest of members) {
      rows.push({ kind: 'guest', key: `guest:${guest.id}`, guest, indented: true });
    }
  }

  for (const guest of loose) {
    rows.push({ kind: 'guest', key: `guest:${guest.id}`, guest, indented: false });
  }

  return rows;
}

/** Every guest id a row covers — a party row stands for all its members. */
export function rowGuestIds(row: GuestRow): Id[] {
  return row.kind === 'party' ? row.members.map((m) => m.id) : [row.guest.id];
}
