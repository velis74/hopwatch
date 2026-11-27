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

  it('keeps the added stops on the device per From stop, once each', () => {
    const koper = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: ['rail' as const] };
    const kranj = { id: 'si:7', name: 'Kranj', lat: 46.2389, lon: 14.3556, modes: [] };
    const preferences = freshStore();
    preferences.addStop('si:1', koper);
    preferences.addStop('si:1', kranj);
    preferences.addStop('si:1', koper);
    preferences.addStop('si:9', kranj);

    expect(freshStore().addedStops).toEqual({ 'si:1': [kranj, koper], 'si:9': [kranj] });

    preferences.removeStop('si:9', 'si:7');
    preferences.removeStop('si:1', 'si:2');
    expect(JSON.parse(window.localStorage.getItem('hopwatch.addedStops')!)).toEqual({ 'si:1': [kranj] });
  });

  it.each(['not json', '[]', '{"si:1": "si:2"}', '{"si:1": [{"id": "si:2"}]}'])(
    'ignores the unusable stored added stops %s',
    (stored) => {
      window.localStorage.setItem('hopwatch.addedStops', stored);

      expect(freshStore().addedStops).toEqual({});
    },
  );

  it('has no favourite operators by default', () => {
    const preferences = freshStore();

    expect(preferences.favouriteOperators).toEqual([]);
    expect(preferences.isFavouriteOperator('1161')).toBe(false);
    expect(preferences.isFavouriteOperator(null)).toBe(false);
  });

  it('keeps the favourite operators on the device, once each', () => {
    const preferences = freshStore();
    preferences.setFavouriteOperator('1161', true);
    preferences.setFavouriteOperator('1123', true);
    preferences.setFavouriteOperator('1161', true);

    const next = freshStore();
    expect(next.favouriteOperators).toEqual(['1123', '1161']);
    expect(next.isFavouriteOperator('1123')).toBe(true);
    expect(next.isFavouriteOperator('1119')).toBe(false);

    next.setFavouriteOperator('1123', false);
    expect(next.isFavouriteOperator('1123')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('hopwatch.favouriteOperators')!)).toEqual(['1161']);
  });

  it.each([
    ['not json', []],
    ['{"1161": true}', []],
    ['["1161", 7, "", "1161", "1123"]', ['1161', '1123']],
  ])('ignores the unusable stored favourite operators in %s', (stored, expected) => {
    window.localStorage.setItem('hopwatch.favouriteOperators', stored);

    expect(freshStore().favouriteOperators).toEqual(expected);
  });

  it('keeps the name of a favourite operator until it is removed', () => {
    const preferences = freshStore();
    preferences.setFavouriteOperator('1119', true, 'Nomago d.o.o.');
    preferences.setFavouriteOperator('1123', true, 'Arriva d.o.o.');
    preferences.setFavouriteOperator('1123', false);

    expect(freshStore().favouriteOperatorNames).toEqual({
      '1119': 'Nomago d.o.o.',
    });
  });

  it.each(['not json', '["Nomago"]', '{"1119": 7, "1123": "Arriva d.o.o."}'])(
    'ignores the unusable stored favourite operator names in %s',
    (stored) => {
      window.localStorage.setItem('hopwatch.favouriteOperatorNames', stored);

      expect(freshStore().favouriteOperatorNames).toEqual(stored.includes('Arriva') ? { '1123': 'Arriva d.o.o.' } : {});
    },
  );
});
