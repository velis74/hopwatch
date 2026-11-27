import { createI18n } from 'vue-i18n';
import {
  de as vuetifyDe,
  en as vuetifyEn,
  hr as vuetifyHr,
  sl as vuetifySl,
  srCyrl as vuetifySrCyrl,
  srLatn as vuetifySrLatn,
} from 'vuetify/locale';

import { readDeviceValue, writeDeviceValue } from './device-storage';
import de from './locales/de.json';
import en from './locales/en.json';
import hr from './locales/hr.json';
import sl from './locales/sl.json';
import srCyrl from './locales/sr-Cyrl.json';
import { serbianLatinMessages } from './serbian-latin';

/**
 * Interface languages. Each has a message file with the same keys as `en.json`, except `sr-Latn`, whose messages are
 * `sr-Cyrl.json` transliterated to Latin script.
 */
export const SUPPORTED_LOCALES = ['en', 'sl', 'de', 'hr', 'sr-Cyrl', 'sr-Latn'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** BCP 47 tag of each locale, for `<html lang>` and date formatting. */
export const LOCALE_TAGS: Record<SupportedLocale, string> = {
  en: 'en-GB',
  sl: 'sl-SI',
  de: 'de',
  hr: 'hr',
  'sr-Cyrl': 'sr-Cyrl',
  'sr-Latn': 'sr-Latn',
};

/** The name of each language in that language. */
export const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  sl: 'Slovenščina',
  de: 'Deutsch',
  hr: 'Hrvatski',
  'sr-Cyrl': 'Српски (ћирилица)',
  'sr-Latn': 'Srpski (latinica)',
};

/** Vuetify's own strings in each locale. */
export const VUETIFY_MESSAGES = {
  en: vuetifyEn,
  sl: vuetifySl,
  de: vuetifyDe,
  hr: vuetifyHr,
  'sr-Cyrl': vuetifySrCyrl,
  'sr-Latn': vuetifySrLatn,
} satisfies Record<SupportedLocale, unknown>;

const LOCALE_KEY = 'hopwatch.locale';

function isSupported(locale: string | null | undefined): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale ?? '');
}

/** The locale of a browser language tag, by its language; Serbian is in Latin script only when the tag says so. */
export function localeOfLanguageTag(tag: string): SupportedLocale | undefined {
  const [language, ...subtags] = tag.toLowerCase().split(/[-_]/);
  if (language === 'sr') return subtags.includes('latn') ? 'sr-Latn' : 'sr-Cyrl';
  return isSupported(language) ? language : undefined;
}

function initialLocale(): SupportedLocale {
  const stored = readDeviceValue(LOCALE_KEY);
  if (isSupported(stored)) return stored;
  for (const language of navigator.languages) {
    const locale = localeOfLanguageTag(language);
    if (locale) return locale;
  }
  return 'en';
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

/**
 * Croatian and Serbian plural forms of a message with four choices: zero, one (1, 21, 101 …, not 11), few (2–4,
 * 22–24 …, not 12–14) and other. A message with fewer choices has no zero form.
 */
export function croatianSerbianPlural(choice: number, choicesLength: number): number {
  const n = Math.abs(choice) % 100;
  const last = n % 10;
  const form = last === 1 && n !== 11 ? 1 : last >= 2 && last <= 4 && (n < 12 || n > 14) ? 2 : 3;
  if (choicesLength === 4) return choice === 0 ? 0 : form;
  return Math.min(form - 1, choicesLength - 1);
}

const i18n = createI18n<[MessageSchema], SupportedLocale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, sl, de, hr, 'sr-Cyrl': srCyrl, 'sr-Latn': serbianLatinMessages(srCyrl) },
  pluralRules: {
    sl: slovenianPlural,
    hr: croatianSerbianPlural,
    'sr-Cyrl': croatianSerbianPlural,
    'sr-Latn': croatianSerbianPlural,
  },
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
