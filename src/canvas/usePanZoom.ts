import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/store/project';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Snap step in plan units (5 units = 50cm). */
export const GRID_STEP = 5;

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PlanPoint {
  x: number;
  y: number;
}

export function screenToPlan(v: Viewport, sx: number, sy: number): PlanPoint {
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
}

export function planToScreen(v: Viewport, px: number, py: number): PlanPoint {
  return { x: px * v.zoom + v.panX, y: py * v.zoom + v.panY };
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function snap(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_STEP) * GRID_STEP : value;
}

/**
 * Pan and zoom over an SVG surface.
 *
 * The viewport lives in the project store (so it survives a reload) but is kept
 * out of the undo partition — nobody wants Cmd+Z to scroll the page.
 */
export function usePanZoom(surfaceRef: React.RefObject<SVGSVGElement>) {
  const canvas = useProjectStore((s) => s.canvas);
  const setCanvas = useProjectStore((s) => s.setCanvas);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panning = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(
    null,
  );

  // Space turns the whole surface into a pan handle, the way every drawing tool does.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      setSpaceHeld(true);
    }
    function up(e: KeyboardEvent) {
      if (e.code === 'Space') setSpaceHeld(false);
    }
    function blur() {
      setSpaceHeld(false);
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const localPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    },
    [surfaceRef],
  );

  /** Zoom about a point given in surface-local screen coordinates. */
  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      const state = useProjectStore.getState().canvas;
      const next = clampZoom(state.zoom * factor);
      if (next === state.zoom) return;
      const ratio = next / state.zoom;
      setCanvas({
        zoom: next,
        panX: sx - (sx - state.panX) * ratio,
        panY: sy - (sy - state.panY) * ratio,
      });
    },
    [setCanvas],
  );

  // Non-passive listener: the browser will not let us preventDefault otherwise,
  // and without that a trackpad pinch zooms the whole page instead of the plan.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { x, y } = localPoint(e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY / 180), x, y);
        return;
      }
      // Plain wheel scrolls the plan; shift swaps the axis, as elsewhere.
      const state = useProjectStore.getState().canvas;
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? e.deltaX : e.deltaY;
      useProjectStore.getState().setCanvas({ panX: state.panX - dx, panY: state.panY - dy });
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [surfaceRef, localPoint, zoomAt]);

  const beginPan = useCallback(
    (e: React.PointerEvent) => {
      const state = useProjectStore.getState().canvas;
      panning.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        panX: state.panX,
        panY: state.panY,
      };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    [],
  );

  const updatePan = useCallback(
    (e: React.PointerEvent) => {
      const p = panning.current;
      if (!p || p.pointerId !== e.pointerId) return false;
      setCanvas({
        panX: p.panX + (e.clientX - p.x),
        panY: p.panY + (e.clientY - p.y),
      });
      return true;
    },
    [setCanvas],
  );

  const endPan = useCallback((e: React.PointerEvent) => {
    if (panning.current?.pointerId !== e.pointerId) return false;
    panning.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    return true;
  }, []);

  const isPanning = () => panning.current !== null;

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      zoomAt(factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2);
    },
    [surfaceRef, zoomAt],
  );

  /** Fit every table on screen with a comfortable margin. */
  const fitToContent = useCallback(() => {
    const el = surfaceRef.current;
    const tables = useProjectStore.getState().tables;
    if (!el || tables.length === 0) {
      setCanvas({ zoom: 1, panX: (el?.clientWidth ?? 0) / 2, panY: (el?.clientHeight ?? 0) / 2 });
      return;
    }
    const pad = 28;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of tables) {
      const reach = Math.max(t.seats * 1.2, 16);
      minX = Math.min(minX, t.x - reach);
      maxX = Math.max(maxX, t.x + reach);
      minY = Math.min(minY, t.y - reach);
      maxY = Math.max(maxY, t.y + reach);
    }
    const w = el.clientWidth - pad * 2;
    const h = el.clientHeight - pad * 2;
    const zoom = clampZoom(Math.min(w / (maxX - minX), h / (maxY - minY)));
    setCanvas({
      zoom,
      panX: pad + w / 2 - ((minX + maxX) / 2) * zoom,
      panY: pad + h / 2 - ((minY + maxY) / 2) * zoom,
    });
  }, [surfaceRef, setCanvas]);

  return {
    viewport: canvas as Viewport,
    spaceHeld,
    localPoint,
    beginPan,
    updatePan,
    endPan,
    isPanning,
    zoomBy,
    fitToContent,
  };
}
