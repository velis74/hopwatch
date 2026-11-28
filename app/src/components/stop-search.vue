<template>
  <div ref="root" class="stop-search">
    <!-- aria-description: the input announces the chosen stop, which df-select shows only as a chip. -->
    <df-select
      :model-value="model?.id ?? null"
      :label="label"
      :hint="t('departures.findStopHint')"
      variant="filled"
      :allow-null="false"
      :fetch-choices="fetchChoices"
      :fetch-debounce="SEARCH_DEBOUNCE_MS"
      :min-query-length="MIN_QUERY_LENGTH"
      :min-query-text="t('departures.findStopHint')"
      :no-data-text="t('departures.noStopsFound')"
      :passthrough-attrs="{ 'no-filter': true, 'prepend-inner-icon': 'mdi-magnify', 'aria-description': model?.name }"
      @update:model-value="choose"
    >
      <template v-if="clearable && model" #append-inner>
        <!-- A button of its own: Vuetify's clear icon is not in the tab order. -->
        <button
          type="button"
          class="stop-search-clear"
          :aria-label="t('departures.clearStop', { field: label })"
          @click.stop="clear"
          @mousedown.stop
        >
          <v-icon icon="mdi-close-circle" aria-hidden="true" />
        </button>
      </template>
    </df-select>
  </div>
</template>

<script setup lang="ts">
import { lookupChoices, type LookupChoicesParams } from '@dynamicforms/fastapi-viewsets';
import { DfSelect, type RenderContentNonCallable } from '@dynamicforms/vuetify-inputs';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { searchStops, type Stop } from '../api/hopwatch-api';
import { useModeNames } from '../composables/use-mode-names';

const props = defineProps<{ label: string; autofocus?: boolean; clearable?: boolean }>();
const model = defineModel<Stop | null>({ default: null });

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

const { t } = useI18n();
const modeNames = useModeNames();

const root = ref<HTMLElement | null>(null);
/** The stops offered so far, by id: the select's value is the id. */
const known = new Map<string, Stop>();

/** Stops named like `q`; for `ids`, the chosen stop. A failed search finds no stops. */
async function findStops({ q, ids }: LookupChoicesParams): Promise<Stop[]> {
  if (ids) return model.value && ids.includes(model.value.id) ? [model.value] : [];
  const text = (q ?? '').trim();
  if (text.length < MIN_QUERY_LENGTH) return [];
  try {
    return await searchStops(text);
  } catch {
    return [];
  }
}

/** The stop name, and its modes on a second line; the hidden comma separates them in the option's name. */
function stopChoiceText(stop: Stop): RenderContentNonCallable {
  const modes = modeNames(stop.modes);
  if (!modes) return { componentName: 'div', children: stop.name };
  return {
    componentName: 'div',
    children: [
      {
        componentName: 'div',
        children: [
          stop.name,
          { componentName: 'span', componentProps: { class: 'stop-search-modes d-sr-only' }, children: ', ' },
        ],
      },
      {
        componentName: 'div',
        componentProps: { class: 'stop-search-modes text-body-2 text-medium-emphasis' },
        children: modes,
      },
    ],
  };
}

const fetchChoices = lookupChoices(findStops, (stop) => {
  known.set(stop.id, stop);
  return { id: stop.id, text: () => stopChoiceText(stop) };
});

function choose(id: string | null) {
  model.value = id == null ? null : (known.get(id) ?? null);
}

function clear() {
  model.value = null;
}

onMounted(() => {
  if (props.autofocus) root.value?.querySelector('input')?.focus();
});
</script>

<style scoped>
.stop-search-clear {
  display: inline-flex;
  min-width: 24px;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.stop-search-clear:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
}

/* The chosen stop's chip shows its name only. */
.stop-search :deep(.v-chip .stop-search-modes) {
  display: none;
}
</style>
