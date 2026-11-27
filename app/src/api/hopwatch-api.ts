import axios from 'axios';

/** The axios instance for the Hopwatch API at `/api/v1`. */
export const api = axios.create({ baseURL: '/api/v1', withCredentials: true });

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface NearbyStop extends Stop {
  distance_m: number;
}

export type TransportMode = 'rail' | 'bus' | 'tram' | 'other';
export type DelaySource = 'official' | 'riders' | 'estimate';

export interface Departure {
  trip_id: string;
  mode: TransportMode;
  line: string;
  headsign: string;
  scheduled_departure: string;
  expected_departure: string | null;
  delay_minutes: number | null;
  delay_source: DelaySource | null;
  platform: string | null;
  next_stops: string[];
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

export async function departures(stopId: string, destination?: string, windowMinutes = 60): Promise<Departure[]> {
  const params: Record<string, string | number> = { stop_id: stopId, window_minutes: windowMinutes };
  if (destination) params.destination = destination;
  const response = await api.get<Departure[]>('/departures', { params });
  return response.data;
}

export async function accountMe(): Promise<Account> {
  const response = await api.get<Account>('/account/me');
  return response.data;
}
