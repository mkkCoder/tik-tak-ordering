import { useState } from 'react';
import { useProjectStore, withHistoryGroup } from '@/store/project';
import { toProject, unassignedGuests } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import { DEFAULT_ITERATIONS, arrange } from '@/model/arrange';
import { Button, Dialog, cx } from '@/ui/primitives';

/**
 * Auto-arrange is one undo step, however many people it moves. Anything else
 * would be unusable: nobody wants to press Cmd+Z a hundred and fifty times
 * because they preferred the room the way it was.
 */
export function AutoArrangeButton() {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'unassigned' | 'all'>('unassigned');
  const [busy, setBusy] = useState(false);
  const notify = useUiStore((s) => s.notify);
  const guestCount = useProjectStore((s) => s.guests.length);
  const tableCount = useProjectStore((s) => s.tables.length);
  const waiting = useProjectStore((s) => unassignedGuests(s).length);

  function run() {
    setBusy(true);
    try {
      const project = toProject(useProjectStore.getState());
      const result = arrange(project, {
        scope,
        // Wall-clock seed: pressing the button again is allowed to try a
        // different arrangement, while a single run stays reproducible.
        seed: Date.now() % 2147483647,
        iterations: DEFAULT_ITERATIONS,
      });

      withHistoryGroup(() => {
        const store = useProjectStore.getState();
        if (scope === 'all') {
          const frozen = new Set(result.placements.map((p) => p.guestId));
          const toClear = project.guests
            .filter((g) => g.seat && !frozen.has(g.id) && !g.locked)
            .map((g) => g.id);
          if (toClear.length) store.unassign(toClear);
        }
        store.assignMany(result.placements);
      });

      const parts = [`Seated ${result.seatedCount} guests.`];
      if (result.violations > 0) {
        parts.push(
          `${result.violations} ${result.violations === 1 ? 'conflict remains' : 'conflicts remain'}.`,
        );
      }
      if (result.unseated.length > 0) {
        parts.push(`${result.unseated.length} could not fit — add more tables.`);
      }
      notify(parts.join(' '), result.violations > 0 || result.unseated.length > 0 ? 'refusal' : 'info');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  const disabled = guestCount === 0 || tableCount === 0;

  return (
    <>
      <Button size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Auto-arrange
      </Button>

      <Dialog
        open={open}
        title="Arrange the room"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={run}>
              {busy ? 'Arranging…' : 'Arrange'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-slate">
          Parties are kept together, seating rules are respected where possible, and anyone you
          locked stays put. One press of Cmd/Ctrl+Z undoes the whole thing.
        </p>

        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="What to arrange">
          <Choice
            checked={scope === 'unassigned'}
            onSelect={() => setScope('unassigned')}
            title={`Only unassigned guests (${waiting})`}
            detail="Everyone already seated stays exactly where they are."
          />
          <Choice
            checked={scope === 'all'}
            onSelect={() => setScope('all')}
            title="Rearrange everything"
            detail="Starts fresh from the whole guest list. Locked guests and locked tables are still left alone."
          />
        </div>
      </Dialog>
    </>
  );
}

function Choice({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cx(
        'rounded-[3px] border px-2.5 py-2 text-left transition-colors',
        checked
          ? 'border-sage bg-[color:rgba(78,107,87,0.09)]'
          : 'border-[color:var(--hairline)] hover:bg-[color:rgba(22,32,43,0.04)]',
      )}
    >
      <span className="block text-[13px] font-medium">{title}</span>
      <span className="block text-micro text-slate">{detail}</span>
    </button>
  );
}
