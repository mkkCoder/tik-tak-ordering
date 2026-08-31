import { track } from '@/analytics';

/**
 * How many separate events this browser has planned.
 *
 * One question this is meant to answer, and only one: does anybody use TIKTAK
 * more than once? A couple plans a wedding and never returns. A wedding planner
 * plans thirty. Those two people want different products at different prices,
 * and there is no point building the second one until there is evidence the
 * person exists.
 *
 * What leaves the device is a single anonymous event name, once, the third time
 * somebody starts a new plan — no count, no identifier, nothing about the event
 * itself. The number stays in this browser. That is enough to tell the
 * difference between "planners are a real segment" and "nobody comes back",
 * which is the only decision it needs to inform.
 */

export const EVENTS_PLANNED_KEY = 'tiktak:events';

/** The point at which somebody is planning events rather than an event. */
export const REPEAT_THRESHOLD = 3;

interface Deps {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  report?: typeof track;
}

function read(storage: Deps['storage']): number {
  try {
    const raw = storage?.getItem(EVENTS_PLANNED_KEY);
    const value = raw === null || raw === undefined ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    // Private browsing, or storage disabled. Not knowing is fine.
    return 0;
  }
}

function write(storage: Deps['storage'], value: number): void {
  try {
    storage?.setItem(EVENTS_PLANNED_KEY, String(value));
  } catch {
    /* nothing here is worth interrupting anyone for */
  }
}

/** How many events this browser has planned. Zero before the app has ever run. */
export function eventsPlanned(deps: Deps = {}): number {
  return read(deps.storage ?? safeStorage());
}

/**
 * Called once on boot. The first ever run counts as the first event; every run
 * after that leaves the count alone, or a returning visitor would look like a
 * planner by the end of the week.
 */
export function initEventsPlanned(deps: Deps = {}): number {
  const storage = deps.storage ?? safeStorage();
  const current = read(storage);
  if (current > 0) return current;
  write(storage, 1);
  return 1;
}

/**
 * Called when somebody starts a new plan. Reports once, at the threshold, and
 * never again — the signal is "this happens at all", not how often.
 */
export function recordNewEvent(deps: Deps = {}): number {
  const storage = deps.storage ?? safeStorage();
  const next = read(storage) + 1;
  write(storage, next);
  if (next === REPEAT_THRESHOLD) (deps.report ?? track)('repeat_planner');
  return next;
}

function safeStorage(): Deps['storage'] {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
