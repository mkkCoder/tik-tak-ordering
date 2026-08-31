import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVENTS_PLANNED_KEY,
  REPEAT_THRESHOLD,
  eventsPlanned,
  initEventsPlanned,
  recordNewEvent,
} from './eventsPlanned';

beforeEach(() => {
  localStorage.clear();
});

describe('counting events planned in this browser', () => {
  it('counts the first ever run as one event', () => {
    expect(eventsPlanned()).toBe(0);
    expect(initEventsPlanned()).toBe(1);
    expect(eventsPlanned()).toBe(1);
  });

  it('does not count a returning visitor as a new event', () => {
    initEventsPlanned();
    initEventsPlanned();
    initEventsPlanned();
    expect(eventsPlanned()).toBe(1);
  });

  it('counts each new plan', () => {
    initEventsPlanned();
    expect(recordNewEvent()).toBe(2);
    expect(recordNewEvent()).toBe(3);
  });
});

describe('the one signal that leaves the device', () => {
  it('reports nothing for a couple planning a single wedding', () => {
    const report = vi.fn();
    initEventsPlanned({ report });
    recordNewEvent({ report });
    expect(report).not.toHaveBeenCalled();
  });

  it('reports once when somebody starts a third event', () => {
    const report = vi.fn();
    initEventsPlanned({ report });
    recordNewEvent({ report });
    recordNewEvent({ report });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('repeat_planner');
  });

  it('never reports twice, however many events follow', () => {
    const report = vi.fn();
    initEventsPlanned({ report });
    for (let i = 0; i < 20; i++) recordNewEvent({ report });
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reports the event name and nothing else', () => {
    const report = vi.fn();
    initEventsPlanned({ report });
    for (let i = 1; i < REPEAT_THRESHOLD; i++) recordNewEvent({ report });
    expect(report.mock.calls[0]).toEqual(['repeat_planner']);
  });
});

describe('storage that will not cooperate', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };

  it('does not throw when storage is unavailable', () => {
    expect(() => initEventsPlanned({ storage: broken })).not.toThrow();
    expect(() => recordNewEvent({ storage: broken, report: vi.fn() })).not.toThrow();
    expect(eventsPlanned({ storage: broken })).toBe(0);
  });

  it('ignores junk left in storage', () => {
    localStorage.setItem(EVENTS_PLANNED_KEY, 'not a number');
    expect(eventsPlanned()).toBe(0);
    expect(initEventsPlanned()).toBe(1);
  });
});
