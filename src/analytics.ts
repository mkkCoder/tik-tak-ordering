/**
 * Four events, no cookies, no identifiers, no consent banner.
 *
 * The one number that says whether the product is alive is the ratio of
 * export_attempted to license_activated. Everything else is noise, so nothing
 * else is collected — and the counter is only ever told the event name, never
 * anything about the event being planned.
 */

export type AnalyticsEvent =
  | 'planner_opened'
  | 'guests_imported'
  | 'export_attempted'
  | 'license_activated'
  /** Somebody has started a third event — they plan events for a living. */
  | 'repeat_planner';

interface GoatCounter {
  count: (vars: { path: string; title?: string; event: boolean }) => void;
  filter?: () => string | false;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

const sentThisSession = new Set<AnalyticsEvent>();

export function track(event: AnalyticsEvent, once = false): void {
  if (once) {
    if (sentThisSession.has(event)) return;
    sentThisSession.add(event);
  }
  try {
    window.goatcounter?.count({ path: event, title: event, event: true });
  } catch {
    // A blocked or absent counter must never interrupt what the user is doing.
  }
}

/** Reset between tests. */
export function resetAnalytics(): void {
  sentThisSession.clear();
}
