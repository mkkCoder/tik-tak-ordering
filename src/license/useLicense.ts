import { create } from 'zustand';
import {
  extractLicenseKey,
  isPro,
  readStoredLicense,
  revalidateIfDue,
  validateKey,
  writeStoredLicense,
  type StoredLicense,
} from './gate';
import { track } from '@/analytics';

interface LicenseState {
  license: StoredLicense | null;
  pro: boolean;
  checking: boolean;
  error: string | null;
  activate: (key: string) => Promise<boolean>;
  deactivate: () => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export const useLicenseStore = create<LicenseState>()((set, get) => ({
  license: readStoredLicense(),
  pro: isPro(readStoredLicense()),
  checking: false,
  error: null,

  activate: async (key) => {
    set({ checking: true, error: null });
    // People paste the line around the code, not the code. Find it for them.
    const result = await validateKey(extractLicenseKey(key), get().license);
    if (!result.ok) {
      set({ checking: false, error: result.message });
      return false;
    }
    writeStoredLicense(result.license);
    set({ license: result.license, pro: true, checking: false, error: null });
    track('license_activated');
    return true;
  },

  deactivate: () => {
    writeStoredLicense(null);
    set({ license: null, pro: false, error: null });
  },

  refresh: async () => {
    const current = get().license;
    if (!current) return;
    const next = await revalidateIfDue(current);
    set({ license: next, pro: isPro(next) });
  },

  clearError: () => set({ error: null }),
}));

/** Kick off a background revalidation once per session. */
export function startLicenseRefresh(): void {
  void useLicenseStore.getState().refresh();
}

/**
 * Activate straight from the URL, for a post-purchase redirect that carries the
 * key. Silent on failure: a stale or mistyped link should do nothing visible
 * rather than greet someone with an error they cannot act on.
 */
export async function activateFromUrl(): Promise<boolean> {
  const { licenseKeyFromUrl, stripKeyFromUrl } = await import('./checkout');
  const key = licenseKeyFromUrl();
  if (!key) return false;
  stripKeyFromUrl();
  if (useLicenseStore.getState().pro) return false;
  return useLicenseStore.getState().activate(key);
}
