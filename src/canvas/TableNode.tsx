import { memo } from 'react';
import type { Guest, Id, Table } from '@/model/types';
import { SEAT_RADIUS, footprint, localSeatPositions } from '@/model/seating';
import { cx } from '@/ui/primitives';

export interface TableNodeProps {
  table: Table;
  seated: Map<number, Guest>;
  selected: boolean;
  violated: boolean;
  hovered: boolean;
  /** Seats to pulse after an assignment, as `${tableId}#${index}`. */
  pulseSeats: ReadonlySet<string>;
  highlightGuests: ReadonlySet<Id>;
  zoom: number;
  onPointerDown: (e: React.PointerEvent, table: Table) => void;
  onRotateStart: (e: React.PointerEvent, table: Table) => void;
  onSeatPointerDown: (e: React.PointerEvent, table: Table, index: number) => void;
  onHover: (tableId: Id | null) => void;
  onSelect: (table: Table) => void;
}

/**
 * One table and its chairs, drawn in plan space. Everything is derived from the
 * shape and the seat count — there is no stored geometry to fall out of sync.
 */
export const TableNode = memo(function TableNode({
  table,
  seated,
  selected,
  violated,
  hovered,
  pulseSeats,
  highlightGuests,
  zoom,
  onPointerDown,
  onRotateStart,
  onSeatPointerDown,
  onHover,
  onSelect,
}: TableNodeProps) {
  const f = footprint(table);
  const seats = localSeatPositions(table);
  const showNames = zoom >= 2;
  const strokeWidth = 0.55 / Math.max(zoom, 0.4);

  const outline = violated ? 'var(--flag)' : selected ? 'var(--sage)' : 'var(--ink)';
  const outlineWidth = violated || selected ? strokeWidth * 2.4 : strokeWidth * 1.6;

  return (
    <g
      transform={`translate(${table.x} ${table.y}) rotate(${table.rotation})`}
      onPointerDown={(e) => onPointerDown(e, table)}
      onPointerEnter={() => onHover(table.id)}
      onPointerLeave={() => onHover(null)}
      className={cx('cursor-move', table.locked && 'cursor-default')}
      role="button"
      aria-label={`${table.label}, ${seated.size} of ${table.seats} seats taken${
        violated ? ', has a conflict' : ''
      }. Press Enter to select, then use the arrow keys to move it.`}
      aria-pressed={selected}
      // Focusable, so the plan can be worked entirely from the keyboard: Tab to
      // a table, Enter to select it, arrow keys to nudge.
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect(table);
        }
      }}
    >
      {/* Hover/selection wash sits under everything so outlines stay crisp. */}
      {(hovered || selected) && (
        <TableSurface
          f={f}
          fill={selected ? 'rgba(78,107,87,0.14)' : 'rgba(22,32,43,0.05)'}
          stroke="none"
          strokeWidth={0}
          inflate={2.2}
        />
      )}

      <TableSurface f={f} fill="var(--paper)" stroke={outline} strokeWidth={outlineWidth} />

      {violated && (
        <TableSurface
          f={f}
          fill="none"
          stroke="var(--flag)"
          strokeWidth={outlineWidth}
          inflate={1.6}
          className="motion-safe:animate-flagPulse"
        />
      )}

      {seats.map((s) => {
        const guest = seated.get(s.index);
        const key = `${table.id}#${s.index}`;
        const pulsing = pulseSeats.has(key);
        const highlighted = guest ? highlightGuests.has(guest.id) : false;
        return (
          <g key={s.index}>
            <circle
              cx={s.x}
              cy={s.y}
              r={SEAT_RADIUS}
              fill={guest ? (highlighted ? 'var(--sage)' : 'var(--ink)') : 'var(--paper)'}
              stroke={highlighted ? 'var(--sage)' : 'var(--slate)'}
              strokeWidth={strokeWidth * (highlighted ? 2 : 1)}
              role="img"
              aria-label={
                guest ? `${guest.name}, seat ${s.index + 1}` : `Empty seat ${s.index + 1}`
              }
              className={cx(
                'cursor-pointer',
                pulsing && 'motion-safe:animate-seatPulse',
              )}
              style={pulsing ? { transformOrigin: `${s.x}px ${s.y}px` } : undefined}
              onPointerDown={(e) => onSeatPointerDown(e, table, s.index)}
            >
              <title>
                {guest ? `${guest.name} — seat ${s.index + 1}` : `Empty seat ${s.index + 1}`}
              </title>
            </circle>
            {showNames && guest && <SeatLabel seat={s} rotation={table.rotation} name={guest.name} />}
          </g>
        );
      })}

      {/* Label upright regardless of table rotation — it is a caption, not part of the furniture. */}
      <g transform={`rotate(${-table.rotation})`} className="pointer-events-none select-none">
        <text
          textAnchor="middle"
          y={-0.4}
          className="fill-[color:var(--ink)]"
          style={{ fontSize: 3.6, fontFamily: 'Fraunces, serif', fontWeight: 600 }}
        >
          {table.label}
        </text>
        <text
          textAnchor="middle"
          y={4.2}
          className="fill-[color:var(--slate)]"
          style={{ fontSize: 2.8, fontFamily: 'Inter Tight, sans-serif' }}
        >
          {seated.size}/{table.seats}
        </text>
      </g>

      {table.locked && (
        <g
          transform={`translate(${f.kind === 'circle' ? f.radius - 3 : f.width / 2 - 3} ${
            (f.kind === 'circle' ? -f.radius : -f.height / 2) + 3
          })`}
          className="pointer-events-none"
        >
          <rect x={-1.6} y={-0.4} width={3.2} height={2.6} rx={0.5} fill="var(--slate)" />
          <path
            d="M-1 -0.4 v-1 a1 1 0 0 1 2 0 v1"
            fill="none"
            stroke="var(--slate)"
            strokeWidth={0.5}
          />
        </g>
      )}

      {selected && !table.locked && (
        <g>
          <line
            x1={0}
            y1={rotateHandleY(f)}
            x2={0}
            y2={rotateHandleY(f) - 6}
            stroke="var(--sage)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={0}
            cy={rotateHandleY(f) - 6}
            r={2}
            fill="var(--paper)"
            stroke="var(--sage)"
            strokeWidth={strokeWidth * 2}
            className="cursor-grab"
            onPointerDown={(e) => onRotateStart(e, table)}
          >
            <title>Drag to rotate</title>
          </circle>
        </g>
      )}
    </g>
  );
});

/**
 * A guest's name sits just outside their chair, pushed along the direction the
 * chair faces. Placing every label below its seat instead makes neighbouring
 * names collide on a round table, which is exactly where they matter most.
 */
function SeatLabel({
  seat,
  rotation,
  name,
}: {
  seat: { x: number; y: number; angle: number };
  rotation: number;
  name: string;
}) {
  const rad = (seat.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const gap = SEAT_RADIUS + 1.6;
  const x = seat.x + dx * gap;
  const y = seat.y + dy * gap;
  const anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
  const baseline = dy > 0.35 ? 'hanging' : dy < -0.35 ? 'auto' : 'middle';

  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline={baseline}
      // Counter-rotate so text stays upright even on a rotated table.
      transform={`rotate(${-rotation} ${x} ${y})`}
      className="pointer-events-none select-none fill-[color:var(--slate)]"
      style={{ fontSize: 2.3, fontFamily: 'Inter Tight, sans-serif' }}
    >
      {firstName(name)}
    </text>
  );
}

function rotateHandleY(f: ReturnType<typeof footprint>): number {
  return f.kind === 'circle' ? -(f.radius + 6) : -(f.height / 2 + 6);
}

function TableSurface({
  f,
  fill,
  stroke,
  strokeWidth,
  inflate = 0,
  className,
}: {
  f: ReturnType<typeof footprint>;
  fill: string;
  stroke: string;
  strokeWidth: number;
  inflate?: number;
  className?: string;
}) {
  if (f.kind === 'circle') {
    return (
      <circle
        r={f.radius + inflate}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        className={className}
      />
    );
  }
  return (
    <rect
      x={-f.width / 2 - inflate}
      y={-f.height / 2 - inflate}
      width={f.width + inflate * 2}
      height={f.height + inflate * 2}
      rx={0.8}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return first.length > 9 ? `${first.slice(0, 8)}…` : first;
}
