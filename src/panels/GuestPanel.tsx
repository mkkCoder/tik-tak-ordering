import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useProjectStore, withHistoryGroup } from '@/store/project';
import { counters } from '@/store/selectors';
import { violatingGuests } from '@/model/constraints';
import { violations } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import type { Id } from '@/model/types';
import { Button, Dialog, Field, IconButton, cx } from '@/ui/primitives';
import { buildRows, rowGuestIds, type GuestRow } from './guestRows';

const ROW_HEIGHT = 30;

export function GuestPanel() {
  const guests = useProjectStore((s) => s.guests);
  const parties = useProjectStore((s) => s.parties);
  const tables = useProjectStore((s) => s.tables);
  const c = useProjectStore(counters);
  const flagged = useProjectStore((s) => violatingGuests(violations(s)));

  const armedGuestIds = useUiStore((s) => s.armedGuestIds);
  const armGuests = useUiStore((s) => s.armGuests);
  const hoverGuestIds = useUiStore((s) => s.hoverGuestIds);
  const setHoverGuests = useUiStore((s) => s.setHoverGuests);
  const setHoverTable = useUiStore((s) => s.setHoverTable);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'unassigned' | 'all'>('unassigned');
  const [checked, setChecked] = useState<ReadonlySet<Id>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<Id>>(new Set());
  const [editing, setEditing] = useState<Id | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Typing stays responsive on a large list: the input updates immediately,
  // the filtered rows catch up a frame later.
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(
    () => buildRows({ guests, parties, tables, query: deferredQuery, scope, collapsed }),
    [guests, parties, tables, deferredQuery, scope, collapsed],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey: (i) => rows[i]?.key ?? i,
  });

  const hoverSet = useMemo(() => new Set(hoverGuestIds), [hoverGuestIds]);
  const armedSet = useMemo(() => new Set(armedGuestIds), [armedGuestIds]);

  const toggleChecked = useCallback((ids: Id[], on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const checkedIds = useMemo(() => [...checked], [checked]);

  // Parties the selection could join, with their current size so two families
  // called "Cohen" can be told apart. A party everyone selected is already in
  // is dropped: offering it would be a no-op.
  const partyChoices = useMemo(() => {
    const size = new Map<Id, number>();
    const partyOf = new Map<Id, Id | null>();
    for (const g of guests) {
      partyOf.set(g.id, g.partyId);
      if (g.partyId) size.set(g.partyId, (size.get(g.partyId) ?? 0) + 1);
    }
    const selectedParties = new Set(checkedIds.map((id) => partyOf.get(id) ?? null));
    const redundant = selectedParties.size === 1 ? [...selectedParties][0] : null;
    return parties
      .filter((p) => p.id !== redundant)
      .map((p) => ({ id: p.id, label: p.label, size: size.get(p.id) ?? 0 }));
  }, [guests, parties, checkedIds]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-[color:var(--hairline)]">
      <Header
        counters={c}
        scope={scope}
        onScope={setScope}
        total={rows.length}
      />

      <QuickAdd />

      <div className="px-3 pb-2">
        <Field
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names, parties, tags"
          aria-label="Search guests"
          type="search"
        />
      </div>

      {checkedIds.length > 0 && (
        <SelectionBar
          count={checkedIds.length}
          onGroup={() => setGrouping(true)}
          onDelete={() => setConfirmDelete(true)}
          onClear={() => setChecked(new Set())}
        />
      )}

      <div
        ref={scrollRef}
        className="tk-scroll min-h-0 flex-1 overflow-y-auto"
        onPointerLeave={() => setHoverGuests([])}
      >
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-slate">
            {guests.length === 0
              ? 'No guests yet. Add one above, or import a list.'
              : scope === 'unassigned'
                ? 'Everyone is seated.'
                : 'No guests match that search.'}
          </p>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
            role="list"
            aria-label="Guests"
          >
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return (
                <div
                  key={item.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <Row
                    row={row}
                    checked={checked}
                    onToggleChecked={toggleChecked}
                    collapsed={collapsed}
                    onToggleCollapsed={(id) =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    editing={editing}
                    onEdit={setEditing}
                    flagged={flagged}
                    hovered={hoverSet}
                    armed={armedSet}
                    onArm={armGuests}
                    onHover={(ids, tableId) => {
                      setHoverGuests(ids);
                      setHoverTable(tableId);
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <GroupDialog
        open={grouping}
        count={checkedIds.length}
        parties={partyChoices}
        onClose={() => setGrouping(false)}
        onCreate={(label) => {
          withHistoryGroup(() => useProjectStore.getState().groupAsParty(checkedIds, label));
          setChecked(new Set());
          setGrouping(false);
        }}
        onAdd={(partyId) => {
          withHistoryGroup(() => useProjectStore.getState().addToParty(checkedIds, partyId));
          setChecked(new Set());
          setGrouping(false);
        }}
      />

      <Dialog
        open={confirmDelete}
        title={`Delete ${checkedIds.length} ${checkedIds.length === 1 ? 'guest' : 'guests'}?`}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                withHistoryGroup(() => useProjectStore.getState().removeGuests(checkedIds));
                setChecked(new Set());
                setConfirmDelete(false);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          They lose their seats and any rules about who they sit with. You can undo this with
          Cmd/Ctrl+Z.
        </p>
      </Dialog>
    </div>
  );
}

function Header({
  counters: c,
  scope,
  onScope,
  total,
}: {
  counters: ReturnType<typeof counters>;
  scope: 'unassigned' | 'all';
  onScope: (s: 'unassigned' | 'all') => void;
  total: number;
}) {
  return (
    <div className="px-3 pb-2 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-[15px] font-semibold">Guests</h2>
        <span className="text-micro text-slate">{total} shown</span>
      </div>
      <p className="mt-0.5 text-micro text-slate">
        {c.guests} guests · {c.seated} seated · {c.unassigned} unassigned
      </p>
      <div
        className="mt-2 inline-flex rounded-[3px] border border-[color:var(--hairline)] bg-paper p-0.5"
        role="tablist"
        aria-label="Which guests to show"
      >
        {(['unassigned', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={scope === value}
            onClick={() => onScope(value)}
            className={cx(
              'rounded-[2px] px-2.5 py-1 text-[12px] capitalize transition-colors',
              scope === value ? 'bg-ink text-paper' : 'text-slate hover:text-ink',
            )}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickAdd() {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const name = value.trim();
    if (!name) return;
    withHistoryGroup(() => useProjectStore.getState().addGuest(name));
    setValue('');
    inputRef.current?.focus();
  }

  return (
    <form
      className="flex items-end gap-1.5 px-3 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="min-w-0 flex-1">
        <Field
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a guest, then press Enter"
          aria-label="Add a guest"
        />
      </div>
      <Button type="submit" variant="primary" disabled={!value.trim()}>
        Add
      </Button>
    </form>
  );
}

function SelectionBar({
  count,
  onGroup,
  onDelete,
  onClear,
}: {
  count: number;
  onGroup: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border-y border-[color:var(--hairline)] bg-paper px-3 py-1.5">
      <span className="text-[12px] text-slate">{count} selected</span>
      <div className="ml-auto flex items-center gap-1.5">
        {/* One dialog, two outcomes: join a family that exists, or start one. */}
        <Button size="sm" onClick={onGroup}>
          Group…
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          Delete
        </Button>
        <IconButton label="Clear selection" onClick={onClear}>
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}

interface RowProps {
  row: GuestRow;
  checked: ReadonlySet<Id>;
  onToggleChecked: (ids: Id[], on: boolean) => void;
  collapsed: ReadonlySet<Id>;
  onToggleCollapsed: (id: Id) => void;
  editing: Id | null;
  onEdit: (id: Id | null) => void;
  flagged: ReadonlySet<Id>;
  hovered: ReadonlySet<Id>;
  armed: ReadonlySet<Id>;
  onArm: (ids: Id[]) => void;
  onHover: (ids: Id[], tableId: Id | null) => void;
}

function Row(props: RowProps) {
  const { row } = props;
  return row.kind === 'party' ? <PartyRow {...props} row={row} /> : <GuestItem {...props} row={row} />;
}

function PartyRow({
  row,
  checked,
  onToggleChecked,
  collapsed,
  onToggleCollapsed,
  onArm,
  onHover,
}: RowProps & { row: Extract<GuestRow, { kind: 'party' }> }) {
  const ids = rowGuestIds(row);
  const allChecked = ids.every((id) => checked.has(id));
  const isCollapsed = collapsed.has(row.party.id);
  const unseated = row.members.length - row.seatedCount;

  return (
    <div
      role="listitem"
      className="flex h-[30px] items-center gap-1.5 px-3 hover:bg-[color:rgba(22,32,43,0.04)]"
      onPointerEnter={() => onHover(ids, null)}
      draggable={unseated > 0}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/x-tiktak-guests',
          JSON.stringify(row.members.filter((m) => !m.seat).map((m) => m.id)),
        );
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 accent-[color:var(--sage)]"
        checked={allChecked}
        aria-label={`Select everyone in ${row.party.label}`}
        onChange={(e) => onToggleChecked(ids, e.target.checked)}
      />
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
        onClick={() => onToggleCollapsed(row.party.id)}
        aria-expanded={!isCollapsed}
      >
        <svg
          viewBox="0 0 12 12"
          width="10"
          height="10"
          aria-hidden="true"
          className={cx('shrink-0 text-slate transition-transform', !isCollapsed && 'rotate-90')}
        >
          <path
            d="M4.5 2.5 8 6l-3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="truncate text-[13px] font-medium">{row.party.label}</span>
        <span className="shrink-0 text-micro text-slate">({row.members.length})</span>
      </button>
      {unseated > 0 && (
        <button
          type="button"
          onClick={() => onArm(row.members.filter((m) => !m.seat).map((m) => m.id))}
          className="shrink-0 rounded-[2px] px-1.5 py-0.5 text-micro text-slate hover:bg-[color:rgba(22,32,43,0.07)] hover:text-ink"
        >
          {unseated === row.members.length ? 'Seat' : `Seat ${unseated} more`}
        </button>
      )}
    </div>
  );
}

function GuestItem({
  row,
  checked,
  onToggleChecked,
  editing,
  onEdit,
  flagged,
  hovered,
  armed,
  onArm,
  onHover,
}: RowProps & { row: Extract<GuestRow, { kind: 'guest' }> }) {
  const guest = row.guest;
  const tables = useProjectStore((s) => s.tables);
  const table = guest.seat ? tables.find((t) => t.id === guest.seat?.tableId) : undefined;
  const isEditing = editing === guest.id;
  const isFlagged = flagged.has(guest.id);
  const isHovered = hovered.has(guest.id);
  const isArmed = armed.has(guest.id);

  return (
    <div
      role="listitem"
      className={cx(
        'flex h-[30px] items-center gap-1.5 px-3',
        row.indented && 'pl-8',
        isHovered && 'bg-[color:rgba(78,107,87,0.13)]',
        isArmed && 'bg-[color:rgba(78,107,87,0.2)]',
        !isHovered && !isArmed && 'hover:bg-[color:rgba(22,32,43,0.04)]',
      )}
      onPointerEnter={() => onHover([guest.id], guest.seat?.tableId ?? null)}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-tiktak-guests', JSON.stringify([guest.id]));
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 accent-[color:var(--sage)]"
        checked={checked.has(guest.id)}
        aria-label={`Select ${guest.name}`}
        onChange={(e) => onToggleChecked([guest.id], e.target.checked)}
      />

      {isEditing ? (
        <input
          autoFocus
          defaultValue={guest.name}
          aria-label="Guest name"
          className="h-6 min-w-0 flex-1 rounded-[2px] border border-sage bg-paper px-1 text-[13px] outline-none"
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== guest.name) {
              withHistoryGroup(() => useProjectStore.getState().updateGuest(guest.id, { name }));
            }
            onEdit(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              (e.target as HTMLInputElement).value = guest.name;
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[13px]"
          onClick={() => onArm([guest.id])}
          onDoubleClick={() => onEdit(guest.id)}
          title={guest.name}
        >
          {guest.name}
          {isFlagged && (
            <span className="ml-1.5 align-middle text-flag" aria-label="Has a conflict">
              ●
            </span>
          )}
        </button>
      )}

      {!isEditing && table && (
        <span className="shrink-0 text-micro text-slate" title={`Seated at ${table.label}`}>
          {table.label}
        </span>
      )}
    </div>
  );
}

/**
 * One dialog for both halves of the same question: which party do these guests
 * belong to?
 *
 * It used to only make new ones, which meant a late RSVP joining the Cohens
 * required re-selecting the whole family and grouping again — and that quietly
 * replaced the party, losing the name the user had typed for it. Existing
 * parties come first here because that is the more common move once a list has
 * been entered; a brand-new party is still a name and one press away.
 */
function GroupDialog({
  open,
  count,
  parties,
  onClose,
  onCreate,
  onAdd,
}: {
  open: boolean;
  count: number;
  parties: Array<{ id: Id; label: string; size: number }>;
  onClose: () => void;
  onCreate: (label: string) => void;
  onAdd: (partyId: Id) => void;
}) {
  const [label, setLabel] = useState('');
  const noun = count === 1 ? 'guest' : 'guests';

  // Clear the name between openings. Left alone, the field still held "Cohen"
  // from the last party, so pressing Enter to add the next guest made a second
  // family with the same name instead of joining the first.
  useEffect(() => {
    if (open) setLabel('');
  }, [open]);

  return (
    <Dialog
      open={open}
      title={`Put ${count} ${noun} in a party`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onCreate(label)}>
            {parties.length > 0 ? 'Create party' : `Group ${count}`}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-slate">
        A party arrives together and is seated together. Auto-arrange keeps them at one table.
      </p>

      {parties.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-micro uppercase tracking-wide text-slate">
            Add to an existing party
          </p>
          <ul className="tk-scroll max-h-40 overflow-y-auto rounded-[3px] border border-[color:var(--hairline)]">
            {parties.map((p) => (
              <li key={p.id} className="border-b border-[color:var(--hairline)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => onAdd(p.id)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-[color:rgba(22,32,43,0.06)]"
                >
                  <span className="truncate">{p.label}</span>
                  <span className="shrink-0 text-micro text-slate">
                    {p.size} {p.size === 1 ? 'guest' : 'guests'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Field
        data-autofocus
        label={parties.length > 0 ? 'Or start a new party' : 'Party name'}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Cohen +3"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCreate(label);
        }}
      />
    </Dialog>
  );
}
