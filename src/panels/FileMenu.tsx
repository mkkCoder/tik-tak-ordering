import { useEffect, useRef, useState } from 'react';
import { clearHistory, useProjectStore, withHistoryGroup } from '@/store/project';
import { toProject } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import {
  ProjectFileError,
  parseProjectText,
  projectFileName,
  serializeProject,
} from '@/io/projectFile';
import { downloadText, pickTextFile } from '@/io/download';
import { Button, Dialog, cx } from '@/ui/primitives';
import { recordNewEvent } from '@/app/eventsPlanned';

/**
 * Project-level file actions. Deliberately plain: opening a damaged file must
 * leave the current plan untouched and say so, because the alternative — a
 * blank canvas where the wedding used to be — is unrecoverable.
 */
export function FileMenu() {
  const [open, setOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notify = useUiStore((s) => s.notify);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function openProject() {
    setOpen(false);
    const picked = await pickTextFile('.json,.tiktak.json,application/json');
    if (!picked) return;
    try {
      const project = parseProjectText(picked.text);
      withHistoryGroup(() => useProjectStore.getState().replaceProject(project));
      clearHistory();
      notify(`Opened ${picked.name}`);
    } catch (err) {
      setError(
        err instanceof ProjectFileError
          ? err.message
          : "That file couldn't be opened. Your current plan hasn't been changed.",
      );
    }
  }

  function exportProject() {
    setOpen(false);
    const project = toProject(useProjectStore.getState());
    downloadText(
      serializeProject(project),
      projectFileName(project.event.name),
      'application/json',
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Project
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-[3px] border border-[color:var(--hairline)] bg-paper py-1 shadow-lift"
        >
          <MenuItem onClick={openProject}>Open project…</MenuItem>
          <MenuItem onClick={exportProject}>Export project file</MenuItem>
          <div className="my-1 h-px bg-[color:var(--hairline)]" />
          <MenuItem
            onClick={() => {
              setOpen(false);
              setConfirmNew(true);
            }}
          >
            New project…
          </MenuItem>
          <div className="my-1 h-px bg-[color:var(--hairline)]" />
          <a
            role="menuitem"
            href="/privacy/"
            className={cx(
              'block w-full px-3 py-1.5 text-left text-[13px] text-ink no-underline',
              'hover:bg-[color:rgba(22,32,43,0.06)] focus-visible:bg-[color:rgba(22,32,43,0.06)]',
            )}
            onClick={() => setOpen(false)}
          >
            Privacy
          </a>
          <a
            role="menuitem"
            href="/terms/"
            className={cx(
              'block w-full px-3 py-1.5 text-left text-[13px] text-ink no-underline',
              'hover:bg-[color:rgba(22,32,43,0.06)] focus-visible:bg-[color:rgba(22,32,43,0.06)]',
            )}
            onClick={() => setOpen(false)}
          >
            Terms
          </a>
        </div>
      )}

      <Dialog
        open={confirmNew}
        title="Start a new project?"
        onClose={() => setConfirmNew(false)}
        footer={
          <>
            <Button onClick={() => setConfirmNew(false)}>Cancel</Button>
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                withHistoryGroup(() => useProjectStore.getState().newProject());
                clearHistory();
                recordNewEvent();
                setConfirmNew(false);
              }}
            >
              Start new project
            </Button>
          </>
        }
      >
        <p>
          This clears the current event — every guest, table and rule. It can&apos;t be undone
          afterwards.
        </p>
        <p className="mt-2 text-slate">
          Export the project file first if you might want this plan back.
        </p>
      </Dialog>

      <Dialog
        open={error !== null}
        title="That file couldn't be opened"
        onClose={() => setError(null)}
        footer={
          <Button variant="primary" data-autofocus onClick={() => setError(null)}>
            Close
          </Button>
        }
      >
        <p>{error}</p>
        <p className="mt-2 text-slate">
          TIKTAK opens the <code className="font-mono text-[12px]">.tiktak.json</code> files it
          exports. If you meant to bring in a guest list, use Import instead.
        </p>
      </Dialog>
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cx(
        'block w-full px-3 py-1.5 text-left text-[13px] text-ink',
        'hover:bg-[color:rgba(22,32,43,0.06)] focus-visible:bg-[color:rgba(22,32,43,0.06)]',
      )}
    >
      {children}
    </button>
  );
}
