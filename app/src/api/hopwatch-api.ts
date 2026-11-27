import axios from 'axios';

/** The axios instance for the Hopwatch API at `/api/v1`. */
export const api = axios.create({ baseURL: '/api/v1', withCredentials: true });

export type TransportMode = 'rail' | 'bus' | 'tram' | 'other';
export const TRANSPORT_MODES: readonly TransportMode[] = ['rail', 'bus', 'tram', 'other'];
export type DelaySource = 'official' | 'riders' | 'estimate';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Modes of the services calling at the stop; empty when unknown. */
  modes: TransportMode[];
}

export interface NearbyStop extends Stop {
  distance_m: number;
}

/** A transport operator: the company that runs a trip. */
export interface Operator {
  id: string;
  name: string;
  url: string | null;
}

export interface Departure {
  trip_id: string;
  stop_id: string;
  stop_name: string;
  mode: TransportMode;
  line: string;
  headsign: string;
  /** Null when the timetable names no operator. */
  operator: Operator | null;
  scheduled_departure: string;
  expected_departure: string | null;
  delay_minutes: number | null;
  delay_source: DelaySource | null;
  platform: string | null;
  next_stops: string[];
}

export interface LegStop {
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  scheduled: string;
  expected: string | null;
  platform: string | null;
}

export interface Leg {
  mode: TransportMode | 'walk';
  line: string | null;
  headsign: string | null;
  /** Null for a walk and when the timetable names no operator. */
  operator: Operator | null;
  trip_id: string | null;
  from: LegStop;
  to: LegStop;
  delay_minutes: number | null;
  delay_source: DelaySource | null;
  intermediate_stops: string[];
  /** The leg's path as `[lat, lon]` points. */
  geometry: [number, number][];
  distance_m: number | null;
  ticket_url: string | null;
}

export interface Itinerary {
  id: string;
  scheduled_departure: string;
  expected_departure: string | null;
  scheduled_arrival: string;
  expected_arrival: string | null;
  duration_minutes: number;
  transfers: number;
  legs: Leg[];
}

export interface Journeys {
  itineraries: Itinerary[];
  earlier_cursor: string | null;
  later_cursor: string | null;
}

export interface JourneyQuery {
  fromStopId: string;
  toStopId: string;
  /** ISO 8601 with an offset; the server takes the current time when it is missing. */
  time?: string;
  /** `time` is the latest arrival instead of the departure. */
  arriveBy?: boolean;
  pageCursor?: string;
}

export interface Account {
  id: number;
  email: string;
  display_name: string;
}

export async function nearbyStops(lat: number, lon: number, radiusM = 1000): Promise<NearbyStop[]> {
  const response = await api.get<NearbyStop[]>('/stops/nearby', { params: { lat, lon, radius_m: radiusM } });
  return response.data;
}

export async function searchStops(q: string): Promise<Stop[]> {
  const response = await api.get<Stop[]>('/stops', { params: { q } });
  return response.data;
}

/** Departures of all `stopIds`, merged and ordered by departure time. */
export async function departures(stopIds: string[], windowMinutes = 60): Promise<Departure[]> {
  const response = await api.get<Departure[]>('/departures', {
    params: { stop_id: stopIds, window_minutes: windowMinutes },
    // A repeated key: `stop_id=a&stop_id=b`.
    paramsSerializer: { indexes: null },
  });
  return response.data;
}

export async function journeys(query: JourneyQuery): Promise<Journeys> {
  const params: Record<string, string | boolean> = { from_stop_id: query.fromStopId, to_stop_id: query.toStopId };
  if (query.time) params.time = query.time;
  if (query.arriveBy) params.arrive_by = true;
  if (query.pageCursor) params.page_cursor = query.pageCursor;
  const response = await api.get<Journeys>('/journeys', { params });
  return response.data;
}

/** The operators of the timetable, by name. */
export async function operators(): Promise<Operator[]> {
  const response = await api.get<Operator[]>('/operators');
  return response.data;
}

export async function accountMe(): Promise<Account> {
  const response = await api.get<Account>('/account/me');
  return response.data;
}
