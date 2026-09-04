import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'default' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-[3px] font-medium ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-40 select-none whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sage text-paper hover:bg-[#435c4b] active:bg-[#3a5041]',
  default:
    'bg-paper text-ink border border-[color:var(--hairline)] hover:bg-[#f4f1ea] active:bg-linen',
  quiet: 'text-slate hover:text-ink hover:bg-[color:rgba(22,32,43,0.06)]',
  // Destructive actions carry no colour of their own: --flag means "constraint
  // violation" and nothing else. Confirmation dialogs do the guarding instead.
  danger:
    'bg-paper text-ink border border-[color:var(--hairline)] hover:bg-[#f4f1ea] active:bg-linen',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
        className,
      )}
      {...rest}
    />
  );
});

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, className, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-micro text-slate">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cx(
          'h-11 w-full rounded-[3px] border border-[color:var(--hairline)] bg-paper px-2 text-[16px] lg:h-8 lg:text-[13px]',
          'text-ink placeholder:text-slate/60 focus:border-sage focus:outline-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-sage',
          className,
        )}
        {...rest}
      />
      {hint && <p className="text-micro text-slate">{hint}</p>}
    </div>
  );
});

export function Select({
  label,
  className,
  children,
  ...rest
}: {
  label?: string;
  className?: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-micro text-slate">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cx(
          'h-11 w-full rounded-[3px] border border-[color:var(--hairline)] bg-paper px-1.5 text-[16px] text-ink lg:h-8 lg:text-[13px]',
          'focus:border-sage focus:outline-none',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

export function Dialog({
  open,
  title,
  children,
  onClose,
  footer,
  width = 420,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Two queries, not one selector list: `querySelector('a, b')` returns
    // whichever matches first in document order, so a single list would hand
    // focus to the close button in the corner and quietly ignore every
    // `data-autofocus` in the app. Ask for the marked element first, and only
    // fall back to "whatever is focusable" when a dialog hasn't marked one.
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input, button');
    target?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(22,32,43,0.32)] p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ width: `min(100%, ${width}px)` }}
        className="max-h-[min(85vh,85dvh)] w-full overflow-auto rounded-[4px] border border-[color:var(--hairline)] bg-paper shadow-lift tk-scroll"
      >
        <div className="border-b border-[color:var(--hairline)] px-4 py-3">
          <h2 id={titleId} className="font-serif text-[17px] font-semibold leading-tight">
            {title}
          </h2>
        </div>
        <div className="px-4 py-3.5 text-[13px] leading-relaxed">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-[color:var(--hairline)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small square icon button used in panel headers and rows. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[3px] text-slate lg:h-7 lg:w-7',
        'transition-colors hover:bg-[color:rgba(22,32,43,0.07)] hover:text-ink',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
