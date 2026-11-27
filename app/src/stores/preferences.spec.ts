import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { EXPERIENCES, usePreferencesStore } from './preferences';

/** The store as a newly opened app sees it. */
function freshStore() {
  setActivePinia(createPinia());
  return usePreferencesStore();
}

describe('preferences', () => {
  beforeEach(() => window.localStorage.clear());

  it('offers the simple and the lively experience', () => {
    expect(EXPERIENCES).toEqual(['simple', 'lively']);
  });

  it('has no choice on first start and shows the lively experience', () => {
    const preferences = freshStore();

    expect(preferences.experience).toBeNull();
    expect(preferences.effectiveExperience).toBe('lively');
  });

  it.each(EXPERIENCES)('applies the choice of the %s experience at once', (experience) => {
    const preferences = freshStore();

    preferences.setExperience(experience);

    expect(preferences.experience).toBe(experience);
    expect(preferences.effectiveExperience).toBe(experience);
  });

  it('keeps the choice on the device for the next start', () => {
    freshStore().setExperience('simple');

    const next = freshStore();

    expect(next.experience).toBe('simple');
    expect(next.effectiveExperience).toBe('simple');
  });

  it('ignores an unknown stored value', () => {
    window.localStorage.setItem('hopwatch.experience', 'flashy');

    const preferences = freshStore();

    expect(preferences.experience).toBeNull();
    expect(preferences.effectiveExperience).toBe('lively');
  });
});
