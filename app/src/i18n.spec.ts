import { afterEach, describe, expect, it, vi } from 'vitest';

import en from './locales/en.json';
import sl from './locales/sl.json';

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

  it('offers English and Slovenian with their language tags', async () => {
    const { SUPPORTED_LOCALES, LOCALE_TAGS } = await load();

    expect(SUPPORTED_LOCALES).toEqual(['en', 'sl']);
    expect(LOCALE_TAGS).toEqual({ en: 'en-GB', sl: 'sl-SI' });
  });

  it('translates every English message into Slovenian', () => {
    expect(keys(sl).sort()).toEqual(keys(en).sort());
  });

  it('starts in the first browser language it supports', async () => {
    const { default: i18n } = await load(['de-AT', 'sl-SI', 'en-GB']);

    expect(i18n.global.locale.value).toBe('sl');
    expect(document.documentElement.lang).toBe('sl-SI');
    expect(i18n.global.t('app.settings')).toBe(sl.app.settings);
  });

  it('starts in English when the browser has no supported language', async () => {
    const { default: i18n } = await load(['de-AT', 'hr']);

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
});
