import { create } from 'zustand';
import {
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
    const result = await validateKey(key, get().license);
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
