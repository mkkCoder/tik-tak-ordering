import type { Constraint, Guest, Party, Project, Table } from './types';
import { CURRENT_VERSION } from './types';

/**
 * The sample event that greets a first-time visitor. It is the explanation —
 * there is no tour and no tooltips, so this has to show, in one screen, that
 * guests arrive in parties, tables have shapes, and some people must be kept
 * apart.
 *
 * Deterministic ids so the demo is stable across reloads and screenshots.
 */

const FAMILIES: Array<[string, string[]]> = [
  ['Cohen', ['Ruth Cohen', 'David Cohen', 'Maya Cohen', 'Eli Cohen']],
  ['Levi', ['Sarah Levi', 'Yoav Levi']],
  ['Katz', ['Miriam Katz', 'Avi Katz', 'Noa Katz', 'Tal Katz', 'Gil Katz', 'Shira Katz']],
  ['Friedman', ['Hannah Friedman', 'Jacob Friedman']],
  ['Barzilai', ['Orit Barzilai', 'Amir Barzilai', 'Lior Barzilai']],
  ['Shapiro', ['Rivka Shapiro', 'Menachem Shapiro']],
  ['Weiss', ['Dina Weiss', 'Yonatan Weiss', 'Ayelet Weiss']],
  ['Mizrahi', ['Esti Mizrahi', 'Shlomo Mizrahi', 'Yael Mizrahi', 'Ronen Mizrahi']],
  ['Adler', ['Tamar Adler', 'Benjamin Adler']],
  ['Peretz', ['Galit Peretz', 'Moshe Peretz', 'Liat Peretz']],
  ['Stern', ['Nurit Stern', 'Uri Stern']],
  ['Golan', ['Chen Golan', 'Itai Golan', 'Roni Golan']],
  ['Ben-Ami', ['Zohar Ben-Ami', 'Nadav Ben-Ami']],
  ['Rosen', ['Leah Rosen', 'Aaron Rosen', 'Talia Rosen']],
  ['Harari', ['Sivan Harari', 'Omer Harari']],
];

const SINGLES = [
  'Daniel Arbel',
  'Michal Doron',
  'Yosef Tal',
  'Rina Segal',
  'Boaz Nir',
  'Efrat Lahav',
  'Guy Sela',
  'Naomi Raz',
  'Tomer Bar',
  'Keren Oren',
  'Amit Shaked',
  'Dalia Vardi',
  'Erez Paz',
  'Hila Zur',
  'Assaf Reut',
  'Noga Alon',
  'Idan Carmi',
];

const SIDE_A = 'bride side';
const SIDE_B = 'groom side';

export function demoProject(): Project {
  const guests: Guest[] = [];
  const parties: Party[] = [];
  let n = 0;

  FAMILIES.forEach(([surname, members], familyIndex) => {
    const partyId = `p-${familyIndex}`;
    parties.push({
      id: partyId,
      label: members.length > 1 ? `${surname} +${members.length - 1}` : surname,
    });
    for (const name of members) {
      guests.push({
        id: `g-${n++}`,
        name,
        partyId,
        tags: [familyIndex % 2 === 0 ? SIDE_A : SIDE_B],
        notes: '',
        seat: null,
        locked: false,
      });
    }
  });

  SINGLES.forEach((name, i) => {
    guests.push({
      id: `g-${n++}`,
      name,
      partyId: null,
      tags: [i % 2 === 0 ? SIDE_A : SIDE_B],
      notes: '',
      seat: null,
      locked: false,
    });
  });

  const tables: Table[] = [
    { id: 't-head', label: 'Head table', shape: 'head', seats: 6, x: 0, y: -46, rotation: 0, locked: false },
    { id: 't-1', label: 'Table 1', shape: 'round', seats: 10, x: -42, y: -8, rotation: 0, locked: false },
    { id: 't-2', label: 'Table 2', shape: 'round', seats: 10, x: 0, y: -8, rotation: 0, locked: false },
    { id: 't-3', label: 'Table 3', shape: 'round', seats: 10, x: 42, y: -8, rotation: 0, locked: false },
    { id: 't-4', label: 'Table 4', shape: 'round', seats: 10, x: -42, y: 34, rotation: 0, locked: false },
    { id: 't-5', label: 'Table 5', shape: 'round', seats: 10, x: 0, y: 34, rotation: 0, locked: false },
    { id: 't-6', label: 'Table 6', shape: 'round', seats: 10, x: 42, y: 34, rotation: 0, locked: false },
    { id: 't-7', label: 'Table 7', shape: 'rect', seats: 8, x: 0, y: 70, rotation: 0, locked: false },
  ];

  // Three rules, one of each situation worth showing.
  const constraints: Constraint[] = [
    { id: 'c-1', kind: 'apart', a: 'g-0', b: 'g-6' }, // Ruth Cohen / Miriam Katz
    { id: 'c-2', kind: 'together', a: 'g-4', b: 'g-5' }, // the Levis
    { id: 'c-3', kind: 'apart', a: 'g-12', b: 'g-16' },
  ];

  // Seat a little over half, so the unassigned pool is visibly the work left.
  const seated = guests.slice(0, 34);
  const roundTables = tables.filter((t) => t.shape === 'round');
  let cursor = 0;
  for (const table of roundTables) {
    for (let i = 0; i < 6 && cursor < seated.length; i++) {
      const guest = seated[cursor++];
      if (guest) guest.seat = { tableId: table.id, index: i };
    }
  }

  return {
    version: CURRENT_VERSION,
    event: { name: 'Dana & Yoav', date: '2026-09-13', venue: 'The Old Mill' },
    guests,
    parties,
    tables,
    constraints,
    canvas: { zoom: 1, panX: 0, panY: 0 },
  };
}
