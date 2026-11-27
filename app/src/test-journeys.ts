import type { Itinerary, Journeys, Leg, LegStop, Trip, TripStop } from './api/hopwatch-api';

/** Test data of the journey specs. */
export function legStop(name: string, scheduled: string, overrides: Partial<LegStop> = {}): LegStop {
  return { id: `id:${name}`, name, lat: 46, lon: 14.5, scheduled, expected: null, platform: null, ...overrides };
}

export function leg(overrides: Partial<Leg> = {}): Leg {
  return {
    mode: 'rail',
    line: 'IC 502',
    headsign: 'Koper',
    operator: { id: '1161', name: 'SŽ - Potniški promet, d.o.o.', url: 'https://potniski.sz.si/' },
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
        operator: null,
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
        operator: { id: '1123', name: 'Arriva d.o.o.', url: 'https://arriva.si/' },
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

/** A stop of a ride; `arrival` and `departure` are local times on 27 November 2026 ("10:05"), null for none. */
export function tripStop(
  id: string,
  name: string,
  arrival: string | null,
  departure: string | null,
  overrides: Partial<TripStop> = {},
): TripStop {
  const at = (time: string | null) => (time ? `2026-11-27T${time}:00+01:00` : null);
  return {
    id,
    name,
    lat: 46,
    lon: 14.5,
    scheduled_arrival: at(arrival),
    expected_arrival: null,
    scheduled_departure: at(departure),
    expected_departure: null,
    delay_minutes: null,
    delay_source: null,
    platform: null,
    cancelled: false,
    passed: false,
    ...overrides,
  };
}

/** The ride Ljubljana – Jesenice with four stops. */
export function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    trip_id: 'trip-1',
    mode: 'rail',
    line: 'RG 2100',
    headsign: 'Jesenice',
    operator: { id: '1161', name: 'SŽ - Potniški promet, d.o.o.', url: 'https://potniski.sz.si/' },
    cancelled: false,
    bikes_allowed: true,
    wheelchair_accessible: false,
    ticket_url: null,
    geometry: [
      [46.05, 14.51],
      [46.1, 14.4],
      [46.24, 14.36],
      [46.3, 14.2],
      [46.36, 14.17],
      [46.43, 14.05],
    ],
    stops: [
      tripStop('s1', 'Ljubljana', null, '10:00', { lat: 46.05, lon: 14.51, platform: '3', passed: true }),
      tripStop('s2', 'Kranj', '10:25', '10:27', { lat: 46.24, lon: 14.36 }),
      tripStop('s3', 'Lesce-Bled', '10:45', '10:46', { lat: 46.36, lon: 14.17 }),
      tripStop('s4', 'Jesenice', '10:58', null, { lat: 46.43, lon: 14.05 }),
    ],
    ...overrides,
  };
}
