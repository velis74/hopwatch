import { useI18n } from 'vue-i18n';

import type { TransportMode } from '../api/hopwatch-api';
import { LOCALE_TAGS, type SupportedLocale } from '../i18n';

/** Names transport modes as one phrase in the interface language, e.g. "Train and Bus"; empty for no modes. */
export function useModeNames() {
  const { t, locale } = useI18n();
  return (modes: readonly TransportMode[]): string =>
    new Intl.ListFormat(LOCALE_TAGS[locale.value as SupportedLocale], { type: 'conjunction' }).format(
      modes.map((mode) => t(`departures.modes.${mode}`)),
    );
}
