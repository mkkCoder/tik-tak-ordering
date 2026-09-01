import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginHistoryGroup,
  clearHistory,
  endHistoryGroup,
  redo,
  undo,
  useProjectStore,
  withHistoryGroup,
} from './project';
import { counters, occupancy, tableOccupancy, unassignedGuests, violations } from './selectors';
import { emptyProject } from '@/model/types';

const s = () => useProjectStore.getState();

/**
 * Every action gets a test and an undo test. The undo half matters more: an
 * action that half-reverses is worse than one that fails outright, because the
 * user does not find out until the chart is already wrong.
 */

beforeEach(() => {
  // Merge, not replace: a replacing setState would drop the actions too.
  useProjectStore.setState({ ...emptyProject() });
  clearHistory();
});

/** Undo works on the previous *committed* state, so space out discrete edits. */
function step<T>(fn: () => T): T {
  return withHistoryGroup(fn);
}

describe('guests', () => {
  it('addGuest appends and undoes', () => {
    const id = step(() => s().addGuest('Ruth Cohen'));
    expect(s().guests).toHaveLength(1);
    expect(s().guests[0]).toMatchObject({ id, name: 'Ruth Cohen', seat: null, locked: false });
    undo();
    expect(s().guests).toHaveLength(0);
    redo();
    expect(s().guests).toHaveLength(1);
  });

  it('addGuest trims whitespace', () => {
    step(() => s().addGuest('   Dov Levi  '));
    expect(s().guests[0]?.name).toBe('Dov Levi');
  });

  it('addGuests bulk-inserts as one step', () => {
    step(() => s().addGuests([{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    expect(s().guests).toHaveLength(3);
    undo();
    expect(s().guests).toHaveLength(0);
  });

  it('updateGuest patches and undoes, and cannot rewrite the id', () => {
    const id = step(() => s().addGuest('Typo'));
    step(() => s().updateGuest(id, { name: 'Fixed', tags: ['kids'] }));
    expect(s().guests[0]).toMatchObject({ id, name: 'Fixed', tags: ['kids'] });
    step(() => s().updateGuest(id, { id: 'hacked' } as never));
    expect(s().guests[0]?.id).toBe(id);
    undo();
    undo();
    expect(s().guests[0]?.name).toBe('Typo');
  });

  it('removeGuests drops the guests, their empty parties and their constraints', () => {
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().groupAsParty([a, b], 'Cohen'));
    step(() => s().addConstraint('apart', a, b));
    expect(s().parties).toHaveLength(1);
    expect(s().constraints).toHaveLength(1);

    step(() => s().removeGuests([a, b]));
    expect(s().guests).toHaveLength(0);
    expect(s().parties).toHaveLength(0);
    expect(s().constraints).toHaveLength(0);

    undo();
    expect(s().guests).toHaveLength(2);
    expect(s().parties).toHaveLength(1);
    expect(s().constraints).toHaveLength(1);
  });
});

describe('parties', () => {
  it('groupAsParty is a single undo step', () => {
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().groupAsParty([a, b], 'Katz'));
    expect(s().parties).toHaveLength(1);
    expect(s().guests.every((g) => g.partyId === s().parties[0]?.id)).toBe(true);

    // One press, not two: the party and the membership go together.
    undo();
    expect(s().parties).toHaveLength(0);
    expect(s().guests.every((g) => g.partyId === null)).toBe(true);
  });

  it('groupAsParty falls back to a label when given blank text', () => {
    const a = step(() => s().addGuest('A'));
    step(() => s().groupAsParty([a], '   '));
    expect(s().parties[0]?.label).toBe('Party');
  });

  it('ungroup clears membership and prunes the party in one step', () => {
    const a = step(() => s().addGuest('A'));
    step(() => s().groupAsParty([a], 'Levi'));
    step(() => s().ungroup([a]));
    expect(s().parties).toHaveLength(0);
    expect(s().guests[0]?.partyId).toBeNull();
    undo();
    expect(s().parties).toHaveLength(1);
    expect(s().guests[0]?.partyId).toBe(s().parties[0]?.id);
  });

  it('addToParty keeps the party and its name, unlike regrouping', () => {
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    const p = step(() => s().groupAsParty([a], 'Cohen')) as string;

    step(() => s().addToParty([b], p));
    expect(s().parties).toHaveLength(1);
    expect(s().parties[0]).toMatchObject({ id: p, label: 'Cohen' });
    expect(s().guests.every((g) => g.partyId === p)).toBe(true);

    undo();
    expect(s().guests.find((g) => g.id === b)?.partyId).toBeNull();
    expect(s().parties[0]?.label).toBe('Cohen');
  });

  it('addToParty prunes a party the move emptied', () => {
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    const cohen = step(() => s().groupAsParty([a], 'Cohen')) as string;
    step(() => s().groupAsParty([b], 'Levi'));
    expect(s().parties).toHaveLength(2);

    // B was the only Levi, so moving him leaves nothing behind.
    step(() => s().addToParty([b], cohen));
    expect(s().parties).toHaveLength(1);
    expect(s().parties[0]?.label).toBe('Cohen');

    undo();
    expect(s().parties).toHaveLength(2);
  });

  it('addToParty ignores an unknown party and an empty selection', () => {
    const a = step(() => s().addGuest('A'));
    step(() => s().groupAsParty([a], 'Cohen'));
    const before = s().guests;

    step(() => s().addToParty([a], 'no-such-party'));
    step(() => s().addToParty([], s().parties[0]?.id as string));
    expect(s().guests).toBe(before);
  });

  it('updateParty renames and undoes', () => {
    const a = step(() => s().addGuest('A'));
    const p = step(() => s().groupAsParty([a], 'Cohen'));
    step(() => s().updateParty(p as string, 'Cohen +3'));
    expect(s().parties[0]?.label).toBe('Cohen +3');
    undo();
    expect(s().parties[0]?.label).toBe('Cohen');
  });
});

describe('tables', () => {
  it('addTable uses shape defaults and auto-labels', () => {
    step(() => s().addTable('round'));
    step(() => s().addTable('round'));
    expect(s().tables.map((t) => t.label)).toEqual(['Table 1', 'Table 2']);
    expect(s().tables[0]?.seats).toBe(10);
    undo();
    expect(s().tables).toHaveLength(1);
  });

  it('addTable clamps a silly seat count into range', () => {
    const id = step(() => s().addTable('round', { x: 0, y: 0 }, 999));
    expect(s().tables.find((t) => t.id === id)?.seats).toBe(16);
  });

  it('moveTable moves and undoes', () => {
    const id = step(() => s().addTable('round'));
    step(() => s().moveTable(id, 40, 25));
    expect(s().tables[0]).toMatchObject({ x: 40, y: 25 });
    undo();
    expect(s().tables[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('a whole drag collapses into one undo step', () => {
    const id = step(() => s().addTable('round'));
    // What a pointer drag actually emits: dozens of moves.
    beginHistoryGroup();
    for (let i = 1; i <= 60; i++) s().moveTable(id, i, i * 2);
    endHistoryGroup();
    expect(s().tables[0]).toMatchObject({ x: 60, y: 120 });

    undo();
    expect(s().tables[0]).toMatchObject({ x: 0, y: 0 });
    expect(s().tables).toHaveLength(1); // and not one press too far
  });

  it('a gesture that changes nothing adds no history', () => {
    const id = step(() => s().addTable('round'));
    const before = useProjectStore.temporal.getState().pastStates.length;
    beginHistoryGroup();
    s().moveTable(id, 0, 0); // same position
    endHistoryGroup();
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(before);
  });

  it('moveTables moves a group together', () => {
    const a = step(() => s().addTable('round'));
    const b = step(() => s().addTable('rect'));
    step(() =>
      s().moveTables([
        { id: a, x: 10, y: 10 },
        { id: b, x: 20, y: 20 },
      ]),
    );
    expect(s().tables.map((t) => [t.x, t.y])).toEqual([
      [10, 10],
      [20, 20],
    ]);
    undo();
    expect(s().tables.map((t) => [t.x, t.y])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('removeTables returns its guests to the pool, and undo re-seats them', () => {
    const t = step(() => s().addTable('round'));
    const g = step(() => s().addGuest('Seated'));
    step(() => s().assign(g, t, 3));
    expect(s().guests[0]?.seat).toEqual({ tableId: t, index: 3 });

    step(() => s().removeTables([t]));
    expect(s().tables).toHaveLength(0);
    expect(s().guests[0]?.seat).toBeNull();

    undo();
    expect(s().tables).toHaveLength(1);
    expect(s().guests[0]?.seat).toEqual({ tableId: t, index: 3 });
  });

  it('duplicateTables offsets the copy and leaves it unlocked and empty', () => {
    const t = step(() => s().addTable('round'));
    const g = step(() => s().addGuest('Stays put'));
    step(() => s().assign(g, t, 0));
    step(() => s().updateTable(t, { locked: true }));

    const [copy] = step(() => s().duplicateTables([t]));
    const made = s().tables.find((x) => x.id === copy);
    expect(made).toMatchObject({ x: 8, y: 8, locked: false, shape: 'round' });
    expect(made?.label).not.toBe(s().tables[0]?.label);
    // Duplicating a table does not duplicate the people at it.
    expect(s().guests[0]?.seat?.tableId).toBe(t);

    undo();
    expect(s().tables).toHaveLength(1);
  });

  it('shrinking a table unseats whoever is past the new last seat', () => {
    const t = step(() => s().addTable('round', { x: 0, y: 0 }, 10));
    const near = step(() => s().addGuest('Near'));
    const far = step(() => s().addGuest('Far'));
    step(() => s().assign(near, t, 1));
    step(() => s().assign(far, t, 9));

    step(() => s().updateTable(t, { seats: 6 }));
    expect(s().guests.find((g) => g.id === near)?.seat).toEqual({ tableId: t, index: 1 });
    expect(s().guests.find((g) => g.id === far)?.seat).toBeNull();

    undo();
    expect(s().guests.find((g) => g.id === far)?.seat).toEqual({ tableId: t, index: 9 });
  });

  it('changing shape resets seats to that shape default', () => {
    const t = step(() => s().addTable('round'));
    step(() => s().updateTable(t, { shape: 'sweetheart' }));
    expect(s().tables[0]).toMatchObject({ shape: 'sweetheart', seats: 2 });
  });
});

describe('assignment', () => {
  it('assign seats a guest and undo returns them to the pool', () => {
    const t = step(() => s().addTable('round'));
    const g = step(() => s().addGuest('Ruth'));
    expect(step(() => s().assign(g, t, 2))).toBe(true);
    expect(s().guests[0]?.seat).toEqual({ tableId: t, index: 2 });
    undo();
    expect(s().guests[0]?.seat).toBeNull();
  });

  it('refuses a taken seat, an out-of-range seat and a missing table', () => {
    const t = step(() => s().addTable('round', { x: 0, y: 0 }, 4));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().assign(a, t, 0));

    expect(s().assign(b, t, 0)).toBe(false);
    expect(s().assign(b, t, 4)).toBe(false);
    expect(s().assign(b, t, -1)).toBe(false);
    expect(s().assign(b, 'nope', 0)).toBe(false);
    expect(s().guests.find((g) => g.id === b)?.seat).toBeNull();
  });

  it('re-assigning a guest to their own seat is allowed', () => {
    const t = step(() => s().addTable('round'));
    const g = step(() => s().addGuest('A'));
    step(() => s().assign(g, t, 1));
    expect(s().assign(g, t, 1)).toBe(true);
  });

  it('no guest can occupy two seats', () => {
    const t = step(() => s().addTable('round'));
    const g = step(() => s().addGuest('A'));
    step(() => s().assign(g, t, 0));
    step(() => s().assign(g, t, 5));
    const seats = s().guests.filter((x) => x.seat !== null);
    expect(seats).toHaveLength(1);
    expect(seats[0]?.seat).toEqual({ tableId: t, index: 5 });
  });

  it('assignMany is all-or-nothing', () => {
    const t = step(() => s().addTable('round', { x: 0, y: 0 }, 4));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    const c = step(() => s().addGuest('C'));
    step(() => s().assign(c, t, 2));

    // b collides with c: the whole batch is refused, a stays unseated.
    expect(
      s().assignMany([
        { guestId: a, tableId: t, index: 1 },
        { guestId: b, tableId: t, index: 2 },
      ]),
    ).toBe(false);
    expect(s().guests.find((g) => g.id === a)?.seat).toBeNull();

    expect(
      step(() =>
        s().assignMany([
          { guestId: a, tableId: t, index: 0 },
          { guestId: b, tableId: t, index: 1 },
        ]),
      ),
    ).toBe(true);
    expect(s().guests.filter((g) => g.seat).length).toBe(3);
    undo();
    expect(s().guests.filter((g) => g.seat).length).toBe(1);
  });

  it('assignMany refuses two guests aimed at the same seat', () => {
    const t = step(() => s().addTable('round'));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    expect(
      s().assignMany([
        { guestId: a, tableId: t, index: 3 },
        { guestId: b, tableId: t, index: 3 },
      ]),
    ).toBe(false);
  });

  it('assignMany lets a group shuffle within seats it already holds', () => {
    const t = step(() => s().addTable('round', { x: 0, y: 0 }, 4));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().assignMany([
      { guestId: a, tableId: t, index: 0 },
      { guestId: b, tableId: t, index: 1 },
    ]));
    expect(
      s().assignMany([
        { guestId: a, tableId: t, index: 1 },
        { guestId: b, tableId: t, index: 0 },
      ]),
    ).toBe(true);
  });

  it('unassign clears seats and undoes', () => {
    const t = step(() => s().addTable('round'));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().assign(a, t, 0));
    step(() => s().assign(b, t, 1));
    step(() => s().unassign([a, b]));
    expect(s().guests.every((g) => g.seat === null)).toBe(true);
    undo();
    expect(s().guests.every((g) => g.seat !== null)).toBe(true);
  });

  it('swapSeats exchanges two guests', () => {
    const t = step(() => s().addTable('round'));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().assign(a, t, 0));
    step(() => s().assign(b, t, 4));
    step(() => s().swapSeats(a, b));
    expect(s().guests.find((g) => g.id === a)?.seat?.index).toBe(4);
    expect(s().guests.find((g) => g.id === b)?.seat?.index).toBe(0);
    undo();
    expect(s().guests.find((g) => g.id === a)?.seat?.index).toBe(0);
  });

  it('swapSeats works between a seated and an unseated guest', () => {
    const t = step(() => s().addTable('round'));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().assign(a, t, 2));
    step(() => s().swapSeats(a, b));
    expect(s().guests.find((g) => g.id === a)?.seat).toBeNull();
    expect(s().guests.find((g) => g.id === b)?.seat?.index).toBe(2);
  });
});

describe('constraints', () => {
  it('addConstraint stores one and undoes', () => {
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().addConstraint('apart', a, b));
    expect(s().constraints).toHaveLength(1);
    undo();
    expect(s().constraints).toHaveLength(0);
  });

  it('refuses a guest paired with themselves', () => {
    const a = step(() => s().addGuest('A'));
    expect(s().addConstraint('apart', a, a)).toBeNull();
    expect(s().constraints).toHaveLength(0);
  });

  it('adding the same pair twice does not duplicate, and flips the kind', () => {
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    const first = step(() => s().addConstraint('apart', a, b));
    const again = step(() => s().addConstraint('apart', b, a));
    expect(again).toBe(first);
    expect(s().constraints).toHaveLength(1);

    step(() => s().addConstraint('together', b, a));
    expect(s().constraints).toHaveLength(1);
    expect(s().constraints[0]?.kind).toBe('together');
    undo();
    expect(s().constraints[0]?.kind).toBe('apart');
  });

  it('removeConstraint removes and undoes', () => {
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    const id = step(() => s().addConstraint('apart', a, b));
    step(() => s().removeConstraint(id as string));
    expect(s().constraints).toHaveLength(0);
    undo();
    expect(s().constraints).toHaveLength(1);
  });
});

describe('document', () => {
  it('setEvent patches and undoes', () => {
    step(() => s().setEvent({ name: 'Dana & Yoav', venue: 'The Old Mill' }));
    expect(s().event).toMatchObject({ name: 'Dana & Yoav', venue: 'The Old Mill' });
    undo();
    expect(s().event.name).toBe('Untitled event');
  });

  it('setCanvas never enters history — panning is not an edit', () => {
    step(() => s().addGuest('A'));
    const depth = useProjectStore.temporal.getState().pastStates.length;
    s().setCanvas({ zoom: 2, panX: 120 });
    expect(s().canvas).toMatchObject({ zoom: 2, panX: 120 });
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(depth);
    undo();
    // Undo reversed the guest, and left the viewport alone.
    expect(s().guests).toHaveLength(0);
    expect(s().canvas.zoom).toBe(2);
  });

  it('replaceProject swaps the whole document', () => {
    step(() => s().addGuest('Old'));
    const incoming = {
      ...emptyProject(),
      event: { name: 'Imported', date: '2026-09-01', venue: 'Hall' },
      guests: [
        { id: 'x', name: 'New', partyId: null, tags: [], notes: '', seat: null, locked: false },
      ],
    };
    step(() => s().replaceProject(incoming));
    expect(s().guests.map((g) => g.name)).toEqual(['New']);
    expect(s().event.name).toBe('Imported');
    undo();
    expect(s().guests.map((g) => g.name)).toEqual(['Old']);
  });

  it('newProject clears everything', () => {
    step(() => s().addGuest('A'));
    step(() => s().addTable('round'));
    step(() => s().newProject());
    expect(s().guests).toHaveLength(0);
    expect(s().tables).toHaveLength(0);
    undo();
    expect(s().guests).toHaveLength(1);
  });
});

describe('history bookkeeping', () => {
  it('keeps at most 50 steps', () => {
    for (let i = 0; i < 70; i++) step(() => s().addGuest(`G${i}`));
    expect(useProjectStore.temporal.getState().pastStates.length).toBeLessThanOrEqual(50);
  });

  it('a new edit clears the redo stack', () => {
    step(() => s().addGuest('A'));
    step(() => s().addGuest('B'));
    undo();
    expect(useProjectStore.temporal.getState().futureStates.length).toBe(1);
    step(() => s().addGuest('C'));
    expect(useProjectStore.temporal.getState().futureStates.length).toBe(0);
    expect(s().guests.map((g) => g.name)).toEqual(['A', 'C']);
  });

  it('nested groups collapse to the outermost one', () => {
    const before = useProjectStore.temporal.getState().pastStates.length;
    withHistoryGroup(() => {
      s().addGuest('A');
      withHistoryGroup(() => {
        s().addGuest('B');
        s().addTable('round');
      });
      s().addGuest('C');
    });
    expect(useProjectStore.temporal.getState().pastStates.length).toBe(before + 1);
    undo();
    expect(s().guests).toHaveLength(0);
    expect(s().tables).toHaveLength(0);
  });

  it('a throwing group still closes and still records', () => {
    step(() => s().addGuest('A'));
    expect(() =>
      withHistoryGroup(() => {
        s().addGuest('B');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // History is not left paused by the exception.
    expect(useProjectStore.temporal.getState().isTracking).toBe(true);
    undo();
    expect(s().guests.map((g) => g.name)).toEqual(['A']);
  });
});

describe('selectors', () => {
  it('unassignedGuests and counters agree', () => {
    const t = step(() => s().addTable('round'));
    const ids = step(() => s().addGuests([{ name: 'A' }, { name: 'B' }, { name: 'C' }]));
    step(() => s().assign(ids[0] as string, t, 0));
    expect(unassignedGuests(s()).map((g) => g.name)).toEqual(['B', 'C']);
    expect(counters(s())).toMatchObject({ guests: 3, seated: 1, unassigned: 2, capacity: 10 });
  });

  it('tableOccupancy reports seats by index', () => {
    const t = step(() => s().addTable('round', { x: 0, y: 0 }, 4));
    const g = step(() => s().addGuest('Ruth'));
    step(() => s().assign(g, t, 2));
    const o = tableOccupancy(s(), t);
    expect(o).toMatchObject({ seats: 4, seated: 1, free: 3 });
    expect(o?.bySeat.map((x) => x?.name ?? null)).toEqual([null, null, 'Ruth', null]);
    expect(tableOccupancy(s(), 'missing')).toBeNull();
  });

  it('selectors are memoised on the arrays they read', () => {
    step(() => s().addGuest('A'));
    const first = unassignedGuests(s());
    s().setCanvas({ zoom: 3 });
    expect(unassignedGuests(s())).toBe(first);
    expect(occupancy(s())).toBe(occupancy(s()));
  });

  it('violations surface through the store', () => {
    const t = step(() => s().addTable('round'));
    const a = step(() => s().addGuest('A'));
    const b = step(() => s().addGuest('B'));
    step(() => s().addConstraint('apart', a, b));
    expect(violations(s())).toHaveLength(0);
    step(() => s().assign(a, t, 0));
    step(() => s().assign(b, t, 1));
    expect(violations(s())).toHaveLength(1);
  });
});
