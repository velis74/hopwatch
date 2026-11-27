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

/**
 * Slovenian plural forms of a message with five choices: zero, one (1, 101 …), two (2, 102 …), few (3, 4, 103 …)
 * and other. A message with fewer choices has no zero form.
 */
export function slovenianPlural(choice: number, choicesLength: number): number {
  const n = Math.abs(choice) % 100;
  const form = n === 1 ? 1 : n === 2 ? 2 : n === 3 || n === 4 ? 3 : 4;
  if (choicesLength === 5) return choice === 0 ? 0 : form;
  return Math.min(form - 1, choicesLength - 1);
}

const i18n = createI18n<[MessageSchema], SupportedLocale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, sl },
  pluralRules: { sl: slovenianPlural },
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
