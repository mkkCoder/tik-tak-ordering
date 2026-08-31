import { create } from 'zustand';
import type { Id } from '@/model/types';

/**
 * Ephemeral interface state: selection, hover, panel geometry. Deliberately
 * outside the undoable document — nobody wants Cmd+Z to un-select something.
 */

const LAYOUT_KEY = 'tiktak:layout';

export interface LayoutPrefs {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

export const LAYOUT_LIMITS = {
  left: { min: 220, max: 460, initial: 288 },
  right: { min: 240, max: 480, initial: 300 },
} as const;

function loadLayout(): LayoutPrefs {
  const fallback: LayoutPrefs = {
    leftWidth: LAYOUT_LIMITS.left.initial,
    rightWidth: LAYOUT_LIMITS.right.initial,
    leftCollapsed: false,
    rightCollapsed: false,
  };
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
    return {
      leftWidth: clamp(parsed.leftWidth ?? fallback.leftWidth, LAYOUT_LIMITS.left),
      rightWidth: clamp(parsed.rightWidth ?? fallback.rightWidth, LAYOUT_LIMITS.right),
      leftCollapsed: parsed.leftCollapsed ?? false,
      rightCollapsed: parsed.rightCollapsed ?? false,
    };
  } catch {
    return fallback;
  }
}

function clamp(n: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, n));
}

export type Selection =
  | { kind: 'none' }
  | { kind: 'tables'; ids: Id[] }
  | { kind: 'guests'; ids: Id[] };

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'refusal';
}

export interface UiState extends LayoutPrefs {
  selection: Selection;
  /** Guest picked in the panel, waiting for a table click. The touch path. */
  armedGuestIds: Id[];
  hoverTableId: Id | null;
  hoverGuestIds: Id[];
  /** Seats that just received someone, for the confirmation pulse. */
  pulseSeats: string[];
  violationsOpen: boolean;
  notices: Notice[];
  /** Bumped to ask the canvas to centre on a table; the counter re-fires repeats. */
  focusRequest: { tableId: Id; nonce: number } | null;

  setLayout: (patch: Partial<LayoutPrefs>) => void;
  select: (selection: Selection) => void;
  clearSelection: () => void;
  toggleTableSelected: (id: Id, additive: boolean) => void;
  armGuests: (ids: Id[]) => void;
  setHoverTable: (id: Id | null) => void;
  setHoverGuests: (ids: Id[]) => void;
  pulse: (seatKeys: string[]) => void;
  setViolationsOpen: (open: boolean) => void;
  focusTable: (tableId: Id) => void;
  notify: (text: string, tone?: Notice['tone']) => void;
  dismissNotice: (id: number) => void;
}

let noticeSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  ...loadLayout(),
  selection: { kind: 'none' },
  armedGuestIds: [],
  hoverTableId: null,
  hoverGuestIds: [],
  pulseSeats: [],
  violationsOpen: false,
  notices: [],
  focusRequest: null,

  setLayout: (patch) => {
    set((s) => {
      const next: LayoutPrefs = {
        leftWidth: clamp(patch.leftWidth ?? s.leftWidth, LAYOUT_LIMITS.left),
        rightWidth: clamp(patch.rightWidth ?? s.rightWidth, LAYOUT_LIMITS.right),
        leftCollapsed: patch.leftCollapsed ?? s.leftCollapsed,
        rightCollapsed: patch.rightCollapsed ?? s.rightCollapsed,
      };
      try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      } catch {
        /* private browsing; the layout simply won't persist */
      }
      return next;
    });
  },

  select: (selection) => set({ selection, armedGuestIds: [] }),
  clearSelection: () => set({ selection: { kind: 'none' }, armedGuestIds: [] }),

  toggleTableSelected: (id, additive) =>
    set((s) => {
      const current = s.selection.kind === 'tables' ? s.selection.ids : [];
      if (!additive) return { selection: { kind: 'tables', ids: [id] }, armedGuestIds: [] };
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return {
        selection: next.length ? { kind: 'tables', ids: next } : { kind: 'none' },
      };
    }),

  armGuests: (ids) => set({ armedGuestIds: ids }),
  setHoverTable: (id) => set({ hoverTableId: id }),
  setHoverGuests: (ids) => set({ hoverGuestIds: ids }),

  pulse: (seatKeys) => {
    set({ pulseSeats: seatKeys });
    window.setTimeout(() => {
      // Only clear if nothing newer replaced it.
      if (get().pulseSeats === seatKeys) set({ pulseSeats: [] });
    }, 400);
  },

  setViolationsOpen: (open) => set({ violationsOpen: open }),

  focusTable: (tableId) =>
    set((s) => ({
      focusRequest: { tableId, nonce: (s.focusRequest?.nonce ?? 0) + 1 },
      selection: { kind: 'tables', ids: [tableId] },
    })),

  notify: (text, tone = 'info') => {
    const id = ++noticeSeq;
    set((s) => ({ notices: [...s.notices.slice(-2), { id, text, tone }] }));
    window.setTimeout(() => get().dismissNotice(id), tone === 'refusal' ? 5000 : 3200);
  },

  dismissNotice: (id) =>
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));
