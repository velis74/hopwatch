import { useI18n } from 'vue-i18n';

import type { Itinerary } from '../api/hopwatch-api';
import { LOCALE_TAGS, type SupportedLocale } from '../i18n';

export interface TimeFormatOptions {
  /** Also the short name of the day of the week. */
  weekday?: boolean;
}

/** Formats a time; `timeZone` is an IANA time zone, null or undefined when the data names none. */
export type TimeFormatter = (value: string | Date, timeZone?: string | null) => string;

const WALL_CLOCK = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/u;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tag: string, timeZone: string | undefined, options: TimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tag}|${timeZone ?? ''}|${options.weekday ? 'weekday' : ''}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, {
      ...(options.weekday ? { weekday: 'short' } : {}),
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
    // Without `timeZone` the formatter holds the device's zone, which can change while the app runs.
    if (timeZone) formatters.set(key, found);
  }
  return found;
}

function wallClock(tag: string, value: string, options: TimeFormatOptions): string {
  const parts = WALL_CLOCK.exec(value);
  if (!parts) return formatter(tag, undefined, options).format(new Date(value));
  const [year, month, day, hour, minute] = parts.slice(1).map(Number);
  return formatter(tag, 'UTC', options).format(new Date(Date.UTC(year, month - 1, day, hour, minute)));
}

/**
 * Hours and minutes of `value` in the language `tag`, as local time in `timeZone`. Without a known `timeZone`, an
 * ISO 8601 string shows the wall-clock time it is written in and a `Date` the device's time.
 */
export function formatTime(
  tag: string,
  value: string | Date,
  timeZone?: string | null,
  options: TimeFormatOptions = {},
): string {
  if (timeZone) {
    try {
      return formatter(tag, timeZone, options).format(typeof value === 'string' ? new Date(value) : value);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  return typeof value === 'string' ? wallClock(tag, value, options) : formatter(tag, undefined, options).format(value);
}

/** `formatTime` in the interface language, following a change of it. */
export function useTimeFormat(options: TimeFormatOptions = {}): TimeFormatter {
  const { locale } = useI18n();
  return (value, timeZone) => formatTime(LOCALE_TAGS[locale.value as SupportedLocale], value, timeZone, options);
}

/** Time zone of the start of an itinerary, in which its departure is local time. */
export function departureZone(itinerary: Itinerary): string | undefined {
  return itinerary.legs[0]?.from.time_zone;
}

/** Time zone of the destination of an itinerary, in which its arrival is local time. */
export function arrivalZone(itinerary: Itinerary): string | undefined {
  return itinerary.legs.at(-1)?.to.time_zone;
}
