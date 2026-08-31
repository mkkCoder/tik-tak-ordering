import { useMemo, useState } from 'react';
import { useProjectStore, withHistoryGroup } from '@/store/project';
import { partyLookup, tableOccupancy, violations } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import type { Guest, Id, Table, TableShape } from '@/model/types';
import { SHAPE_LABELS, seatRange } from '@/model/seating';
import { Button, Dialog, Field, IconButton, Select, cx } from '@/ui/primitives';

export function Inspector() {
  const selection = useUiStore((s) => s.selection);
  const tables = useProjectStore((s) => s.tables);
  const guests = useProjectStore((s) => s.guests);

  if (selection.kind === 'none') {
    return (
      <Shell>
        <p className="px-4 py-4 text-[13px] text-slate">Select a table or guest to edit</p>
      </Shell>
    );
  }

  if (selection.kind === 'tables') {
    if (selection.ids.length > 1) {
      return (
        <Shell>
          <MultiTable ids={selection.ids} />
        </Shell>
      );
    }
    const table = tables.find((t) => t.id === selection.ids[0]);
    if (!table) {
      return (
        <Shell>
          <p className="px-4 py-4 text-[13px] text-slate">That table has been removed.</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <TableInspector table={table} />
      </Shell>
    );
  }

  const guest = guests.find((g) => g.id === selection.ids[0]);
  if (!guest) {
    return (
      <Shell>
        <p className="px-4 py-4 text-[13px] text-slate">That guest has been removed.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <GuestInspector guest={guest} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tk-scroll flex h-full min-h-0 flex-col overflow-y-auto border-l border-[color:var(--hairline)]">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-serif text-[15px] font-semibold">{children}</h3>;
}

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('border-b border-[color:var(--hairline)] px-4 py-3.5', className)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function TableInspector({ table }: { table: Table }) {
  const occupancy = useProjectStore((s) => tableOccupancy(s, table.id));
  const flagged = useProjectStore((s) =>
    violations(s).filter((v) => v.tables.includes(table.id)),
  );
  const select = useUiStore((s) => s.select);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const setHoverGuests = useUiStore((s) => s.setHoverGuests);
  const [confirmShrink, setConfirmShrink] = useState<number | null>(null);
  const { min, max } = seatRange(table.shape);

  function update(patch: Partial<Table>) {
    withHistoryGroup(() => useProjectStore.getState().updateTable(table.id, patch));
  }

  /** Changing the seat count can evict people; say how many before doing it. */
  function requestSeats(next: number) {
    const evicted = occupancy?.guests.filter((g) => (g.seat?.index ?? 0) >= next).length ?? 0;
    if (evicted > 0) setConfirmShrink(next);
    else update({ seats: next });
  }

  return (
    <>
      <Section>
        <SectionTitle>Table</SectionTitle>
        <div className="flex flex-col gap-2.5">
          <Field
            label="Label"
            value={table.label}
            onChange={(e) => update({ label: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Shape"
              value={table.shape}
              onChange={(e) => update({ shape: e.target.value as TableShape })}
            >
              {(Object.keys(SHAPE_LABELS) as TableShape[]).map((shape) => (
                <option key={shape} value={shape}>
                  {SHAPE_LABELS[shape]}
                </option>
              ))}
            </Select>
            <Field
              label="Seats"
              type="number"
              min={min}
              max={max}
              value={table.seats}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= min && n <= max) requestSeats(n);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Rotation"
              type="number"
              step={15}
              value={Math.round(table.rotation)}
              onChange={(e) => update({ rotation: Number(e.target.value) || 0 })}
            />
            <label className="flex items-end gap-1.5 pb-1.5 text-[13px]">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[color:var(--sage)]"
                checked={table.locked}
                onChange={(e) => update({ locked: e.target.checked })}
              />
              Locked
            </label>
          </div>
          <p className="text-micro text-slate">
            {occupancy?.seated ?? 0} seated · {occupancy?.free ?? 0} free
          </p>
        </div>
      </Section>

      {flagged.length > 0 && (
        <Section className="bg-[color:rgba(179,38,30,0.06)]">
          <h3 className="mb-1.5 text-[13px] font-medium text-flag">
            {flagged.length} {flagged.length === 1 ? 'conflict' : 'conflicts'}
          </h3>
          <ul className="flex flex-col gap-1">
            {flagged.map((v) => (
              <li key={v.constraintId} className="text-[13px] text-ink">
                {v.message}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section>
        <SectionTitle>Seats</SectionTitle>
        <SeatList table={table} bySeat={occupancy?.bySeat ?? []} />
      </Section>

      <div className="flex gap-2 px-4 py-3">
        <Button
          onClick={() => {
            const made = withHistoryGroup(() =>
              useProjectStore.getState().duplicateTables([table.id]),
            );
            if (made[0]) select({ kind: 'tables', ids: [made[0]] });
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            withHistoryGroup(() => useProjectStore.getState().removeTables([table.id]));
            setHoverGuests([]);
            clearSelection();
          }}
        >
          Delete table
        </Button>
      </div>

      <Dialog
        open={confirmShrink !== null}
        title="Fewer seats than guests"
        onClose={() => setConfirmShrink(null)}
        footer={
          <>
            <Button onClick={() => setConfirmShrink(null)}>Cancel</Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                if (confirmShrink !== null) update({ seats: confirmShrink });
                setConfirmShrink(null);
              }}
            >
              Reduce seats
            </Button>
          </>
        }
      >
        <p>
          Reducing {table.label} to {confirmShrink} seats returns{' '}
          {occupancy?.guests.filter((g) => (g.seat?.index ?? 0) >= (confirmShrink ?? 0)).length}{' '}
          guests to the unassigned list.
        </p>
      </Dialog>
    </>
  );
}

/** Seat-by-seat list with reordering, and the keyboard path for touch users. */
function SeatList({ table, bySeat }: { table: Table; bySeat: Array<Guest | null> }) {
  const armedGuestIds = useUiStore((s) => s.armedGuestIds);
  const armGuests = useUiStore((s) => s.armGuests);
  const setHoverGuests = useUiStore((s) => s.setHoverGuests);
  const pulse = useUiStore((s) => s.pulse);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= table.seats) return;
    const a = bySeat[index];
    const b = bySeat[target];
    withHistoryGroup(() => {
      const store = useProjectStore.getState();
      if (a && b) store.swapSeats(a.id, b.id);
      else if (a) store.assign(a.id, table.id, target);
      else if (b) store.assign(b.id, table.id, index);
    });
    pulse([`${table.id}#${target}`]);
  }

  return (
    <ol className="flex flex-col">
      {bySeat.map((guest, index) => (
        <li
          key={index}
          className="group flex h-7 items-center gap-1.5 text-[13px]"
          onPointerEnter={() => setHoverGuests(guest ? [guest.id] : [])}
          onPointerLeave={() => setHoverGuests([])}
        >
          <span className="w-4 shrink-0 text-right text-micro text-slate">{index + 1}</span>
          {guest ? (
            <>
              <span className="min-w-0 flex-1 truncate">{guest.name}</span>
              <span className="hidden gap-0.5 group-hover:flex">
                <IconButton label="Move up one seat" onClick={() => move(index, -1)}>
                  <Chevron up />
                </IconButton>
                <IconButton label="Move down one seat" onClick={() => move(index, 1)}>
                  <Chevron />
                </IconButton>
                <IconButton
                  label={`Unseat ${guest.name}`}
                  onClick={() =>
                    withHistoryGroup(() => useProjectStore.getState().unassign([guest.id]))
                  }
                >
                  <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </IconButton>
              </span>
            </>
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 text-left text-slate hover:text-ink"
              onClick={() => {
                if (armedGuestIds.length !== 1) return;
                const ok = withHistoryGroup(() =>
                  useProjectStore.getState().assign(armedGuestIds[0] as Id, table.id, index),
                );
                if (ok) {
                  pulse([`${table.id}#${index}`]);
                  armGuests([]);
                }
              }}
            >
              {armedGuestIds.length === 1 ? 'Seat here' : 'Empty'}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="11"
      height="11"
      aria-hidden="true"
      style={up ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MultiTable({ ids }: { ids: Id[] }) {
  const clearSelection = useUiStore((s) => s.clearSelection);
  const select = useUiStore((s) => s.select);
  return (
    <Section>
      <SectionTitle>{ids.length} tables</SectionTitle>
      <p className="mb-3 text-[13px] text-slate">
        Drag to move them together, or use the arrow keys to nudge.
      </p>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            const made = withHistoryGroup(() => useProjectStore.getState().duplicateTables(ids));
            if (made.length) select({ kind: 'tables', ids: made });
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            withHistoryGroup(() => useProjectStore.getState().removeTables(ids));
            clearSelection();
          }}
        >
          Delete {ids.length}
        </Button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Guests
// ---------------------------------------------------------------------------

function GuestInspector({ guest }: { guest: Guest }) {
  const tables = useProjectStore((s) => s.tables);
  const parties = useProjectStore(partyLookup);
  const table = guest.seat ? tables.find((t) => t.id === guest.seat?.tableId) : undefined;
  const select = useUiStore((s) => s.select);

  function update(patch: Partial<Guest>) {
    withHistoryGroup(() => useProjectStore.getState().updateGuest(guest.id, patch));
  }

  return (
    <>
      <Section>
        <SectionTitle>Guest</SectionTitle>
        <div className="flex flex-col gap-2.5">
          <Field label="Name" value={guest.name} onChange={(e) => update({ name: e.target.value })} />
          <Field
            label="Tags"
            value={guest.tags.join(', ')}
            placeholder="bride side, vegetarian"
            onChange={(e) =>
              update({
                tags: e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
          <Field
            label="Notes"
            value={guest.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
          <label className="flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[color:var(--sage)]"
              checked={guest.locked}
              onChange={(e) => update({ locked: e.target.checked })}
            />
            Keep this seat when auto-arranging
          </label>
        </div>
      </Section>

      <Section>
        <p className="text-[13px]">
          {guest.partyId && (
            <span className="text-slate">
              Party: <span className="text-ink">{parties.get(guest.partyId)?.label}</span>
              <br />
            </span>
          )}
          <span className="text-slate">Seat: </span>
          {table ? (
            <button
              type="button"
              className="text-ink underline decoration-[color:var(--hairline)] underline-offset-2 hover:decoration-ink"
              onClick={() => select({ kind: 'tables', ids: [table.id] })}
            >
              {table.label}, seat {(guest.seat?.index ?? 0) + 1}
            </button>
          ) : (
            <span className="text-ink">not seated</span>
          )}
        </p>
        {table && (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => withHistoryGroup(() => useProjectStore.getState().unassign([guest.id]))}
          >
            Return to unassigned
          </Button>
        )}
      </Section>

      <ConstraintEditor guest={guest} />
    </>
  );
}

function ConstraintEditor({ guest }: { guest: Guest }) {
  const guests = useProjectStore((s) => s.guests);
  const constraints = useProjectStore((s) => s.constraints);
  const select = useUiStore((s) => s.select);
  const [kind, setKind] = useState<'together' | 'apart'>('apart');
  const [query, setQuery] = useState('');

  const mine = useMemo(
    () => constraints.filter((c) => c.a === guest.id || c.b === guest.id),
    [constraints, guest.id],
  );

  const byId = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const already = new Set(mine.map((c) => (c.a === guest.id ? c.b : c.a)));
    return guests
      .filter(
        (g) =>
          g.id !== guest.id && !already.has(g.id) && g.name.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [query, guests, guest.id, mine]);

  return (
    <Section>
      <SectionTitle>Seating rules</SectionTitle>

      {mine.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {mine.map((c) => {
            const otherId = c.a === guest.id ? c.b : c.a;
            const other = byId.get(otherId);
            return (
              <li key={c.id} className="flex items-center gap-1.5 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="text-slate">
                    {c.kind === 'apart' ? 'Not with ' : 'With '}
                  </span>
                  <button
                    type="button"
                    className="underline decoration-[color:var(--hairline)] underline-offset-2 hover:decoration-ink"
                    onClick={() => other && select({ kind: 'guests', ids: [other.id] })}
                  >
                    {other?.name ?? 'unknown guest'}
                  </button>
                </span>
                <IconButton
                  label="Remove this rule"
                  onClick={() =>
                    withHistoryGroup(() => useProjectStore.getState().removeConstraint(c.id))
                  }
                >
                  <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                    <path
                      d="M3 3l6 6M9 3l-6 6"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div
          className="inline-flex rounded-[3px] border border-[color:var(--hairline)] bg-paper p-0.5"
          role="radiogroup"
          aria-label="Rule type"
        >
          {(
            [
              ['apart', 'Must not sit with…'],
              ['together', 'Must sit with…'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              className={cx(
                'flex-1 rounded-[2px] px-2 py-1 text-[12px] transition-colors',
                kind === value ? 'bg-ink text-paper' : 'text-slate hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Field
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a guest"
          aria-label="Find a guest for this rule"
        />

        {matches.length > 0 && (
          <ul className="overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-paper">
            {matches.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="block w-full px-2 py-1.5 text-left text-[13px] hover:bg-[color:rgba(22,32,43,0.06)]"
                  onClick={() => {
                    withHistoryGroup(() =>
                      useProjectStore.getState().addConstraint(kind, guest.id, g.id),
                    );
                    setQuery('');
                  }}
                >
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
