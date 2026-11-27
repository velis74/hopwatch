import type { Itinerary, Journeys, Leg, LegStop } from './api/hopwatch-api';

/** Test data of the journey specs. */
export function legStop(name: string, scheduled: string, overrides: Partial<LegStop> = {}): LegStop {
  return { id: `id:${name}`, name, lat: 46, lon: 14.5, scheduled, expected: null, platform: null, ...overrides };
}

export function leg(overrides: Partial<Leg> = {}): Leg {
  return {
    mode: 'rail',
    line: 'IC 502',
    headsign: 'Koper',
    trip_id: 'trip-1',
    from: legStop('Ljubljana', '2026-11-27T09:05:00Z', { lat: 46.0584, lon: 14.5127, platform: '3' }),
    to: legStop('Divača', '2026-11-27T10:20:00Z', { lat: 45.68, lon: 13.97 }),
    delay_minutes: null,
    delay_source: null,
    intermediate_stops: ['Postojna'],
    geometry: [
      [46.0584, 14.5127],
      [45.68, 13.97],
    ],
    distance_m: null,
    ticket_url: null,
    ...overrides,
  };
}

export function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: 'it-1',
    scheduled_departure: '2026-11-27T09:05:00Z',
    expected_departure: null,
    scheduled_arrival: '2026-11-27T10:35:00Z',
    expected_arrival: null,
    duration_minutes: 90,
    transfers: 1,
    legs: [
      leg(),
      leg({
        mode: 'walk',
        line: null,
        headsign: null,
        trip_id: null,
        from: legStop('Divača', '2026-11-27T10:20:00Z'),
        to: legStop('Divača AP', '2026-11-27T10:25:00Z'),
        intermediate_stops: [],
        geometry: [],
        distance_m: 240.4,
      }),
      leg({
        mode: 'bus',
        line: '1',
        headsign: 'Koper',
        trip_id: 'trip-2',
        from: legStop('Divača AP', '2026-11-27T10:25:00Z'),
        to: legStop('Koper', '2026-11-27T10:35:00Z', { lat: 45.548, lon: 13.7302 }),
      }),
    ],
    ...overrides,
  };
}

export function journeysPage(itineraries: Itinerary[], cursors: Partial<Journeys> = {}): Journeys {
  return { itineraries, earlier_cursor: 'earlier-1', later_cursor: 'later-1', ...cursors };
}
