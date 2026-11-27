<template>
  <v-dialog :model-value="open" persistent max-width="520" aria-labelledby="experience-dialog-title">
    <v-card ref="card" @keydown.tab="keepFocusInside">
      <v-card-title id="experience-dialog-title" tag="h2" class="text-h5 text-wrap">
        {{ t('experience.dialogTitle') }}
      </v-card-title>
      <v-card-text>
        <p class="mb-4">{{ t('experience.dialogIntro') }}</p>
        <experience-choice v-model="choice" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" variant="flat" :disabled="!choice" @click="confirm">
          {{ t('experience.continue') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { type ComponentPublicInstance, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { type Experience, usePreferencesStore } from '../stores/preferences';

import ExperienceChoice from './experience-choice.vue';

const { t } = useI18n();
const preferences = usePreferencesStore();

const open = computed(() => preferences.experience === null);
const choice = ref<Experience | null>(null);

const card = ref<ComponentPublicInstance | null>(null);
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Tab stops inside the dialog, with a radio group counted once (its checked radio, else its first), as the browser
 * counts it. Vuetify's focus trap counts every radio, so focus can leave the dialog from a radio group.
 */
function tabStops(root: HTMLElement): HTMLElement[] {
  const candidates = root.querySelectorAll<HTMLElement>(TABBABLE);
  const seenGroups = new Set<string>();
  return [...candidates].filter((element) => {
    if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || !element.name) return true;
    if (seenGroups.has(element.name)) return false;
    const group = root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]`);
    const stop = [...group].find((radio) => radio.checked) ?? group[0];
    if (element !== stop) return false;
    seenGroups.add(element.name);
    return true;
  });
}

/** Wraps Tab and Shift+Tab at the dialog's first and last tab stop. */
function keepFocusInside(event: KeyboardEvent) {
  const root = card.value?.$el as HTMLElement | undefined;
  if (!root) return;
  const stops = tabStops(root);
  if (stops.length === 0) return;
  const index = stops.findIndex((element) => element === document.activeElement);
  if (event.shiftKey && index <= 0) {
    event.preventDefault();
    stops[stops.length - 1].focus();
  } else if (!event.shiftKey && (index === -1 || index === stops.length - 1)) {
    event.preventDefault();
    stops[0].focus();
  }
}

function confirm() {
  if (choice.value) preferences.setExperience(choice.value);
}
</script>
