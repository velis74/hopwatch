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

  it('includes no nearby stops by default', () => {
    expect(freshStore().nearbyModes).toEqual([]);
  });

  it('keeps the modes of nearby stops to include on the device, in a fixed order', () => {
    freshStore().setNearbyModes(['tram', 'rail', 'tram']);

    const next = freshStore();

    expect(next.nearbyModes).toEqual(['rail', 'tram']);
    expect(window.localStorage.getItem('hopwatch.nearbyModes')).toBe('["rail","tram"]');
  });

  it.each(['not json', '{"rail": true}', '["rail", "plane"]'])('ignores the unusable stored modes %s', (stored) => {
    window.localStorage.setItem('hopwatch.nearbyModes', stored);

    expect(freshStore().nearbyModes).toEqual(stored.startsWith('[') ? ['rail'] : []);
  });
});
