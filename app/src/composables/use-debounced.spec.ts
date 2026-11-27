import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { useDebounced } from './use-debounced';

describe('useDebounced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function debounced(initial: string, delayMs = 300) {
    const scope = effectScope();
    const source = ref(initial);
    const copy = scope.run(() => useDebounced(source, delayMs))!;
    return { scope, source, copy };
  }

  it('starts with the value of the source', () => {
    const { copy } = debounced('Ljub');

    expect(copy.value).toBe('Ljub');
  });

  it('follows a change once the delay has passed', async () => {
    const { source, copy } = debounced('', 300);

    source.value = 'Maribor';
    await nextTick();
    vi.advanceTimersByTime(299);
    expect(copy.value).toBe('');

    vi.advanceTimersByTime(1);
    expect(copy.value).toBe('Maribor');
  });

  it('takes only the last of quick successive changes, a delay after it', async () => {
    const { source, copy } = debounced('', 300);
    const seen: string[] = [];

    for (const value of ['L', 'Lj', 'Lju']) {
      source.value = value;
      await nextTick();
      vi.advanceTimersByTime(200);
      seen.push(copy.value);
    }
    vi.advanceTimersByTime(100);

    expect(seen).toEqual(['', '', '']);
    expect(copy.value).toBe('Lju');
  });

  it('stops following the source when its scope ends', async () => {
    const { scope, source, copy } = debounced('', 300);

    source.value = 'Koper';
    await nextTick();
    scope.stop();
    vi.advanceTimersByTime(1000);

    expect(copy.value).toBe('');
  });
});
