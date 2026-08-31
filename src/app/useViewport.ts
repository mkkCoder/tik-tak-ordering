import { useEffect, useState } from 'react';

/**
 * Three layouts, not a continuum.
 *
 * - `desktop` — the three-zone plan editor.
 * - `tablet` — the plan takes the whole width and the guest list becomes a
 *   bottom sheet, because a 260px rail on a 900px screen costs more than it
 *   gives.
 * - `phone` — read-only. Arranging a room by dragging on a five-inch screen is
 *   a poor experience however carefully it is built, and pretending otherwise
 *   wastes someone's evening. Viewing and exporting still work.
 */
export type Viewport = 'phone' | 'tablet' | 'desktop';

const PHONE_MAX = 640;
const TABLET_MAX = 1024;

function read(): Viewport {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < PHONE_MAX) return 'phone';
  if (w < TABLET_MAX) return 'tablet';
  return 'desktop';
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(read);

  useEffect(() => {
    // Media queries rather than a resize listener: no work on every pixel.
    const phone = window.matchMedia(`(max-width: ${PHONE_MAX - 1}px)`);
    const tablet = window.matchMedia(`(max-width: ${TABLET_MAX - 1}px)`);
    const update = () => setViewport(read());

    phone.addEventListener('change', update);
    tablet.addEventListener('change', update);
    update();
    return () => {
      phone.removeEventListener('change', update);
      tablet.removeEventListener('change', update);
    };
  }, []);

  return viewport;
}
