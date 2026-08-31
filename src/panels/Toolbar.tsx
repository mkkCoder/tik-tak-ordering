import { useState } from 'react';
import { useProjectStore } from '@/store/project';
import { useUiStore } from '@/store/ui';
import { violations } from '@/store/selectors';
import { Button, IconButton, cx } from '@/ui/primitives';
import { FileMenu } from './FileMenu';
import { ImportDialog } from './ImportDialog';
import { ExportMenu } from './ExportMenu';
import { AutoArrangeButton } from './AutoArrange';

export function Toolbar({ compact = false }: { compact?: boolean } = {}) {
  const [importing, setImporting] = useState(false);
  const eventName = useProjectStore((s) => s.event.name);
  const setEvent = useProjectStore((s) => s.setEvent);
  const violationCount = useProjectStore((s) => violations(s).length);
  const violationsOpen = useUiStore((s) => s.violationsOpen);
  const setViolationsOpen = useUiStore((s) => s.setViolationsOpen);
  const leftCollapsed = useUiStore((s) => s.leftCollapsed);
  const setLayout = useUiStore((s) => s.setLayout);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[color:var(--hairline)] bg-linen px-3">
      {!compact && (
      <IconButton
        label={leftCollapsed ? 'Show guest list' : 'Hide guest list'}
        onClick={() => setLayout({ leftCollapsed: !leftCollapsed })}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path d="M6.2 3v10" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </IconButton>
      )}

      <span className="font-serif text-[16px] font-semibold tracking-[0.01em] text-ink">
        TIKTAK
      </span>

      {!compact && (
        <div className="mx-1 h-5 w-px bg-[color:var(--hairline)]" aria-hidden="true" />
      )}

      <input
        value={eventName}
        onChange={(e) => setEvent({ name: e.target.value })}
        aria-label="Event name"
        placeholder="Untitled event"
        className={cx(
          'h-8 min-w-0 max-w-[22rem] flex-1 rounded-[3px] border border-transparent bg-transparent px-2',
          'text-[14px] text-ink placeholder:text-slate/70',
          'hover:border-[color:var(--hairline)] focus:border-sage focus:bg-paper focus:outline-none',
        )}
      />

      <div className="ml-auto flex items-center gap-2">
        {violationCount > 0 && (
          <Button
            variant="quiet"
            size="sm"
            aria-pressed={violationsOpen}
            onClick={() => setViolationsOpen(!violationsOpen)}
            className="text-flag hover:bg-[color:rgba(179,38,30,0.08)] hover:text-flag"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path
                d="M8 2.4 14.4 13.2H1.6L8 2.4Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path d="M8 6.4v3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="11.3" r="0.75" fill="currentColor" />
            </svg>
            {violationCount} {violationCount === 1 ? 'conflict' : 'conflicts'}
          </Button>
        )}
        {!compact && (
          <>
            <Button size="sm" onClick={() => setImporting(true)}>
              Import
            </Button>
            <AutoArrangeButton />
          </>
        )}
        <ExportMenu />
        <FileMenu />
      </div>

      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </header>
  );
}
