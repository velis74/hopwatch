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
    expect(options.map((option) => option.textContent?.trim())).toEqual(['English', 'Slovenščina']);
    expect(options.map((option) => option.querySelector('[lang]')?.getAttribute('lang'))).toEqual(['en-GB', 'sl-SI']);

    options[1].click();
    await flushPromises();

    expect(i18n.global.locale.value).toBe('sl');
    expect(wrapper.get('h1').text()).toBe('Nastavitve');
    expect(wrapper.text()).toContain('Shranjeno na tej napravi.');
    expect(wrapper.get('.v-select__selection [lang]').text()).toBe('Slovenščina');
    expect(document.documentElement.lang).toBe('sl-SI');
    expect(window.localStorage.getItem('hopwatch.locale')).toBe('sl');
  });
});
