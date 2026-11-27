import { describe, expect, it } from 'vitest';

import { itinerary, trip } from '../test-journeys';

import { itineraryRoute, rideRoute, stopIndex, tripSection } from './map-route';

describe('map routes', () => {
  it('cuts the path of a ride between the boarding and the exit stop', () => {
    expect(tripSection(trip(), 1, 2)).toEqual([
      [46.24, 14.36],
      [46.3, 14.2],
      [46.36, 14.17],
    ]);
  });

  it('joins the stops with straight lines when the ride has no path', () => {
    expect(tripSection(trip({ geometry: [] }), 0, 1)).toEqual([
      [46.05, 14.51],
      [46.24, 14.36],
    ]);
  });

  it('draws a ride with markers at its ends and a dot at each stop', () => {
    const route = rideRoute(trip(), 0, 3)!;

    expect(route).toMatchObject({ id: 'ride:trip-1:0:3', kind: 'ride', start: { lat: 46.05, lon: 14.51 } });
    expect(route.end).toEqual({ lat: 46.43, lon: 14.05 });
    expect(route.stops).toHaveLength(4);
    expect(route.lines[0].mode).toBe('rail');
    expect(rideRoute(trip(), 0, 9)).toBeNull();
  });

  it('draws the legs of a journey, a leg without a path straight', () => {
    const route = itineraryRoute(itinerary())!;

    expect(route.id).toBe('journey:it-1');
    expect(route.lines.map((line) => line.mode)).toEqual(['rail', 'walk', 'bus']);
    expect(route.lines[1].points).toHaveLength(2);
    // Rides only: the walk has no stops of its own.
    expect(route.stops).toHaveLength(4);
    expect(itineraryRoute(itinerary({ legs: [] }))).toBeNull();
  });

  it('finds a stop by id, then by name, else takes the fallback', () => {
    expect(stopIndex(trip(), 's3', null, 0)).toBe(2);
    expect(stopIndex(trip(), 'unknown', 'Kranj', 0)).toBe(1);
    expect(stopIndex(trip(), null, 'Nowhere', 3)).toBe(3);
  });

  it('picks the visit at the given time of a stop the ride calls at twice, else the stop visited then', () => {
    const ride = trip();
    const loop = { ...ride.stops[1], scheduled_arrival: '2026-11-27T11:30:00+01:00', scheduled_departure: null };
    ride.stops.push({ ...loop, scheduled_departure: '2026-11-27T11:31:00+01:00' });
    const last = ride.stops.length - 1;

    expect(stopIndex(ride, ride.stops[1].id, null, 0)).toBe(1);
    expect(stopIndex(ride, ride.stops[1].id, null, 0, { time: '2026-11-27T10:31:00Z' })).toBe(last);
    expect(stopIndex(ride, 'station-group', null, 0, { time: '2026-11-27T11:31:00+01:00' })).toBe(last);
    expect(stopIndex(ride, ride.stops[1].id, null, 0, { after: 1 })).toBe(last);
    expect(stopIndex(ride, null, null, 0, { time: '2026-11-27T11:30:00+01:00', which: 'arrival' })).toBe(last);
  });
});
