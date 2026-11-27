import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { itinerary } from '../test-journeys';

import { useTripDetailsStore } from './trip-details';

describe('trip details store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('keeps the open journey for the browser tab', () => {
    useTripDetailsStore().openItinerary(itinerary());

    setActivePinia(createPinia());

    expect(useTripDetailsStore().itinerary?.id).toBe('it-1');
  });

  it('replaces the open journey with its newer version and ignores other journeys', () => {
    const details = useTripDetailsStore();
    details.openItinerary(itinerary());

    details.refreshItinerary([itinerary({ id: 'it-2', transfers: 3 })]);
    expect(details.itinerary?.transfers).toBe(1);

    details.refreshItinerary([itinerary({ transfers: 2 })]);
    expect(details.itinerary?.transfers).toBe(2);
  });

  it('ignores a damaged stored journey', () => {
    window.sessionStorage.setItem('hopwatch.detailsItinerary', '{not json');

    expect(useTripDetailsStore().itinerary).toBeNull();
  });

  it('keeps the journey in memory when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const details = useTripDetailsStore();

    details.openItinerary(itinerary());

    expect(details.itinerary?.id).toBe('it-1');
  });
});
