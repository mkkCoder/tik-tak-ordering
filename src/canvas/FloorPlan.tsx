import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  beginHistoryGroup,
  endHistoryGroup,
  useProjectStore,
  withHistoryGroup,
} from '@/store/project';
import { occupancy, violations } from '@/store/selectors';
import { violatingTables } from '@/model/constraints';
import { useUiStore } from '@/store/ui';
import type { Id, Table } from '@/model/types';
import { consecutiveFreeSeats, nearestFreeSeat, tableReach } from '@/model/seating';
import { TableNode } from './TableNode';
import { CanvasToolbar } from './CanvasToolbar';
import { GRID_STEP, screenToPlan, snap, usePanZoom } from './usePanZoom';

const DRAG_MIME = 'application/x-tiktak-guests';

type Gesture =
  | { kind: 'none' }
  | {
      kind: 'move';
      pointerId: number;
      origin: { x: number; y: number };
      starts: Array<{ id: Id; x: number; y: number }>;
      moved: boolean;
    }
  | { kind: 'rotate'; pointerId: number; tableId: Id; centre: { x: number; y: number } }
  | { kind: 'marquee'; pointerId: number; from: { x: number; y: number }; to: { x: number; y: number } };

export interface FloorPlanProps {
  /** The landing-page hero shows the plan without the editing chrome. */
  showToolbar?: boolean;
}

export function FloorPlan({ showToolbar = true }: FloorPlanProps = {}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tables = useProjectStore((s) => s.tables);
  const guests = useProjectStore((s) => s.guests);
  const seatIndex = useProjectStore(occupancy);
  const flaggedTables = useProjectStore((s) => violatingTables(violations(s)));

  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const toggleTableSelected = useUiStore((s) => s.toggleTableSelected);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const armedGuestIds = useUiStore((s) => s.armedGuestIds);
  const armGuests = useUiStore((s) => s.armGuests);
  const hoverTableId = useUiStore((s) => s.hoverTableId);
  const setHoverTable = useUiStore((s) => s.setHoverTable);
  const setHoverGuests = useUiStore((s) => s.setHoverGuests);
  const hoverGuestIds = useUiStore((s) => s.hoverGuestIds);
  const pulseSeats = useUiStore((s) => s.pulseSeats);
  const focusRequest = useUiStore((s) => s.focusRequest);
  const pulse = useUiStore((s) => s.pulse);
  const notify = useUiStore((s) => s.notify);

  const { viewport, spaceHeld, localPoint, beginPan, updatePan, endPan, isPanning, zoomBy, fitToContent } =
    usePanZoom(svgRef);

  const [gesture, setGesture] = useState<Gesture>({ kind: 'none' });
  const [dropTarget, setDropTarget] = useState<Id | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const selectedTableIds = useMemo(
    () => new Set(selection.kind === 'tables' ? selection.ids : []),
    [selection],
  );
  const pulseSet = useMemo(() => new Set(pulseSeats), [pulseSeats]);
  const highlightGuests = useMemo(() => new Set(hoverGuestIds), [hoverGuestIds]);

  // Track the surface size so the grid covers it and "fit" has something to aim at.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /*
   * Keep the plan framed until the first time the user moves the view
   * themselves. Fitting only once is not enough: the surface is often measured
   * before the layout has settled (a panel still animating, the landing-page
   * hero still being sized), and a single early fit leaves the room stranded in
   * a corner. After any deliberate pan or zoom the view is theirs and is left
   * alone.
   */
  const userMovedView = useRef(false);
  useEffect(() => {
    if (userMovedView.current || size.width === 0 || size.height === 0) return;
    fitToContent();
  }, [size.width, size.height, tables.length, fitToContent]);

  // A click in the conflicts list brings its table into view.
  useEffect(() => {
    if (!focusRequest || size.width === 0) return;
    const table = useProjectStore.getState().tables.find((t) => t.id === focusRequest.tableId);
    if (!table) return;
    const { zoom } = useProjectStore.getState().canvas;
    useProjectStore.getState().setCanvas({
      panX: size.width / 2 - table.x * zoom,
      panY: size.height / 2 - table.y * zoom,
    });
  }, [focusRequest, size.width, size.height]);

  const planAt = useCallback(
    (clientX: number, clientY: number) => {
      const { x, y } = localPoint(clientX, clientY);
      return screenToPlan(viewport, x, y);
    },
    [localPoint, viewport],
  );

  const tableAtPoint = useCallback(
    (plan: { x: number; y: number }): Table | null => {
      // Last drawn wins, matching what the eye expects on overlap.
      for (let i = tables.length - 1; i >= 0; i--) {
        const t = tables[i];
        if (!t) continue;
        if (Math.hypot(t.x - plan.x, t.y - plan.y) <= tableReach(t)) return t;
      }
      return null;
    },
    [tables],
  );

  // -------------------------------------------------------------------------
  // Assignment
  // -------------------------------------------------------------------------

  const seatGuests = useCallback(
    (guestIds: Id[], table: Table, at: { x: number; y: number }) => {
      const state = useProjectStore.getState();
      const ids = guestIds.filter((id) => state.guests.some((g) => g.id === id));
      if (ids.length === 0) return;

      const taken = new Set<number>();
      for (const g of state.guests) {
        if (g.seat?.tableId === table.id && !ids.includes(g.id)) taken.add(g.seat.index);
      }
      const free = table.seats - taken.size;

      if (ids.length > free) {
        notify(
          `${table.label} has ${free} free ${free === 1 ? 'seat' : 'seats'}, this party needs ${ids.length}.`,
          'refusal',
        );
        return;
      }

      const indices =
        ids.length === 1
          ? [nearestFreeSeat(table, taken, at)].filter((n): n is number => n !== null)
          : (consecutiveFreeSeats(table, taken, ids.length, at) ??
            [...Array(table.seats).keys()].filter((i) => !taken.has(i)).slice(0, ids.length));

      if (indices.length < ids.length) {
        notify(`${table.label} doesn't have room for all of them.`, 'refusal');
        return;
      }

      const pairs = ids.map((guestId, i) => ({
        guestId,
        tableId: table.id,
        index: indices[i] as number,
      }));
      const ok = withHistoryGroup(() => useProjectStore.getState().assignMany(pairs));
      if (!ok) {
        notify(`Those seats at ${table.label} were taken. Try again.`, 'refusal');
        return;
      }
      pulse(pairs.map((p) => `${p.tableId}#${p.index}`));
      armGuests([]);
    },
    [notify, pulse, armGuests],
  );

  // -------------------------------------------------------------------------
  // Pointer gestures
  // -------------------------------------------------------------------------

  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.button === 1 || spaceHeld) {
        userMovedView.current = true;
        beginPan(e);
        return;
      }
      if (e.button !== 0) return;
      const { x, y } = localPoint(e.clientX, e.clientY);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setGesture({ kind: 'marquee', pointerId: e.pointerId, from: { x, y }, to: { x, y } });
      if (!e.shiftKey) clearSelection();
    },
    [spaceHeld, beginPan, localPoint, clearSelection],
  );

  const onTablePointerDown = useCallback(
    (e: React.PointerEvent, table: Table) => {
      if (spaceHeld || e.button !== 0) return;
      e.stopPropagation();

      // A guest is armed from the panel: this click seats them. The touch path.
      if (armedGuestIds.length > 0) {
        seatGuests(armedGuestIds, table, planAt(e.clientX, e.clientY));
        return;
      }

      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      toggleTableSelected(table.id, additive);

      if (table.locked) return;
      const ids = additive || !selectedTableIds.has(table.id)
        ? [table.id, ...(additive ? [...selectedTableIds] : [])]
        : [...selectedTableIds];
      const unique = [...new Set(ids)];
      const starts = useProjectStore
        .getState()
        .tables.filter((t) => unique.includes(t.id) && !t.locked)
        .map((t) => ({ id: t.id, x: t.x, y: t.y }));
      if (starts.length === 0) return;

      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      beginHistoryGroup();
      setGesture({
        kind: 'move',
        pointerId: e.pointerId,
        origin: planAt(e.clientX, e.clientY),
        starts,
        moved: false,
      });
    },
    [spaceHeld, armedGuestIds, seatGuests, planAt, toggleTableSelected, selectedTableIds],
  );

  const onRotateStart = useCallback(
    (e: React.PointerEvent, table: Table) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      beginHistoryGroup();
      setGesture({
        kind: 'rotate',
        pointerId: e.pointerId,
        tableId: table.id,
        centre: { x: table.x, y: table.y },
      });
    },
    [],
  );

  const onSeatPointerDown = useCallback(
    (e: React.PointerEvent, table: Table, index: number) => {
      if (spaceHeld || e.button !== 0) return;
      e.stopPropagation();
      const state = useProjectStore.getState();

      if (armedGuestIds.length > 0) {
        // Aim at this exact seat rather than the nearest one.
        const occupant = state.guests.find(
          (g) => g.seat?.tableId === table.id && g.seat.index === index,
        );
        if (!occupant && armedGuestIds.length === 1) {
          const ok = withHistoryGroup(() =>
            useProjectStore.getState().assign(armedGuestIds[0] as Id, table.id, index),
          );
          if (ok) {
            pulse([`${table.id}#${index}`]);
            armGuests([]);
          }
          return;
        }
        seatGuests(armedGuestIds, table, planAt(e.clientX, e.clientY));
        return;
      }

      const occupant = state.guests.find(
        (g) => g.seat?.tableId === table.id && g.seat.index === index,
      );
      if (occupant) {
        select({ kind: 'guests', ids: [occupant.id] });
        armGuests([occupant.id]);
        setHoverGuests([occupant.id]);
      } else {
        toggleTableSelected(table.id, false);
      }
    },
    [
      spaceHeld,
      armedGuestIds,
      seatGuests,
      planAt,
      pulse,
      armGuests,
      select,
      setHoverGuests,
      toggleTableSelected,
    ],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (updatePan(e)) return;
      if (gesture.kind === 'none') return;

      if (gesture.kind === 'move' && gesture.pointerId === e.pointerId) {
        const now = planAt(e.clientX, e.clientY);
        const dx = now.x - gesture.origin.x;
        const dy = now.y - gesture.origin.y;
        const snapping = !e.altKey;
        useProjectStore.getState().moveTables(
          gesture.starts.map((s) => ({
            id: s.id,
            x: snap(s.x + dx, snapping),
            y: snap(s.y + dy, snapping),
          })),
        );
        if (!gesture.moved && Math.hypot(dx, dy) > 0.5) {
          setGesture({ ...gesture, moved: true });
        }
        return;
      }

      if (gesture.kind === 'rotate' && gesture.pointerId === e.pointerId) {
        const now = planAt(e.clientX, e.clientY);
        const deg =
          (Math.atan2(now.y - gesture.centre.y, now.x - gesture.centre.x) * 180) / Math.PI + 90;
        const stepped = e.altKey ? deg : Math.round(deg / 15) * 15;
        useProjectStore
          .getState()
          .updateTable(gesture.tableId, { rotation: normalizeAngle(stepped) });
        return;
      }

      if (gesture.kind === 'marquee' && gesture.pointerId === e.pointerId) {
        const { x, y } = localPoint(e.clientX, e.clientY);
        setGesture({ ...gesture, to: { x, y } });
      }
    },
    [updatePan, gesture, planAt, localPoint],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (endPan(e)) return;
      if (gesture.kind === 'move' || gesture.kind === 'rotate') {
        endHistoryGroup();
      }
      if (gesture.kind === 'marquee') {
        const { from, to } = gesture;
        const a = screenToPlan(viewport, Math.min(from.x, to.x), Math.min(from.y, to.y));
        const b = screenToPlan(viewport, Math.max(from.x, to.x), Math.max(from.y, to.y));
        const dragged = Math.hypot(to.x - from.x, to.y - from.y) > 4;
        if (dragged) {
          const hit = tables
            .filter((t) => t.x >= a.x && t.x <= b.x && t.y >= a.y && t.y <= b.y)
            .map((t) => t.id);
          if (hit.length) select({ kind: 'tables', ids: hit });
        }
      }
      setGesture({ kind: 'none' });
    },
    [endPan, gesture, viewport, tables, select],
  );

  // -------------------------------------------------------------------------
  // Drag and drop from the guest panel
  // -------------------------------------------------------------------------

  const onDragOver = useCallback(
    (e: React.DragEvent<SVGSVGElement>) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = tableAtPoint(planAt(e.clientX, e.clientY));
      setDropTarget(target?.id ?? null);
    },
    [planAt, tableAtPoint],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<SVGSVGElement>) => {
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      setDropTarget(null);
      let ids: Id[] = [];
      try {
        ids = JSON.parse(raw) as Id[];
      } catch {
        return;
      }
      const plan = planAt(e.clientX, e.clientY);
      const table = tableAtPoint(plan);
      if (!table) {
        // Dropping on bare floor returns people to the pool.
        withHistoryGroup(() => useProjectStore.getState().unassign(ids));
        return;
      }
      seatGuests(ids, table, plan);
    },
    [planAt, tableAtPoint, seatGuests],
  );

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const state = useUiStore.getState();
      const ids = state.selection.kind === 'tables' ? state.selection.ids : [];

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault();
        const made = withHistoryGroup(() => useProjectStore.getState().duplicateTables(ids));
        if (made.length) state.select({ kind: 'tables', ids: made });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
        e.preventDefault();
        withHistoryGroup(() => useProjectStore.getState().removeTables(ids));
        state.clearSelection();
        return;
      }
      if (e.key === 'Escape') {
        state.clearSelection();
        return;
      }

      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-GRID_STEP, 0],
        ArrowRight: [GRID_STEP, 0],
        ArrowUp: [0, -GRID_STEP],
        ArrowDown: [0, GRID_STEP],
      };
      const delta = nudge[e.key];
      if (delta && ids.length) {
        e.preventDefault();
        const project = useProjectStore.getState();
        withHistoryGroup(() =>
          project.moveTables(
            project.tables
              .filter((t) => ids.includes(t.id) && !t.locked)
              .map((t) => ({ id: t.id, x: t.x + delta[0], y: t.y + delta[1] })),
          ),
        );
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const gridStep = adaptiveGridStep(viewport.zoom);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        style={{ cursor: spaceHeld ? (isPanning() ? 'grabbing' : 'grab') : 'default' }}
        onWheelCapture={() => {
          userMovedView.current = true;
        }}
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={() => setDropTarget(null)}
        role="application"
        aria-label="Floor plan. Arrow keys move the selected table."
      >
        <defs>
          {/* Drawn in screen units so lines stay exactly one pixel at any zoom. */}
          <pattern
            id="tk-grid"
            width={gridStep * viewport.zoom}
            height={gridStep * viewport.zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.panX % (gridStep * viewport.zoom)} ${
              viewport.panY % (gridStep * viewport.zoom)
            })`}
          >
            <path
              d={`M ${gridStep * viewport.zoom} 0 L 0 0 0 ${gridStep * viewport.zoom}`}
              fill="none"
              stroke="var(--slate)"
              strokeOpacity={0.16}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="var(--paper)" />
        <rect width="100%" height="100%" fill="url(#tk-grid)" />

        <g transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}>
          {tables.map((table) => (
            <TableNode
              key={table.id}
              table={table}
              seated={seatIndex.get(table.id) ?? EMPTY_SEATS}
              selected={selectedTableIds.has(table.id)}
              violated={flaggedTables.has(table.id)}
              hovered={hoverTableId === table.id || dropTarget === table.id}
              pulseSeats={pulseSet}
              highlightGuests={highlightGuests}
              zoom={viewport.zoom}
              onPointerDown={onTablePointerDown}
              onRotateStart={onRotateStart}
              onSeatPointerDown={onSeatPointerDown}
              onSelect={(t) => {
                if (armedGuestIds.length > 0) seatGuests(armedGuestIds, t, { x: t.x, y: t.y });
                else toggleTableSelected(t.id, false);
              }}
              onHover={(id) => {
                setHoverTable(id);
                setHoverGuests(
                  id
                    ? guests.filter((g) => g.seat?.tableId === id).map((g) => g.id)
                    : [],
                );
              }}
            />
          ))}
        </g>

        {gesture.kind === 'marquee' && (
          <rect
            x={Math.min(gesture.from.x, gesture.to.x)}
            y={Math.min(gesture.from.y, gesture.to.y)}
            width={Math.abs(gesture.to.x - gesture.from.x)}
            height={Math.abs(gesture.to.y - gesture.from.y)}
            fill="rgba(78,107,87,0.10)"
            stroke="var(--sage)"
            strokeWidth={1}
            strokeDasharray="3 3"
            role="presentation"
          />
        )}
      </svg>

      {showToolbar && tables.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-xs text-center text-[13px] text-slate">
            Add a table from the toolbar below to start laying out the room.
          </p>
        </div>
      )}

      {showToolbar && (
        <CanvasToolbar
          onZoom={(factor) => {
            userMovedView.current = true;
            zoomBy(factor);
          }}
          onFit={() => {
            userMovedView.current = false;
            fitToContent();
          }}
          zoom={viewport.zoom}
        />
      )}

      {armedGuestIds.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-[3px] border border-[color:var(--hairline)] bg-ink px-3 py-1.5 text-[12px] text-paper shadow-lift">
          {armedGuestIds.length === 1
            ? 'Now click a table or an empty seat'
            : `${armedGuestIds.length} guests ready — click a table`}
        </div>
      )}
    </div>
  );
}

const EMPTY_SEATS = new Map<number, never>();

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Keep grid lines between 8 and 40 screen pixels apart. */
function adaptiveGridStep(zoom: number): number {
  let step = GRID_STEP;
  while (step * zoom < 8) step *= 2;
  while (step * zoom > 40) step /= 2;
  return step;
}
