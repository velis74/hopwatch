import { useI18n } from 'vue-i18n';

import type { DelaySource, Leg, TransportMode } from '../api/hopwatch-api';

export const MODE_ICONS: Record<Leg['mode'], string> = {
  rail: 'mdi-train',
  bus: 'mdi-bus',
  tram: 'mdi-tram',
  other: 'mdi-transit-connection-variant',
  walk: 'mdi-walk',
};

/** Texts shared by the ride and journey details. */
export function useRideText() {
  const { t } = useI18n();

  function duration(minutes: number): string {
    if (minutes < 60) return t('journey.minutes', { minutes });
    return t('journey.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
  }

  /** The delay with its source, e.g. "+3 min (estimate)". */
  function delayText(minutes: number, source: DelaySource | null = null): string {
    let text: string;
    if (minutes > 0) text = t('departures.delay', { minutes });
    else if (minutes < 0) text = t('departures.early', { minutes: -minutes });
    else text = t('departures.onTime');
    return source ? `${text} ${t('departures.delaySource', { source: t(`departures.sources.${source}`) })}` : text;
  }

  /** E.g. "Train IC 502 to Koper". */
  function rideName(mode: TransportMode, line: string | null, headsign: string | null): string {
    const params = { mode: t(`departures.modes.${mode}`), line: line ?? '', headsign };
    return (headsign ? t('journey.ride', params) : t('journey.rideNoHeadsign', params)).trim();
  }

  /** Whole minutes from `start` to `end` (ISO 8601). */
  function minutesBetween(start: string, end: string): number {
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  }

  return { duration, delayText, rideName, minutesBetween };
}
