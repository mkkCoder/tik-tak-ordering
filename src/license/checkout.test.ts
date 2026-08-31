import { describe, expect, it, vi } from 'vitest';
import { openCheckout, type CheckoutOutcome } from './checkout';

const BUY = 'https://tik-tak.lemonsqueezy.com/checkout/buy/abc-123';
const KEY = '3b1f2c8a-9d4e-4a71-b6c2-77e0f1a9d3b4';

/** A stand-in for lemon.js that lets a test fire events on demand. */
function fakeApi() {
  let handler: ((event: { event?: string; data?: unknown }) => void) | undefined;
  const opened: string[] = [];
  const closed = { count: 0 };
  return {
    api: {
      Setup: (options: { eventHandler: (event: { event?: string; data?: unknown }) => void }) => {
        handler = options.eventHandler;
      },
      Url: {
        Open: (url: string) => void opened.push(url),
        Close: () => void (closed.count += 1),
      },
    },
    opened,
    closed,
    fire: (event: { event?: string; data?: unknown }) => handler?.(event),
  };
}

describe('openCheckout', () => {
  it('resolves as soon as the overlay is up, with nobody having paid', async () => {
    // The regression: awaiting payment here left the button on "Opening…"
    // forever the moment someone pressed Escape.
    const { api, opened } = fakeApi();
    const onPaid = vi.fn();

    const result = await openCheckout(BUY, onPaid, { load: () => Promise.resolve(api) });

    expect(result).toBe('overlay');
    expect(onPaid).not.toHaveBeenCalled();
    expect(opened).toHaveLength(1);
  });

  it('asks for the embedded checkout, keeping the buy url otherwise intact', async () => {
    const { api, opened } = fakeApi();
    await openCheckout(BUY, vi.fn(), { load: () => Promise.resolve(api) });
    const url = new URL(opened[0] ?? '');
    expect(url.searchParams.get('embed')).toBe('1');
    expect(url.pathname).toBe('/checkout/buy/abc-123');
  });

  it('reports the key when the completed order carries one', async () => {
    const { api, fire } = fakeApi();
    const outcomes: CheckoutOutcome[] = [];

    await openCheckout(BUY, (o) => void outcomes.push(o), { load: () => Promise.resolve(api) });
    fire({
      event: 'Checkout.Success',
      data: { order: { data: { attributes: { license_key: KEY } } } },
    });

    expect(outcomes).toEqual([{ kind: 'activated', key: KEY }]);
  });

  it('reports a payment with no key, so the email path can take over', async () => {
    const { api, fire } = fakeApi();
    const outcomes: CheckoutOutcome[] = [];

    await openCheckout(BUY, (o) => void outcomes.push(o), { load: () => Promise.resolve(api) });
    fire({ event: 'Checkout.Success', data: { order: { total: 1900 } } });

    expect(outcomes).toEqual([{ kind: 'paid-no-key' }]);
  });

  it('ignores the overlay chatter that is not a completed order', async () => {
    const { api, fire } = fakeApi();
    const onPaid = vi.fn();

    await openCheckout(BUY, onPaid, { load: () => Promise.resolve(api) });
    fire({ event: 'Checkout.ViewCart' });
    fire({ event: undefined });

    expect(onPaid).not.toHaveBeenCalled();
  });

  it('never charges the caller twice for one checkout', async () => {
    const { api, fire } = fakeApi();
    const onPaid = vi.fn();

    await openCheckout(BUY, onPaid, { load: () => Promise.resolve(api) });
    fire({ event: 'Checkout.Success', data: { license_key: KEY } });
    fire({ event: 'Checkout.Success', data: { license_key: KEY } });

    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('closes the overlay on success, so the vendor cannot navigate the page away', async () => {
    // The vendor's own thank-you panel carries a button that reloads the app and
    // throws away the export in progress. Shut the overlay before it can appear.
    const { api, fire, closed } = fakeApi();

    await openCheckout(BUY, vi.fn(), { load: () => Promise.resolve(api) });
    expect(closed.count).toBe(0);

    fire({ event: 'Checkout.Success', data: { license_key: KEY } });
    expect(closed.count).toBe(1);
  });

  it('still reports the payment if the overlay refuses to close', async () => {
    const { api, fire } = fakeApi();
    api.Url.Close = () => {
      throw new Error('nope');
    };
    const onPaid = vi.fn();

    await openCheckout(BUY, onPaid, { load: () => Promise.resolve(api) });
    fire({ event: 'Checkout.Success', data: { license_key: KEY } });

    expect(onPaid).toHaveBeenCalledWith({ kind: 'activated', key: KEY });
  });

  it('falls back to a new tab when the script cannot be loaded', async () => {
    const openTab = vi.fn();
    const result = await openCheckout(BUY, vi.fn(), {
      load: () => Promise.resolve(null),
      openTab,
    });

    expect(result).toBe('new-tab');
    expect(openTab).toHaveBeenCalledWith(BUY);
  });

  it('falls back to a new tab when the script loads but misbehaves', async () => {
    const openTab = vi.fn();
    const broken = {
      Setup: () => {
        throw new Error('boom');
      },
      Url: { Open: () => undefined },
    };

    const result = await openCheckout(BUY, vi.fn(), {
      load: () => Promise.resolve(broken),
      openTab,
    });

    expect(result).toBe('new-tab');
    expect(openTab).toHaveBeenCalledWith(BUY);
  });
});
