import { defineStore } from 'pinia';

import { TRANSPORT_MODES, type TransportMode } from '../api/hopwatch-api';
import { readDeviceValue, writeDeviceValue } from '../device-storage';

export const EXPERIENCES = ['simple', 'lively'] as const;
export type Experience = (typeof EXPERIENCES)[number];

const EXPERIENCE_KEY = 'hopwatch.experience';
const NEARBY_MODES_KEY = 'hopwatch.nearbyModes';

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

/** Preferences kept on this device only. */
export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    experience: storedExperience(),
    /** Nearby stops served by one of these modes are included in the departures board by default. */
    nearbyModes: storedNearbyModes(),
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
  },
});
