import { defineStore } from 'pinia';

import { type Stop, TRANSPORT_MODES, type TransportMode } from '../api/hopwatch-api';
import { readDeviceValue, writeDeviceValue } from '../device-storage';

export const EXPERIENCES = ['simple', 'lively'] as const;
export type Experience = (typeof EXPERIENCES)[number];

const EXPERIENCE_KEY = 'hopwatch.experience';
const NEARBY_MODES_KEY = 'hopwatch.nearbyModes';
const ADDED_STOPS_KEY = 'hopwatch.addedStops';

function storedExperience(): Experience | null {
  const value = readDeviceValue(EXPERIENCE_KEY);
  return (EXPERIENCES as readonly string[]).includes(value ?? '') ? (value as Experience) : null;
}

/** The stored modes in the order of {@link TRANSPORT_MODES}; unknown values are dropped. */
function storedNearbyModes(): TransportMode[] {
  let value: unknown;
  try {
    value = JSON.parse(readDeviceValue(NEARBY_MODES_KEY) ?? '[]');
  } catch {
    return [];
  }
  return Array.isArray(value) ? TRANSPORT_MODES.filter((mode) => value.includes(mode)) : [];
}

function isStop(value: unknown): value is Stop {
  const stop = value as Partial<Stop> | null;
  return (
    typeof stop?.id === 'string' &&
    typeof stop.name === 'string' &&
    typeof stop.lat === 'number' &&
    typeof stop.lon === 'number'
  );
}

/** The stored added stops by From stop id; malformed entries are dropped. */
function storedAddedStops(): Record<string, Stop[]> {
  let value: unknown;
  try {
    value = JSON.parse(readDeviceValue(ADDED_STOPS_KEY) ?? '{}');
  } catch {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, Stop[]> = {};
  for (const [fromId, stops] of Object.entries(value)) {
    if (!Array.isArray(stops)) continue;
    const valid = stops.filter(isStop).map((stop) => ({
      id: stop.id,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      modes: Array.isArray(stop.modes) ? TRANSPORT_MODES.filter((mode) => stop.modes.includes(mode)) : [],
    }));
    if (valid.length) result[fromId] = valid;
  }
  return result;
}

/** Preferences kept on this device only. */
export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    experience: storedExperience(),
    /** Nearby stops served by one of these modes are included in the departures board by default. */
    nearbyModes: storedNearbyModes(),
    /** Stops the user added to the departures board of a From stop, by the From stop's id. */
    addedStops: storedAddedStops(),
  }),
  getters: {
    /** The experience in effect; "lively" until the user chooses. */
    effectiveExperience: (state): Experience => state.experience ?? 'lively',
  },
  actions: {
    setExperience(experience: Experience): void {
      this.experience = experience;
      writeDeviceValue(EXPERIENCE_KEY, experience);
    },
    setNearbyModes(modes: TransportMode[]): void {
      this.nearbyModes = TRANSPORT_MODES.filter((mode) => modes.includes(mode));
      writeDeviceValue(NEARBY_MODES_KEY, JSON.stringify(this.nearbyModes));
    },
    addStop(fromId: string, stop: Stop): void {
      const stops = (this.addedStops[fromId] ?? []).filter((other) => other.id !== stop.id);
      const { id, name, lat, lon, modes } = stop;
      this.addedStops = { ...this.addedStops, [fromId]: [...stops, { id, name, lat, lon, modes }] };
      writeDeviceValue(ADDED_STOPS_KEY, JSON.stringify(this.addedStops));
    },
    removeStop(fromId: string, stopId: string): void {
      const { [fromId]: stops = [], ...others } = this.addedStops;
      const remaining = stops.filter((stop) => stop.id !== stopId);
      this.addedStops = remaining.length ? { ...others, [fromId]: remaining } : others;
      writeDeviceValue(ADDED_STOPS_KEY, JSON.stringify(this.addedStops));
    },
  },
});
