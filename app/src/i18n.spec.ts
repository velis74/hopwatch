import { afterEach, describe, expect, it, vi } from 'vitest';

import de from './locales/de.json';
import en from './locales/en.json';
import hr from './locales/hr.json';
import sl from './locales/sl.json';
import srCyrl from './locales/sr-Cyrl.json';

/** The i18n module as a newly opened app loads it, with the browser's `languages`. */
async function load(languages: string[] = ['en-GB']) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.resetModules();
  return import('./i18n');
}

function keys(messages: object, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe('i18n', () => {
  afterEach(() => vi.resetModules());

  it('offers English, Slovenian, German, Croatian and Serbian in both scripts with their language tags', async () => {
    const { SUPPORTED_LOCALES, LOCALE_TAGS } = await load();

    expect(SUPPORTED_LOCALES).toEqual(['en', 'sl', 'de', 'hr', 'sr-Cyrl', 'sr-Latn']);
    expect(LOCALE_TAGS).toEqual({
      en: 'en-GB',
      sl: 'sl-SI',
      de: 'de',
      hr: 'hr',
      'sr-Cyrl': 'sr-Cyrl',
      'sr-Latn': 'sr-Latn',
    });
  });

  it.each([
    ['sl', sl],
    ['de', de],
    ['hr', hr],
    ['sr-Cyrl', srCyrl],
  ])('translates every English message into %s', (_, messages) => {
    expect(keys(messages).sort()).toEqual(keys(en).sort());
  });

  it('shows Serbian in Latin script as the Cyrillic messages transliterated', async () => {
    const { default: i18n, setLocale } = await load();

    setLocale('sr-Latn');

    expect(i18n.global.t('app.settings')).toBe('Podešavanja');
    expect(i18n.global.t('departures.listLabel', { stop: 'Нови Сад' })).toBe('Polasci sa stanice Нови Сад');
    expect(document.documentElement.lang).toBe('sr-Latn');
  });

  it('starts in the first browser language it supports', async () => {
    const { default: i18n } = await load(['it-IT', 'sl-SI', 'en-GB']);

    expect(i18n.global.locale.value).toBe('sl');
    expect(document.documentElement.lang).toBe('sl-SI');
    expect(i18n.global.t('app.settings')).toBe(sl.app.settings);
  });

  it.each([
    [['de-AT'], 'de'],
    [['hr-HR'], 'hr'],
    [['sr'], 'sr-Cyrl'],
    [['sr-RS'], 'sr-Cyrl'],
    [['sr-Cyrl-RS'], 'sr-Cyrl'],
    [['sr-Latn'], 'sr-Latn'],
    [['sr-Latn-RS'], 'sr-Latn'],
    [['en-US'], 'en'],
  ])('starts a browser with the languages %j in %s', async (languages, locale) => {
    const { default: i18n } = await load(languages);

    expect(i18n.global.locale.value).toBe(locale);
  });

  it('starts in English when the browser has no supported language', async () => {
    const { default: i18n } = await load(['it-IT', 'fr']);

    expect(i18n.global.locale.value).toBe('en');
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('starts in the language chosen earlier on the device, over the browser languages', async () => {
    window.localStorage.setItem('hopwatch.locale', 'sl');

    const { default: i18n } = await load(['en-GB']);

    expect(i18n.global.locale.value).toBe('sl');
  });

  it('ignores an unknown stored language', async () => {
    window.localStorage.setItem('hopwatch.locale', 'xx');

    const { default: i18n } = await load(['en-US']);

    expect(i18n.global.locale.value).toBe('en');
  });

  it('switches the language, the page language and keeps the choice for the next start', async () => {
    const { default: i18n, setLocale } = await load(['en-GB']);

    setLocale('sl');

    expect(i18n.global.locale.value).toBe('sl');
    expect(document.documentElement.lang).toBe('sl-SI');
    expect(i18n.global.t('app.logout')).toBe(sl.app.logout);

    const next = await load(['en-GB']);
    expect(next.default.global.locale.value).toBe('sl');
  });

  it.each([
    [0, 'Brez prestopov'],
    [1, '1 prestop'],
    [2, '2 prestopa'],
    [3, '3 prestopi'],
    [4, '4 prestopi'],
    [5, '5 prestopov'],
    [101, '101 prestop'],
    [102, '102 prestopa'],
    [111, '111 prestopov'],
  ])('uses the Slovenian plural form for %i', async (count, text) => {
    const { default: i18n } = await load(['sl-SI']);

    expect(i18n.global.t('journey.transfers', { count }, count)).toBe(text);
  });

  it.each([
    [1, 2, 0],
    [2, 2, 1],
    [5, 2, 1],
    [1, 4, 0],
    [3, 4, 2],
    [7, 4, 3],
  ])('picks a Slovenian form among fewer choices: %i of %i is form %i', async (choice, length, form) => {
    const { slovenianPlural } = await load();

    expect(slovenianPlural(choice, length)).toBe(form);
  });

  it.each([
    ['hr', 0, 'Bez presjedanja'],
    ['hr', 1, '1 presjedanje'],
    ['hr', 3, '3 presjedanja'],
    ['hr', 11, '11 presjedanja'],
    ['hr', 21, '21 presjedanje'],
    ['sr-Cyrl', 1, '1 преседање'],
    ['sr-Cyrl', 5, '5 преседања'],
    ['sr-Latn', 0, 'Bez presedanja'],
    ['sr-Latn', 101, '101 presedanje'],
  ] as const)('uses the %s plural form for %i', async (locale, count, text) => {
    const { default: i18n, setLocale } = await load();
    setLocale(locale);

    expect(i18n.global.t('journey.transfers', { count }, count)).toBe(text);
  });

  it.each([
    [0, 4, 0],
    [1, 4, 1],
    [2, 4, 2],
    [4, 4, 2],
    [5, 4, 3],
    [11, 4, 3],
    [12, 4, 3],
    [14, 4, 3],
    [21, 4, 1],
    [22, 4, 2],
    [111, 4, 3],
    [1, 3, 0],
    [3, 3, 1],
    [7, 3, 2],
    [1, 2, 0],
    [7, 2, 1],
  ])('picks a Croatian and Serbian form: %i of %i is form %i', async (choice, length, form) => {
    const { croatianSerbianPlural } = await load();

    expect(croatianSerbianPlural(choice, length)).toBe(form);
  });
});
