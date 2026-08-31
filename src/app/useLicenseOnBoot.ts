import { useEffect } from 'react';
import { useUiStore } from '@/store/ui';
import { activateFromUrl, startLicenseRefresh } from '@/license/useLicense';

/**
 * Two licence chores at startup.
 *
 * If the vendor redirected back here with the key in the URL, activate it and
 * say thank you — the customer never has to open an email. Otherwise refresh a
 * stored licence if it is due, quietly and without blocking anything.
 */
export function useLicenseOnBoot(): void {
  const notify = useUiStore((s) => s.notify);

  useEffect(() => {
    let cancelled = false;

    void activateFromUrl().then((activated) => {
      if (cancelled) return;
      if (activated) {
        notify('Thank you — Pro is active. Everything prints clean now.');
      } else {
        startLicenseRefresh();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [notify]);
}
