import { describe, expect, it } from 'vitest';

import { toLocalInput, toOffsetIso } from './local-time';

describe('local time', () => {
  it('gives the local date and time as a datetime-local value', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 3, 59))).toBe('2026-01-05T07:03');
  });

  it('turns a datetime-local value into ISO 8601 with the local offset for the same instant', () => {
    const iso = toOffsetIso('2026-11-27T10:05')!;

    expect(iso).toMatch(/^2026-11-27T10:05:00[+-]\d\d:\d\d$/u);
    expect(new Date(iso).getTime()).toBe(new Date(2026, 10, 27, 10, 5).getTime());
  });

  it.each(['', 'soon', '2026-11-27', '2026-13-45T99:99'])('gives null for the unusable value "%s"', (value) => {
    expect(toOffsetIso(value)).toBeNull();
  });
});
