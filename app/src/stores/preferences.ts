import { defineStore } from 'pinia';

import { readDeviceValue, writeDeviceValue } from '../device-storage';

export const EXPERIENCES = ['simple', 'lively'] as const;
export type Experience = (typeof EXPERIENCES)[number];

const EXPERIENCE_KEY = 'hopwatch.experience';

function storedExperience(): Experience | null {
  const value = readDeviceValue(EXPERIENCE_KEY);
  return (EXPERIENCES as readonly string[]).includes(value ?? '') ? (value as Experience) : null;
}

/** Presentation preferences kept on this device only. */
export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    experience: storedExperience(),
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
  },
});
