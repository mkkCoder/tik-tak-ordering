import { useProjectStore } from '@/store/project';
import { violations } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import { IconButton } from '@/ui/primitives';

/**
 * Every broken rule in one list. Opens from the toolbar; a row jumps the canvas
 * to the table so the fix is one click from the complaint.
 */
export function ViolationsPanel() {
  const open = useUiStore((s) => s.violationsOpen);
  const setOpen = useUiStore((s) => s.setViolationsOpen);
  const focusTable = useUiStore((s) => s.focusTable);
  const setHoverGuests = useUiStore((s) => s.setHoverGuests);
  const list = useProjectStore(violations);
  const tables = useProjectStore((s) => s.tables);

  if (!open) return null;

  return (
    <aside
      className="absolute right-3 top-3 z-20 w-72 overflow-hidden rounded-[4px] border border-[color:var(--hairline)] bg-linen shadow-lift"
      aria-label="Conflicts"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--hairline)] px-3 py-2">
        <h2 className="flex-1 font-serif text-[14px] font-semibold">
          {list.length === 0
            ? 'No conflicts'
            : `${list.length} ${list.length === 1 ? 'conflict' : 'conflicts'}`}
        </h2>
        <IconButton label="Close conflicts" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </IconButton>
      </div>

      {list.length === 0 ? (
        <p className="px-3 py-3 text-[13px] text-slate">
          Every seating rule is satisfied, or waiting on someone still unseated.
        </p>
      ) : (
        <ul className="tk-scroll max-h-[50vh] overflow-y-auto">
          {list.map((v) => {
            const first = v.tables[0];
            const label = tables.find((t) => t.id === first)?.label;
            return (
              <li key={v.constraintId}>
                <button
                  type="button"
                  className="block w-full border-b border-[color:var(--hairline)] px-3 py-2 text-left last:border-b-0 hover:bg-[color:rgba(22,32,43,0.05)]"
                  onPointerEnter={() => setHoverGuests([...v.guests])}
                  onPointerLeave={() => setHoverGuests([])}
                  onClick={() => first && focusTable(first)}
                >
                  <span className="block text-[13px] text-ink">{v.message}</span>
                  {label && <span className="block text-micro text-slate">{label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
