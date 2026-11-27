import { createI18n } from 'vue-i18n';

import { readDeviceValue, writeDeviceValue } from './device-storage';
import en from './locales/en.json';
import sl from './locales/sl.json';

/** Locales with a message file; each file has the same keys as `en.json`. */
export const SUPPORTED_LOCALES = ['en', 'sl'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** BCP 47 tag of each locale, for `<html lang>` and date formatting. */
export const LOCALE_TAGS: Record<SupportedLocale, string> = { en: 'en-GB', sl: 'sl-SI' };

const LOCALE_KEY = 'hopwatch.locale';

function isSupported(locale: string | null | undefined): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale ?? '');
}

function initialLocale(): SupportedLocale {
  const stored = readDeviceValue(LOCALE_KEY);
  if (isSupported(stored)) return stored;
  const preferred = navigator.languages.map((language) => language.split('-')[0]);
  return preferred.find(isSupported) ?? 'en';
}

type MessageSchema = typeof en;

const i18n = createI18n<[MessageSchema], SupportedLocale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, sl },
});

function applyDocumentLanguage(locale: SupportedLocale): void {
  document.documentElement.lang = LOCALE_TAGS[locale];
}

applyDocumentLanguage(i18n.global.locale.value);

/** Switches the interface language and keeps the choice on this device. */
export function setLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale;
  writeDeviceValue(LOCALE_KEY, locale);
  applyDocumentLanguage(locale);
}

export default i18n;
