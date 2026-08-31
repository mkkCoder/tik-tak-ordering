import { useCallback, useRef } from 'react';

/**
 * A one-pixel drag handle between panels. Pointer events rather than mouse
 * events, so it works with a trackpad, a stylus and a touch screen alike.
 */
export function Resizer({
  side,
  value,
  min,
  max,
  onChange,
  label,
}: {
  side: 'left' | 'right';
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
}) {
  const start = useRef<{ pointer: number; value: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { pointer: e.clientX, value };
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = start.current;
      if (!s) return;
      const delta = e.clientX - s.pointer;
      const next = side === 'left' ? s.value + delta : s.value - delta;
      onChange(Math.min(max, Math.max(min, next)));
    },
    [side, min, max, onChange],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    start.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 32 : 8;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onChange(Math.min(max, Math.max(min, side === 'left' ? value - step : value + step)));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(Math.min(max, Math.max(min, side === 'left' ? value + step : value - step)));
        }
      }}
      className="group relative z-10 w-px shrink-0 cursor-col-resize bg-[color:var(--hairline)]"
    >
      {/* Generous invisible hit area over a hairline visual. */}
      <div className="absolute inset-y-0 -left-2 -right-2 group-hover:bg-[color:rgba(78,107,87,0.16)]" />
    </div>
  );
}
