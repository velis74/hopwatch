import { describe, expect, it } from 'vitest';

import i18n from '../i18n';
import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, mountApp } from '../test-utils';

import SettingsPage from './settings-page.vue';

function radio(value: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
}

/** Opens the language list and returns its options. */
async function openLanguages(): Promise<HTMLElement[]> {
  const field = document.querySelector<HTMLElement>('.v-select .v-field')!;
  field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  field.click();
  await flushPromises();
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

describe('settings-page', () => {
  it('shows the experience in effect, the language and that choices stay on the device', async () => {
    const { wrapper } = await mountApp(SettingsPage, { route: '/settings' });

    expect(wrapper.get('h1').text()).toBe('Settings');
    // Until the user chooses, the lively experience is in effect.
    expect(radio('lively').checked).toBe(true);
    const language = wrapper.get('.v-select');
    expect(language.text()).toContain('Language');
    const selection = language.get('.v-select__selection [lang]');
    expect(selection.text()).toBe('English');
    expect(selection.attributes('lang')).toBe('en-GB');
    expect(wrapper.text()).toContain('Saved on this device.');
  });

  it('applies and keeps a new experience', async () => {
    window.localStorage.setItem('hopwatch.experience', 'lively');
    await mountApp(SettingsPage, { route: '/settings' });

    radio('simple').click();
    await flushPromises();

    expect(usePreferencesStore().effectiveExperience).toBe('simple');
    expect(window.localStorage.getItem('hopwatch.experience')).toBe('simple');
    expect(radio('simple').checked).toBe(true);
  });

  it('lists each language in its own name and language, and switches the interface to the chosen one', async () => {
    const { wrapper } = await mountApp(SettingsPage, { route: '/settings' });

    const options = await openLanguages();
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'English',
      'Slovenščina',
      'Deutsch',
      'Hrvatski',
      'Српски (ћирилица)',
      'Srpski (latinica)',
    ]);
    expect(options.map((option) => option.querySelector('[lang]')?.getAttribute('lang'))).toEqual([
      'en-GB',
      'sl-SI',
      'de',
      'hr',
      'sr-Cyrl',
      'sr-Latn',
    ]);

    options[1].click();
    await flushPromises();

    expect(i18n.global.locale.value).toBe('sl');
    expect(wrapper.get('h1').text()).toBe('Nastavitve');
    expect(wrapper.text()).toContain('Shranjeno na tej napravi.');
    expect(wrapper.get('.v-select__selection [lang]').text()).toBe('Slovenščina');
    expect(document.documentElement.lang).toBe('sl-SI');
    expect(window.localStorage.getItem('hopwatch.locale')).toBe('sl');
  });

  it('switches to Serbian in Latin script and names the languages in themselves also there', async () => {
    const { wrapper } = await mountApp(SettingsPage, { route: '/settings' });

    const options = await openLanguages();
    options[5].click();
    await flushPromises();

    expect(i18n.global.locale.value).toBe('sr-Latn');
    expect(wrapper.get('h1').text()).toBe('Podešavanja');
    expect(document.documentElement.lang).toBe('sr-Latn');
    const reopened = await openLanguages();
    expect(reopened.map((option) => option.textContent?.trim())).toContain('Српски (ћирилица)');
  });

  it('includes no nearby stops by default and keeps the chosen modes on the device', async () => {
    const { wrapper } = await mountApp(SettingsPage, { route: '/settings' });

    const fieldset = wrapper.get('fieldset');
    expect(fieldset.get('legend').text()).toBe('Include nearby stops by default');
    const boxes = fieldset.findAll<HTMLInputElement>('input[type="checkbox"]');
    const labels = boxes.map((box) => document.querySelector(`label[for="${box.attributes('id')}"]`)?.textContent);
    expect(labels).toEqual(['Trains', 'Buses', 'Trams', 'Other']);
    expect(boxes.map((box) => box.element.checked)).toEqual([false, false, false, false]);

    await boxes[2].trigger('click');
    await boxes[0].trigger('click');
    await flushPromises();

    expect(usePreferencesStore().nearbyModes).toEqual(['rail', 'tram']);
    expect(window.localStorage.getItem('hopwatch.nearbyModes')).toBe('["rail","tram"]');

    await boxes[2].trigger('click');
    await flushPromises();

    expect(usePreferencesStore().nearbyModes).toEqual(['rail']);
    expect(boxes.map((box) => box.element.checked)).toEqual([true, false, false, false]);
  });
});
