import { onScopeDispose, readonly, ref, type Ref } from 'vue';

/** Time source and timer of {@link useRefreshScheduler}; tests pass their own. */
export interface RefreshClock {
  /** Milliseconds since the epoch. */
  now(): number;
  /** Calls `tick` every `ms`; returns the function that stops it. */
  every(ms: number, tick: () => void): () => void;
}

export const systemClock: RefreshClock = {
  now: () => Date.now(),
  every(ms, tick) {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  },
};

export interface RefreshSchedulerOptions {
  /** Time between regular loads. */
  intervalMs?: number;
  /** Time between ticks of the timer. */
  tickMs?: number;
  clock?: RefreshClock;
}

export interface RefreshScheduler {
  /** The time of the latest tick or load; reactive. */
  now: Readonly<Ref<number>>;
  /** Loads now and starts the interval count again. */
  loadNow(): void;
}

/**
 * Calls `load` when `intervalMs` have passed since the last load, checked on every tick while the page is visible.
 * A page that was hidden or frozen for longer loads on its first tick. Stops with the calling scope.
 */
export function useRefreshScheduler(load: () => unknown, options: RefreshSchedulerOptions = {}): RefreshScheduler {
  const { intervalMs = 30000, tickMs = 500, clock = systemClock } = options;
  const now = ref(clock.now());
  let lastLoad = now.value;

  function loadNow(): void {
    const time = clock.now();
    now.value = time;
    lastLoad = time;
    void load();
  }

  function tick(): void {
    const time = clock.now();
    now.value = time;
    if (!document.hidden && time - lastLoad >= intervalMs) loadNow();
  }

  const stop = clock.every(tickMs, tick);
  onScopeDispose(stop);

  return { now: readonly(now), loadNow };
}
