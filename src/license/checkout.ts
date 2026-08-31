import { findLicenseKeyIn } from './gate';

/**
 * Buying without leaving the page.
 *
 * The old flow cost nine steps: click buy, new tab, pay, wait for an email,
 * find the email, find the key inside it, copy it, find your way back to the
 * right tab, paste. Every one of those is a chance to lose someone who has
 * already decided to pay — which is the worst place in the whole product to
 * lose anybody.
 *
 * Lemon Squeezy's overlay keeps the customer on this page, so their plan is
 * still in front of them, and reports the completed order back over a callback.
 * When that payload contains the licence key we activate it for them and they
 * never see a key at all.
 *
 * A NOTE ON THE NO-CDN RULE. Everything else in TIKTAK is bundled from npm at
 * build time. This script is the one exception, and it is a considered one:
 * there is no npm build of the overlay, it is fetched only when someone
 * actually clicks buy, and it is the payment vendor's own domain. If it fails
 * to load for any reason — offline, blocked, an ad blocker — `openCheckout`
 * falls back to opening the hosted checkout in a new tab, which is exactly the
 * behaviour we had before. Nothing depends on it being reachable.
 */

const LEMON_JS = 'https://assets.lemonsqueezy.com/lemon.js';

interface LemonSqueezyApi {
  Setup: (options: { eventHandler: (event: { event?: string; data?: unknown }) => void }) => void;
  Url: { Open: (url: string) => void };
  Refresh?: () => void;
}

declare global {
  interface Window {
    LemonSqueezy?: LemonSqueezyApi;
    createLemonSqueezy?: () => void;
  }
}

let loading: Promise<LemonSqueezyApi | null> | null = null;

function loadLemonJs(): Promise<LemonSqueezyApi | null> {
  if (loading) return loading;

  loading = new Promise<LemonSqueezyApi | null>((resolve) => {
    if (window.LemonSqueezy) {
      resolve(window.LemonSqueezy);
      return;
    }

    const script = document.createElement('script');
    script.src = LEMON_JS;
    script.defer = true;

    // Never hang the button on a script that is not coming.
    const timeout = window.setTimeout(() => resolve(null), 6000);

    script.onload = () => {
      window.clearTimeout(timeout);
      try {
        window.createLemonSqueezy?.();
        resolve(window.LemonSqueezy ?? null);
      } catch {
        resolve(null);
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };

    document.head.appendChild(script);
  });

  return loading;
}

export type CheckoutOutcome =
  /** The overlay reported a completed order and handed us the key. */
  | { kind: 'activated'; key: string }
  /** Paid, but the payload carried no key — they finish from the email. */
  | { kind: 'paid-no-key' }
  /** The overlay could not be used; the hosted checkout opened in a new tab. */
  | { kind: 'new-tab' };

/**
 * Open the checkout. Resolves as soon as the outcome is known; a customer who
 * closes the overlay without buying simply never resolves anything, which is
 * correct — there is nothing to report.
 */
export async function openCheckout(buyUrl: string): Promise<CheckoutOutcome> {
  const api = await loadLemonJs();

  if (!api) {
    window.open(buyUrl, '_blank', 'noopener,noreferrer');
    return { kind: 'new-tab' };
  }

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    try {
      api.Setup({
        eventHandler: (event) => {
          if (event?.event !== 'Checkout.Success') return;
          const key = findLicenseKeyIn(event.data);
          finish(key ? { kind: 'activated', key } : { kind: 'paid-no-key' });
        },
      });
      // `embed=1` is what makes the hosted page render inside the overlay.
      api.Url.Open(withEmbed(buyUrl));
    } catch {
      window.open(buyUrl, '_blank', 'noopener,noreferrer');
      finish({ kind: 'new-tab' });
    }
  });
}

function withEmbed(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('embed', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * A key handed back in the URL, for the case where the vendor is configured to
 * redirect to the app after purchase. Costs nothing to support and removes the
 * email round-trip entirely when it works.
 */
export function licenseKeyFromUrl(search = window.location.search): string | null {
  const params = new URLSearchParams(search);
  for (const name of ['key', 'license_key', 'license-key', 'licence_key']) {
    const value = params.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

/** Take the key out of the address bar once used, so it is not shared or bookmarked. */
export function stripKeyFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const name of ['key', 'license_key', 'license-key', 'licence_key']) {
      if (url.searchParams.has(name)) {
        url.searchParams.delete(name);
        changed = true;
      }
    }
    if (changed) window.history.replaceState({}, '', url.toString());
  } catch {
    /* history is unavailable in some embedded contexts; harmless */
  }
}
