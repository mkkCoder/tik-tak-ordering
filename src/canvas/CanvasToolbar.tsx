import { useProjectStore, withHistoryGroup } from '@/store/project';
import { useUiStore } from '@/store/ui';
import type { TableShape } from '@/model/types';
import { Button, IconButton, cx } from '@/ui/primitives';

const ROUND_SIZES = [6, 8, 10, 12] as const;

/**
 * Adding furniture. Floats over the plan rather than sitting in a rail: the
 * plan is the hero, and the toolbar is only needed in bursts.
 */
export function CanvasToolbar({
  onZoom,
  onFit,
  zoom,
}: {
  onZoom: (factor: number) => void;
  onFit: () => void;
  zoom: number;
}) {
  const select = useUiStore((s) => s.select);

  function add(shape: TableShape, seats?: number) {
    const state = useProjectStore.getState();
    const id = withHistoryGroup(() => state.addTable(shape, placeNear(state.tables), seats));
    select({ kind: 'tables', ids: [id] });
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex max-w-[calc(100%-0.5rem)] flex-wrap items-center justify-center gap-1 rounded-[4px] border border-[color:var(--hairline)] bg-linen/95 p-1 shadow-lift backdrop-blur">
        <span className="px-2 text-micro text-slate">Round</span>
        {ROUND_SIZES.map((seats) => (
          <Button
            key={seats}
            size="sm"
            onClick={() => add('round', seats)}
            aria-label={`Add a round table with ${seats} seats`}
            title={`Round table, ${seats} seats`}
          >
            {seats}
          </Button>
        ))}

        <Divider />

        <Button size="sm" onClick={() => add('rect')}>
          Rectangular
        </Button>
        <Button size="sm" onClick={() => add('head')}>
          Head table
        </Button>
        <Button size="sm" onClick={() => add('sweetheart')}>
          Sweetheart
        </Button>

        <Divider />

        <IconButton label="Zoom out" onClick={() => onZoom(1 / 1.25)}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </IconButton>
        <button
          type="button"
          onClick={onFit}
          aria-label="Fit the seating chart to the window"
          className={cx(
            'h-7 min-w-[3.25rem] rounded-[3px] text-[12px] text-slate',
            'hover:bg-[color:rgba(22,32,43,0.07)] hover:text-ink',
          )}
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => onZoom(1.25)}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M8 3.5v9M3.5 8h9"
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

function Divider() {
  return <div className="mx-1 h-5 w-px bg-[color:var(--hairline)]" aria-hidden="true" />;
}

/**
 * Drop a new table where there is room, rather than stacking every one on the
 * origin. Walks a widening spiral until it finds a clear spot.
 */
function placeNear(tables: readonly { x: number; y: number }[]): { x: number; y: number } {
  if (tables.length === 0) return { x: 0, y: 0 };
  const spacing = 45;
  for (let ring = 0; ring < 12; ring++) {
    const count = ring === 0 ? 1 : ring * 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.round((Math.cos(angle) * ring * spacing) / 5) * 5;
      const y = Math.round((Math.sin(angle) * ring * spacing) / 5) * 5;
      const clash = tables.some((t) => Math.hypot(t.x - x, t.y - y) < spacing * 0.8);
      if (!clash) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}
