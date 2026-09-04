import { useEffect, useState } from 'react';
import { clearHistory, useProjectStore, withHistoryGroup } from '@/store/project';
import { demoProject } from '@/model/demo';
import { Button } from '@/ui/primitives';
import type { BootState } from './usePersistence';

const SEEN_KEY = 'tiktak:seen';

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private browsing */
  }
}

function hasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * One banner, not two. The spec asks for a sample-event notice and a
 * "saved in this browser" notice, and both would land on the same first load —
 * so they are one sentence each in a single strip that appears once.
 */
export function FirstRun({ boot }: { boot: BootState }) {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (boot !== 'fresh') return;
    if (hasSeen()) return;
    withHistoryGroup(() => useProjectStore.getState().replaceProject(demoProject()));
    clearHistory();
    setShowing(true);
  }, [boot]);

  if (!showing) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-[color:var(--hairline)] bg-[color:rgba(78,107,87,0.09)] px-3 py-2 lg:flex-row lg:items-center lg:gap-3">
      <p className="min-w-0 flex-1 text-[13px] text-ink">
        This is a sample event, so you can try things straight away. Everything is saved in this
        browser only — export your project to keep a backup.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="min-h-11 px-3 lg:min-h-0 lg:h-7"
          onClick={() => {
            withHistoryGroup(() => useProjectStore.getState().newProject());
            clearHistory();
            markSeen();
            setShowing(false);
          }}
        >
          Start a blank event
        </Button>
        <Button
          variant="quiet"
          size="sm"
          className="min-h-11 px-3 lg:min-h-0 lg:h-7"
          onClick={() => {
            markSeen();
            setShowing(false);
          }}
        >
          Keep exploring
        </Button>
      </div>
    </div>
  );
}
