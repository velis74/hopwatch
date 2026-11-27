import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { Itinerary } from '../api/hopwatch-api';
import type { MapRoute } from '../composables/map-route';

const ITINERARY_KEY = 'hopwatch.detailsItinerary';

function storedItinerary(): Itinerary | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(ITINERARY_KEY) ?? 'null');
    return value && typeof value.id === 'string' && Array.isArray(value.legs) ? value : null;
  } catch {
    return null;
  }
}

function storeItinerary(itinerary: Itinerary | null): void {
  try {
    if (itinerary) window.sessionStorage.setItem(ITINERARY_KEY, JSON.stringify(itinerary));
    else window.sessionStorage.removeItem(ITINERARY_KEY);
  } catch {
    // Without storage the journey details last until the page reloads.
  }
}

/**
 * The journey whose details are open, kept for the browser tab, and the route the map draws for the open details.
 */
export const useTripDetailsStore = defineStore('trip-details', () => {
  const itinerary = ref<Itinerary | null>(storedItinerary());
  const mapRoute = ref<MapRoute | null>(null);

  function openItinerary(value: Itinerary): void {
    itinerary.value = value;
    storeItinerary(value);
  }

  /** Replaces the open journey with its newer version from `itineraries`, when it is among them. */
  function refreshItinerary(itineraries: Itinerary[]): void {
    const newer = itinerary.value && itineraries.find((candidate) => candidate.id === itinerary.value?.id);
    if (newer) openItinerary(newer);
  }

  function setMapRoute(route: MapRoute | null): void {
    mapRoute.value = route;
  }

  return { itinerary, mapRoute, openItinerary, refreshItinerary, setMapRoute };
});
