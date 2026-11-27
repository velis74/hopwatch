import type { Itinerary, Leg, Trip, TripStop } from '../api/hopwatch-api';

export interface MapPoint {
  lat: number;
  lon: number;
}

/** A line of a {@link MapRoute}, drawn in the colour of its mode; walks are dashed. */
export interface MapLine {
  mode: Leg['mode'];
  /** `[lat, lon]` points. */
  points: [number, number][];
}

/** What the map draws instead of a stop: a ride or a journey. */
export interface MapRoute {
  /** The map fits its view again only when the id changes. */
  id: string;
  kind: 'ride' | 'journey';
  lines: MapLine[];
  start: MapPoint;
  end: MapPoint;
  /** Stops along the route, drawn as dots. */
  stops: MapPoint[];
}

/** The legs of `itinerary`; a leg without a path is a straight line. */
export function itineraryRoute(itinerary: Itinerary): MapRoute | null {
  if (!itinerary.legs.length) return null;
  const first = itinerary.legs[0].from;
  const last = itinerary.legs[itinerary.legs.length - 1].to;
  return {
    id: `journey:${itinerary.id}`,
    kind: 'journey',
    lines: itinerary.legs.map((leg) => ({
      mode: leg.mode,
      points:
        leg.geometry.length > 1
          ? leg.geometry
          : [
              [leg.from.lat, leg.from.lon],
              [leg.to.lat, leg.to.lon],
            ],
    })),
    start: { lat: first.lat, lon: first.lon },
    end: { lat: last.lat, lon: last.lon },
    stops: itinerary.legs.flatMap((leg) => (leg.mode === 'walk' ? [] : [leg.from, leg.to])),
  };
}

function nearestIndex(points: [number, number][], stop: MapPoint, from = 0): number {
  let best = from;
  let bestDistance = Infinity;
  for (let index = from; index < points.length; index += 1) {
    const [lat, lon] = points[index];
    const distance = (lat - stop.lat) ** 2 + (lon - stop.lon) ** 2;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** The part of the trip's path between the stops `entry` and `exit`; the straight lines between stops without one. */
export function tripSection(trip: Trip, entry: number, exit: number): [number, number][] {
  const stops = trip.stops.slice(entry, exit + 1);
  if (trip.geometry.length < 2) return stops.map((stop) => [stop.lat, stop.lon]);
  const start = nearestIndex(trip.geometry, trip.stops[entry]);
  const end = nearestIndex(trip.geometry, trip.stops[exit], start);
  const section = trip.geometry.slice(start, end + 1);
  return section.length > 1 ? section : stops.map((stop) => [stop.lat, stop.lon]);
}

/** The ride from the stop `entry` to the stop `exit` (indices into `trip.stops`). */
export function rideRoute(trip: Trip, entry: number, exit: number): MapRoute | null {
  const from = trip.stops[entry];
  const to = trip.stops[exit];
  if (!from || !to) return null;
  const point = (stop: TripStop): MapPoint => ({ lat: stop.lat, lon: stop.lon });
  return {
    id: `ride:${trip.trip_id}:${entry}:${exit}`,
    kind: 'ride',
    lines: [{ mode: trip.mode, points: tripSection(trip, entry, exit) }],
    start: point(from),
    end: point(to),
    stops: trip.stops.slice(entry, exit + 1).map(point),
  };
}

export interface StopVisit {
  /** The scheduled time of the visit (ISO 8601); picks the visit of a stop the ride calls at more than once. */
  time?: string | null;
  /** Whether `time` is the departure (boarding) or the arrival (exit) at the stop. */
  which?: 'arrival' | 'departure';
  /** Only stops after this index count. */
  after?: number;
}

/**
 * The index of the stop `stopId` in the trip, else of the stop visited at `visit.time`, else of the stop named `name`;
 * `fallback` when none is found. Of several visits of the stop, the one at `visit.time`, else the first.
 */
export function stopIndex(
  trip: Trip,
  stopId: string | null | undefined,
  name: string | null,
  fallback: number,
  visit: StopVisit = {},
): number {
  const { time, which = 'departure', after = -1 } = visit;
  const wanted = time ? new Date(time).getTime() : null;
  const indices = trip.stops.map((_, index) => index).filter((index) => index > after);
  const at = (index: number): boolean => {
    const stop = trip.stops[index];
    const scheduled =
      which === 'departure'
        ? (stop.scheduled_departure ?? stop.scheduled_arrival)
        : (stop.scheduled_arrival ?? stop.scheduled_departure);
    return wanted !== null && scheduled !== null && new Date(scheduled).getTime() === wanted;
  };
  const pick = (candidates: number[]): number | undefined => candidates.find(at) ?? candidates[0];
  const byId = stopId ? indices.filter((index) => trip.stops[index].id === stopId) : [];
  const byName = name ? indices.filter((index) => trip.stops[index].name === name) : [];
  return pick(byId) ?? indices.find(at) ?? pick(byName) ?? fallback;
}
