import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { LOCALE_TAGS, type SupportedLocale } from '../i18n';

/** Formats an ISO 8601 time as hours and minutes in the interface language. */
export function useTimeFormat() {
  const { locale } = useI18n();
  const formatter = computed(
    () => new Intl.DateTimeFormat(LOCALE_TAGS[locale.value as SupportedLocale], { hour: '2-digit', minute: '2-digit' }),
  );
  return (value: string | Date): string => formatter.value.format(typeof value === 'string' ? new Date(value) : value);
}
