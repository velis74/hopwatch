import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '../i18n';
import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, mockApi, mountApp } from '../test-utils';

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

const OPERATORS = [
  { id: '1123', name: 'Arriva d.o.o.', url: 'https://arriva.si/' },
  { id: '1119', name: 'Nomago d.o.o.', url: null },
  { id: '1161', name: 'SŽ - Potniški promet, d.o.o.', url: null },
];

/** The fieldset whose legend is `legend`. */
function fieldset(legend: string): HTMLFieldSetElement {
  return [...document.querySelectorAll('fieldset')].find(
    (candidate) => candidate.querySelector('legend')?.textContent?.trim() === legend,
  )!;
}

function labelOf(box: HTMLInputElement): string | undefined {
  return document.querySelector(`label[for="${box.id}"]`)?.textContent?.trim();
}

describe('settings-page', () => {
  beforeEach(() => {
    mockApi('get', '/operators', []);
  });

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

  it('lists the operators and keeps the favourites on the device', async () => {
    window.localStorage.setItem('hopwatch.favouriteOperators', '["1161"]');
    mockApi('get', '/operators', OPERATORS);
    await mountApp(SettingsPage, { route: '/settings' });

    const favourites = fieldset('Favourite operators');
    expect(favourites.getAttribute('aria-describedby')).toBe('favourite-operators-hint');
    const boxes = [...favourites.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map(labelOf)).toEqual(['Arriva d.o.o.', 'Nomago d.o.o.', 'SŽ - Potniški promet, d.o.o.']);
    expect(boxes.map((box) => box.checked)).toEqual([false, false, true]);

    boxes[0].click();
    boxes[2].click();
    await flushPromises();

    expect(usePreferencesStore().favouriteOperators).toEqual(['1123']);
    expect(window.localStorage.getItem('hopwatch.favouriteOperators')).toBe('["1123"]');
  });

  it('says so while the operators load, when there are none and when they are not available', async () => {
    const { wrapper } = await mountApp(SettingsPage, { route: '/settings' });
    expect(fieldset('Favourite operators').textContent).toContain('No operators are known yet.');
    wrapper.unmount();

    mockApi('get', '/operators', { detail: 'unavailable' }, { status: 502 });
    await mountApp(SettingsPage, { route: '/settings' });
    expect(fieldset('Favourite operators').textContent).toContain('Operators are not available right now.');
  });

  it('lists a stored favourite the operators do not include, so it can be removed', async () => {
    window.localStorage.setItem('hopwatch.favouriteOperators', '["1161", "9"]');
    window.localStorage.setItem('hopwatch.favouriteOperatorNames', '{"9": "Avtobusni prevozi Čuk"}');
    mockApi('get', '/operators', OPERATORS);
    await mountApp(SettingsPage, { route: '/settings', locale: 'sl' });

    const boxes = () => [
      ...fieldset('Priljubljeni prevozniki').querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(boxes().map(labelOf)).toEqual([
      'Arriva d.o.o.',
      'Avtobusni prevozi Čuk',
      'Nomago d.o.o.',
      'SŽ - Potniški promet, d.o.o.',
    ]);
    expect(boxes()[1].checked).toBe(true);

    boxes()[1].click();
    await flushPromises();

    expect(usePreferencesStore().favouriteOperators).toEqual(['1161']);
    expect(boxes().map(labelOf)).toContain('Avtobusni prevozi Čuk');
    expect(boxes()[1].checked).toBe(false);
  });
});
