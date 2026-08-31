import { useEffect, useRef, useState } from 'react';
import { clearHistory, useProjectStore } from '@/store/project';
import { toProject } from '@/store/selectors';
import { useUiStore } from '@/store/ui';
import { loadStoredProject, saveStoredProject, serializeProject, STORAGE_KEY } from '@/io/projectFile';
import { track } from '@/analytics';

const SAVE_DEBOUNCE_MS = 500;

export type BootState = 'loading' | 'restored' | 'fresh';

/**
 * Boot: read the autosave once, then keep it current with a debounced write.
 * The debounce matters — a table drag would otherwise serialise the whole
 * project on every pointer move.
 */
export function usePersistence(): BootState {
  const [boot, setBoot] = useState<BootState>('loading');
  const notify = useUiStore((s) => s.notify);
  const warnedRef = useRef(false);

  useEffect(() => {
    track('planner_opened', true);
    const stored = loadStoredProject();
    if (stored) {
      useProjectStore.getState().replaceProject(stored);
      clearHistory(); // the restored document is the baseline, not an edit

      // Loading migrates old files and repairs dangling references. Write the
      // result straight back when it differs, so the repair is not redone on
      // every boot — and so what is on disk matches what is on screen.
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const canonical = serializeProject(stored);
        if (raw !== canonical) saveStoredProject(stored);
      } catch {
        /* storage unavailable; the in-memory project is still correct */
      }

      setBoot('restored');
    } else {
      setBoot('fresh');
    }
  }, []);

  useEffect(() => {
    if (boot === 'loading') return;
    let timer: number | undefined;

    const unsubscribe = useProjectStore.subscribe((state, previous) => {
      // Ignore pure viewport changes; they are saved on the next real edit.
      const documentChanged =
        state.event !== previous.event ||
        state.guests !== previous.guests ||
        state.parties !== previous.parties ||
        state.tables !== previous.tables ||
        state.constraints !== previous.constraints;
      if (!documentChanged) return;

      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const outcome = saveStoredProject(toProject(useProjectStore.getState()));
        if (outcome !== 'saved' && !warnedRef.current) {
          warnedRef.current = true;
          notify(
            outcome === 'quota'
              ? "This browser's storage is full, so your plan is no longer being saved here. Export your project to keep it."
              : "This browser won't let TIKTAK save locally. Export your project to keep it.",
            'refusal',
          );
        }
      }, SAVE_DEBOUNCE_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [boot, notify]);

  // A refresh mid-drag must not lose the last edit.
  useEffect(() => {
    function flush() {
      saveStoredProject(toProject(useProjectStore.getState()));
    }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return boot;
}
