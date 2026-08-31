import { useState } from 'react';
import { GuestPanel } from '@/panels/GuestPanel';
import { useProjectStore } from '@/store/project';
import { counters } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import { cx } from '@/ui/primitives';

/**
 * The guest list on a tablet. Collapsed it is a single summary bar; expanded it
 * covers the lower half of the screen. Assignment goes through select-then-tap,
 * so the sheet closing after a pick is part of the flow rather than a nuisance.
 */
export function BottomSheet() {
  const [open, setOpen] = useState(false);
  const c = useProjectStore(counters);
  const armed = useUiStore((s) => s.armedGuestIds.length);

  // Picking someone means the next tap belongs to the plan, not the list.
  const shouldCollapse = armed > 0;
  const expanded = open && !shouldCollapse;

  return (
    <div
      className={cx(
        'absolute inset-x-0 bottom-0 z-30 flex flex-col border-t border-[color:var(--hairline)] bg-linen shadow-lift',
        expanded ? 'h-[55%]' : 'h-11',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex h-11 shrink-0 items-center gap-2 px-3 text-left"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          className={cx('text-slate transition-transform', expanded && 'rotate-180')}
        >
          <path
            d="M4 10 8 6l4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-serif text-[14px] font-semibold">Guests</span>
        <span className="text-micro text-slate">
          {c.unassigned} to seat · {c.seated} seated
        </span>
        {armed > 0 && (
          <span className="ml-auto rounded-[2px] bg-ink px-2 py-0.5 text-micro text-paper">
            Tap a table
          </span>
        )}
      </button>

      {expanded && (
        <div className="min-h-0 flex-1">
          <GuestPanel />
        </div>
      )}
    </div>
  );
}
