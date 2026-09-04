import { useEffect } from 'react';
import { LAYOUT_LIMITS, useUiStore } from '@/store/ui';
import { redo, undo } from '@/store/project';
import { Toolbar } from '@/panels/Toolbar';
import { GuestPanel } from '@/panels/GuestPanel';
import { Inspector } from '@/panels/Inspector';
import { FloorPlan } from '@/canvas/FloorPlan';
import { ViolationsPanel } from '@/panels/ViolationsPanel';
import { Resizer } from './Resizer';
import { Notices } from './Notices';
import { FirstRun } from './FirstRun';
import { BottomSheet } from './BottomSheet';
import { usePersistence } from './usePersistence';
import { useLicenseOnBoot } from './useLicenseOnBoot';
import { initEventsPlanned } from './eventsPlanned';
import { useViewport } from './useViewport';
import { IconButton } from '@/ui/primitives';

export function App() {
  const boot = usePersistence();
  useEffect(() => {
    initEventsPlanned();
  }, []);
  const viewport = useViewport();
  useLicenseOnBoot();
  useUndoShortcuts();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-linen">
      <Toolbar compact={viewport !== 'desktop'} />
      <FirstRun boot={boot} />
      {viewport === 'desktop' ? <DesktopLayout /> : <CompactLayout viewport={viewport} />}
    </div>
  );
}

function DesktopLayout() {
  const leftWidth = useUiStore((s) => s.leftWidth);
  const rightWidth = useUiStore((s) => s.rightWidth);
  const leftCollapsed = useUiStore((s) => s.leftCollapsed);
  const rightCollapsed = useUiStore((s) => s.rightCollapsed);
  const setLayout = useUiStore((s) => s.setLayout);

  return (
    <div className="flex min-h-0 flex-1">
      {leftCollapsed ? (
        <CollapsedRail
          label="Show guest list"
          onExpand={() => setLayout({ leftCollapsed: false })}
          text="Guests"
        />
      ) : (
        <>
          <aside
            style={{ width: leftWidth }}
            className="flex min-h-0 shrink-0 flex-col bg-linen"
            aria-label="Guest list"
          >
            <GuestPanel />
          </aside>
          <Resizer
            side="left"
            label="Resize guest list"
            value={leftWidth}
            min={LAYOUT_LIMITS.left.min}
            max={LAYOUT_LIMITS.left.max}
            onChange={(next) => setLayout({ leftWidth: next })}
          />
        </>
      )}

      <main className="relative min-w-0 flex-1 bg-paper" aria-label="Floor plan">
        <FloorPlan />
        <ViolationsPanel />
        <Notices />
      </main>

      {rightCollapsed ? (
        <CollapsedRail
          label="Show inspector"
          onExpand={() => setLayout({ rightCollapsed: false })}
          text="Inspector"
        />
      ) : (
        <>
          <Resizer
            side="right"
            label="Resize inspector"
            value={rightWidth}
            min={LAYOUT_LIMITS.right.min}
            max={LAYOUT_LIMITS.right.max}
            onChange={(next) => setLayout({ rightWidth: next })}
          />
          <aside
            style={{ width: rightWidth }}
            className="flex min-h-0 shrink-0 flex-col bg-linen"
            aria-label="Inspector"
          >
            <Inspector />
          </aside>
        </>
      )}
    </div>
  );
}

function CompactLayout({ viewport }: { viewport: 'phone' | 'tablet' }) {
  const readOnly = viewport === 'phone';

  return (
    <div className="relative min-h-0 flex-1">
      {readOnly && (
        <div className="flex items-start gap-2 border-b border-[color:var(--hairline)] bg-[color:rgba(78,107,87,0.09)] px-3 py-2">
          <p className="text-[13px]">
            Planning works best on a larger screen. You can still look through the plan and export
            it from here.
          </p>
        </div>
      )}

      <main className="relative h-full min-h-0 bg-paper" aria-label="Floor plan">
        <FloorPlan showToolbar={!readOnly} />
        <ViolationsPanel />
        <Notices />
      </main>

      {/* Guest list stays available on phone for viewing (and light edits); table
          arrangement is what stays desktop/tablet-only. */}
      <BottomSheet />
    </div>
  );
}

function CollapsedRail({
  label,
  text,
  onExpand,
}: {
  label: string;
  text: string;
  onExpand: () => void;
}) {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-2 border-x border-[color:var(--hairline)] bg-linen py-2">
      <IconButton label={label} onClick={onExpand}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M6 3.5 10.5 8 6 12.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </IconButton>
      <span className="text-micro tracking-wide text-slate" style={{ writingMode: 'vertical-rl' }}>
        {text}
      </span>
    </div>
  );
}

function useUndoShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      // Let text fields keep their own undo stack.
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
