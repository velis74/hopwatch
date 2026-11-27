import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

import { type RefreshClock, systemClock, useRefreshScheduler } from './use-refresh-scheduler';

/** A clock whose time and ticks the test moves by hand. */
function manualClock(start = 1_000_000) {
  let time = start;
  let tick: (() => void) | null = null;
  const clock: RefreshClock & { stopped: boolean } = {
    stopped: false,
    now: () => time,
    every(_ms, callback) {
      tick = callback;
      return () => {
        clock.stopped = true;
        tick = null;
      };
    },
  };
  return {
    clock,
    /** Lets `ms` pass in ticks of `stepMs`, as a running timer does. */
    run(ms: number, stepMs = 500) {
      for (let passed = 0; passed < ms; passed += stepMs) {
        time += stepMs;
        tick?.();
      }
    },
    /** Lets `ms` pass without a tick, as when the page is frozen, then ticks once. */
    freeze(ms: number) {
      time += ms;
      tick?.();
    },
  };
}

function start(clock: RefreshClock) {
  const load = vi.fn();
  const scope = effectScope();
  const scheduler = scope.run(() => useRefreshScheduler(load, { clock }))!;
  return { load, scope, scheduler };
}

function setHidden(hidden: boolean) {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useRefreshScheduler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads every 30 seconds', () => {
    const { clock, run } = manualClock();
    const { load } = start(clock);

    run(29500);
    expect(load).not.toHaveBeenCalled();
    run(500);
    expect(load).toHaveBeenCalledTimes(1);
    run(30000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('starts the count again after a load on request', () => {
    const { clock, run } = manualClock();
    const { load, scheduler } = start(clock);

    run(20000);
    scheduler.loadNow();
    expect(load).toHaveBeenCalledTimes(1);
    run(29500);
    expect(load).toHaveBeenCalledTimes(1);
    run(500);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads on the first tick after the page was frozen for longer than 30 seconds, and counts from there', () => {
    const { clock, run, freeze } = manualClock();
    const { load } = start(clock);

    run(5000);
    freeze(40000);
    expect(load).toHaveBeenCalledTimes(1);
    run(29500);
    expect(load).toHaveBeenCalledTimes(1);
    run(500);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('counts a shorter freeze towards the 30 seconds', () => {
    const { clock, run, freeze } = manualClock();
    const { load } = start(clock);

    run(5000);
    freeze(10000);
    expect(load).not.toHaveBeenCalled();
    run(14500);
    expect(load).not.toHaveBeenCalled();
    run(500);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not load while the page is hidden and loads on the first tick after it is shown', () => {
    const { clock, run } = manualClock();
    const { load } = start(clock);

    setHidden(true);
    run(60000);
    expect(load).not.toHaveBeenCalled();

    setHidden(false);
    run(500);
    expect(load).toHaveBeenCalledTimes(1);
    run(500);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the time of the latest tick', () => {
    const { clock, run } = manualClock(1000);
    const { scheduler } = start(clock);

    expect(scheduler.now.value).toBe(1000);
    run(1500);
    expect(scheduler.now.value).toBe(2500);
  });

  it('stops with its scope', () => {
    const { clock, run } = manualClock();
    const { load, scope } = start(clock);

    scope.stop();
    run(60000);
    setHidden(false);

    expect(clock.stopped).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('ticks with the system timer by default', () => {
    vi.useFakeTimers();
    try {
      const tick = vi.fn();
      const stop = systemClock.every(500, tick);
      vi.advanceTimersByTime(1500);
      stop();
      vi.advanceTimersByTime(1500);

      expect(tick).toHaveBeenCalledTimes(3);
      expect(systemClock.now()).toBe(Date.now());
    } finally {
      vi.useRealTimers();
    }
  });
});
