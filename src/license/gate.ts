/**
 * The licence gate.
 *
 * Stated plainly, because it is a deliberate trade rather than an oversight:
 * this check runs entirely in the browser and can be bypassed by anyone willing
 * to open the developer console. That is accepted. The alternative is a server,
 * and a server means hosting, uptime, backups and a privacy story to defend —
 * for a tool whose main promise is that nothing leaves your device. Someone who
 * would crack this was never going to pay. No effort is spent on obfuscation.
 *
 * What this code does care about is never locking out someone who *has* paid.
 * Every failure path that is not an explicit "this key is invalid" leaves an
 * already-activated licence working.
 */

export const LICENSE_KEY_STORAGE = 'tiktak:license';

/** Re-check a stored key roughly monthly; refunds and chargebacks are rare but real. */
export const REVALIDATE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export type Vendor = 'lemonsqueezy' | 'gumroad';

export interface LicenseConfig {
  vendor: Vendor;
  /** Base URL, isolated so switching vendors — or pointing at a proxy — is one line. */
  endpoint: string;
  /** Gumroad needs the product id alongside the key; Lemon Squeezy does not. */
  productId?: string;
}

export const DEFAULT_CONFIG: LicenseConfig = {
  vendor: 'lemonsqueezy',
  endpoint: 'https://api.lemonsqueezy.com/v1/licenses/validate',
};

export const GUMROAD_CONFIG: LicenseConfig = {
  vendor: 'gumroad',
  endpoint: 'https://api.gumroad.com/v2/licenses/verify',
  productId: '',
};

export interface StoredLicense {
  key: string;
  valid: boolean;
  /** When the vendor last confirmed this key. */
  checkedAt: number;
  /** Instance/purchase name, purely for showing the user what they activated. */
  label?: string;
}

export type ActivationResult =
  | { ok: true; license: StoredLicense }
  | { ok: false; reason: 'invalid' | 'network'; message: string };

export function readStoredLicense(): StoredLicense | null {
  try {
    const raw = localStorage.getItem(LICENSE_KEY_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLicense>;
    if (typeof parsed.key !== 'string' || typeof parsed.valid !== 'boolean') return null;
    return {
      key: parsed.key,
      valid: parsed.valid,
      checkedAt: typeof parsed.checkedAt === 'number' ? parsed.checkedAt : 0,
      ...(parsed.label ? { label: parsed.label } : {}),
    };
  } catch {
    return null;
  }
}

export function writeStoredLicense(license: StoredLicense | null): void {
  try {
    if (license) localStorage.setItem(LICENSE_KEY_STORAGE, JSON.stringify(license));
    else localStorage.removeItem(LICENSE_KEY_STORAGE);
  } catch {
    /* private browsing: the licence simply won't persist */
  }
}

/** True when this browser may produce clean exports. */
export function isPro(license: StoredLicense | null): boolean {
  return license !== null && license.valid;
}

export function needsRevalidation(license: StoredLicense | null, now = Date.now()): boolean {
  return license !== null && license.valid && now - license.checkedAt > REVALIDATE_AFTER_MS;
}

interface VendorResponse {
  valid: boolean;
  label?: string;
  message?: string;
}

/**
 * Both vendors answer a bad key with HTTP 404 and a JSON body, so the body is
 * what decides — never the status code alone.
 */
function readVendorResponse(vendor: Vendor, body: unknown): VendorResponse {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, message: 'The licence server sent something unexpected.' };
  }
  const data = body as Record<string, unknown>;

  if (vendor === 'lemonsqueezy') {
    const meta = data.meta as Record<string, unknown> | undefined;
    const label = typeof meta?.['product_name'] === 'string' ? (meta['product_name'] as string) : undefined;
    return {
      valid: data.valid === true,
      ...(label ? { label } : {}),
      ...(typeof data.error === 'string' ? { message: data.error } : {}),
    };
  }

  const purchase = data.purchase as Record<string, unknown> | undefined;
  const label =
    typeof purchase?.['product_name'] === 'string' ? (purchase['product_name'] as string) : undefined;
  return {
    valid: data.success === true,
    ...(label ? { label } : {}),
    ...(typeof data.message === 'string' ? { message: data.message } : {}),
  };
}

function requestFor(key: string, config: LicenseConfig): RequestInit {
  if (config.vendor === 'lemonsqueezy') {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ license_key: key }),
    };
  }
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      product_id: config.productId ?? '',
      license_key: key,
      increment_uses_count: 'false',
    }).toString(),
  };
}

export interface ValidateDeps {
  fetch?: typeof fetch;
  now?: () => number;
  config?: LicenseConfig;
}

/**
 * Ask the vendor about a key.
 *
 * `previous` is the licence already stored, if any. When the network fails, an
 * already-valid licence is kept — bad wifi in a hotel the night before a wedding
 * must never turn a paid product back into a trial. A key that has never
 * validated gets no such benefit, so being offline is not itself a way in.
 */
export async function validateKey(
  key: string,
  previous: StoredLicense | null = null,
  deps: ValidateDeps = {},
): Promise<ActivationResult> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const config = deps.config ?? DEFAULT_CONFIG;
  const trimmed = key.trim();

  if (trimmed.length < 8) {
    return {
      ok: false,
      reason: 'invalid',
      message: "That doesn't look like a licence key. Check the email from your purchase.",
    };
  }

  let body: unknown;
  try {
    const response = await doFetch(config.endpoint, requestFor(trimmed, config));
    body = await response.json();
  } catch {
    if (previous && previous.valid && previous.key === trimmed) {
      // Keep working; try again on the next export.
      return { ok: true, license: { ...previous, checkedAt: previous.checkedAt } };
    }
    return {
      ok: false,
      reason: 'network',
      message:
        "Couldn't reach the licence server. Check your connection and try again — your key is fine.",
    };
  }

  const parsed = readVendorResponse(config.vendor, body);
  if (!parsed.valid) {
    return {
      ok: false,
      reason: 'invalid',
      message:
        parsed.message === 'license_key not found.' || parsed.message === undefined
          ? "That key wasn't recognised. Copy it straight from your purchase email — it's easy to miss a character."
          : parsed.message,
    };
  }

  return {
    ok: true,
    license: {
      key: trimmed,
      valid: true,
      checkedAt: now(),
      ...(parsed.label ? { label: parsed.label } : {}),
    },
  };
}

/**
 * Refresh a stored licence in the background if it is due. Any outcome other
 * than an explicit rejection leaves the stored licence untouched.
 */
export async function revalidateIfDue(
  license: StoredLicense | null,
  deps: ValidateDeps = {},
): Promise<StoredLicense | null> {
  const now = deps.now ?? Date.now;
  if (!needsRevalidation(license, now())) return license;
  const result = await validateKey(license!.key, license, deps);
  if (result.ok) {
    const refreshed = { ...result.license, checkedAt: now() };
    writeStoredLicense(refreshed);
    return refreshed;
  }
  if (result.reason === 'invalid') {
    const revoked = { ...license!, valid: false, checkedAt: now() };
    writeStoredLicense(revoked);
    return revoked;
  }
  return license;
}

// ---------------------------------------------------------------------------
// Reading a key out of whatever the customer pasted
// ---------------------------------------------------------------------------

/** Lemon Squeezy and Gumroad both issue UUID-shaped keys. */
const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** A looser fallback: three or more dash-separated alphanumeric groups. */
const TOKEN_LIKE = /[A-Z0-9]{4,}(?:-[A-Z0-9]{4,}){2,}/i;

/**
 * Pull the key out of a paste.
 *
 * Nobody selects exactly the key. They select the line around it, or the whole
 * paragraph from the email, and email clients add zero-width characters and
 * non-breaking spaces on the way. Refusing that paste with "invalid key" is the
 * worst possible moment to be pedantic — they have already paid.
 */
export function extractLicenseKey(pasted: string): string {
  const cleaned = pasted
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/[\u201C\u201D"'`<>]/g, ' ')
    .trim();

  return cleaned.match(UUID_LIKE)?.[0] ?? cleaned.match(TOKEN_LIKE)?.[0] ?? cleaned;
}

/**
 * Find a licence key anywhere in an arbitrary object.
 *
 * The checkout overlay hands back an order payload whose exact shape is the
 * vendor's business and changes without notice. Rather than hard-coding a path
 * that will silently stop matching, walk the object for a UUID-shaped string
 * under a plausibly-named field. Returns null when there is nothing to find, at
 * which point the customer types the key from their email instead.
 */
export function findLicenseKeyIn(payload: unknown, depth = 0): string | null {
  if (depth > 6 || payload === null || typeof payload !== 'object') return null;

  for (const [rawKey, value] of Object.entries(payload as Record<string, unknown>)) {
    const name = rawKey.toLowerCase();
    if (typeof value === 'string' && /licen[sc]e|^key$/.test(name) && UUID_LIKE.test(value)) {
      return value.match(UUID_LIKE)?.[0] ?? null;
    }
    const nested = findLicenseKeyIn(value, depth + 1);
    if (nested) return nested;
  }
  return null;
}
