import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUMROAD_CONFIG,
  LICENSE_KEY_STORAGE,
  REVALIDATE_AFTER_MS,
  isPro,
  needsRevalidation,
  readStoredLicense,
  revalidateIfDue,
  validateKey,
  writeStoredLicense,
  type StoredLicense,
} from './gate';

const KEY = 'TIKTAK-1234-5678-9ABC';

const okLemon = () =>
  Promise.resolve({
    json: () => Promise.resolve({ valid: true, meta: { product_name: 'TIKTAK Pro' } }),
  } as Response);

const badLemon = () =>
  Promise.resolve({
    json: () => Promise.resolve({ valid: false, error: 'license_key not found.' }),
  } as Response);

const offline = () => Promise.reject(new Error('network down'));

beforeEach(() => {
  localStorage.clear();
});

describe('validateKey', () => {
  it('accepts a valid key and records when it was checked', async () => {
    const result = await validateKey(KEY, null, { fetch: okLemon, now: () => 1000 });
    expect(result).toMatchObject({
      ok: true,
      license: { key: KEY, valid: true, checkedAt: 1000, label: 'TIKTAK Pro' },
    });
  });

  it('rejects a key the vendor does not know, despite the HTTP 404 body', async () => {
    const result = await validateKey(KEY, null, { fetch: badLemon });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
      expect(result.message).toMatch(/purchase email/);
    }
  });

  it('rejects something that is obviously not a key without calling out', async () => {
    const spy = vi.fn(okLemon);
    const result = await validateKey('abc', null, { fetch: spy });
    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('trims a pasted key', async () => {
    const result = await validateKey(`  ${KEY}\n`, null, { fetch: okLemon });
    expect(result.ok && result.license.key).toBe(KEY);
  });

  it('speaks Gumroad as well as Lemon Squeezy', async () => {
    const gumroadOk = () =>
      Promise.resolve({
        json: () => Promise.resolve({ success: true, purchase: { product_name: 'TIKTAK' } }),
      } as Response);
    const result = await validateKey(KEY, null, {
      fetch: gumroadOk,
      config: { ...GUMROAD_CONFIG, productId: 'abc' },
    });
    expect(result.ok && result.license.label).toBe('TIKTAK');
  });
});

describe('never lock out a paying user', () => {
  it('keeps an activated licence working when the network is down', async () => {
    const previous: StoredLicense = { key: KEY, valid: true, checkedAt: 5 };
    const result = await validateKey(KEY, previous, { fetch: offline });
    expect(result.ok).toBe(true);
    expect(result.ok && result.license.valid).toBe(true);
  });

  it('does not hand out Pro to someone with no stored licence just because they are offline', async () => {
    const result = await validateKey(KEY, null, { fetch: offline });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network');
  });

  it('does not revive a different key from an offline failure', async () => {
    const previous: StoredLicense = { key: 'SOME-OTHER-KEY-0000', valid: true, checkedAt: 5 };
    const result = await validateKey(KEY, previous, { fetch: offline });
    expect(result.ok).toBe(false);
  });

  it('does not revive a licence that was already found invalid', async () => {
    const previous: StoredLicense = { key: KEY, valid: false, checkedAt: 5 };
    const result = await validateKey(KEY, previous, { fetch: offline });
    expect(result.ok).toBe(false);
  });
});

describe('revalidation', () => {
  const fresh: StoredLicense = { key: KEY, valid: true, checkedAt: 0 };

  it('is due only after the interval', () => {
    expect(needsRevalidation(fresh, REVALIDATE_AFTER_MS - 1)).toBe(false);
    expect(needsRevalidation(fresh, REVALIDATE_AFTER_MS + 1)).toBe(true);
    expect(needsRevalidation(null, Date.now())).toBe(false);
  });

  it('leaves a licence alone when it is not due', async () => {
    const result = await revalidateIfDue(fresh, { fetch: offline, now: () => 100 });
    expect(result).toBe(fresh);
  });

  it('refreshes the timestamp on success', async () => {
    const due = REVALIDATE_AFTER_MS + 10;
    const result = await revalidateIfDue(fresh, { fetch: okLemon, now: () => due });
    expect(result?.checkedAt).toBe(due);
    expect(readStoredLicense()?.valid).toBe(true);
  });

  it('revokes a licence the vendor now rejects', async () => {
    writeStoredLicense(fresh);
    const due = REVALIDATE_AFTER_MS + 10;
    const result = await revalidateIfDue(fresh, { fetch: badLemon, now: () => due });
    expect(result?.valid).toBe(false);
    expect(isPro(result)).toBe(false);
    expect(readStoredLicense()?.valid).toBe(false);
  });

  it('keeps the licence when revalidation cannot reach the network', async () => {
    const due = REVALIDATE_AFTER_MS + 10;
    const result = await revalidateIfDue(fresh, { fetch: offline, now: () => due });
    expect(result?.valid).toBe(true);
  });
});

describe('storage', () => {
  it('round-trips', () => {
    const license: StoredLicense = { key: KEY, valid: true, checkedAt: 42, label: 'Pro' };
    writeStoredLicense(license);
    expect(readStoredLicense()).toEqual(license);
  });

  it('ignores junk in storage rather than throwing', () => {
    localStorage.setItem(LICENSE_KEY_STORAGE, 'not json');
    expect(readStoredLicense()).toBeNull();
    localStorage.setItem(LICENSE_KEY_STORAGE, '{"key":123}');
    expect(readStoredLicense()).toBeNull();
  });

  it('clearing storage drops back to free', () => {
    writeStoredLicense({ key: KEY, valid: true, checkedAt: 1 });
    expect(isPro(readStoredLicense())).toBe(true);
    localStorage.clear();
    expect(isPro(readStoredLicense())).toBe(false);
  });
});
