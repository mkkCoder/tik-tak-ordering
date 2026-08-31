import { useUiStore } from '@/store/ui';

/**
 * Transient messages, bottom-centre over the plan. Refusals ("this party does
 * not fit") live here rather than in a modal — the user is mid-gesture and
 * should not have to dismiss anything to try again.
 */
export function Notices() {
  const notices = useUiStore((s) => s.notices);
  const dismiss = useUiStore((s) => s.dismissNotice);
  if (notices.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-1.5 px-4"
      role="status"
      aria-live="polite"
    >
      {notices.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => dismiss(n.id)}
          className="pointer-events-auto max-w-lg rounded-[3px] border border-[color:var(--hairline)] bg-ink px-3 py-2 text-left text-[13px] text-paper shadow-lift"
        >
          {n.text}
        </button>
      ))}
    </div>
  );
}
