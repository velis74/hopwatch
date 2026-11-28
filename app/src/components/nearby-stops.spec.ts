import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import type { NearbyStop, Stop } from '../api/hopwatch-api';
import { usePreferencesStore } from '../stores/preferences';
import { flushPromises, HttpResponse, mockApi, mountApp } from '../test-utils';

import NearbyStops from './nearby-stops.vue';

const LJUBLJANA: Stop = { id: 'si:1', name: 'Ljubljana', lat: 46.0584, lon: 14.5127, modes: ['rail'] };
const KOPER: Stop = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: ['rail'] };
const KRANJ: Stop = { id: 'si:7', name: 'Kranj', lat: 46.2389, lon: 14.3556, modes: [] };

const AROUND: NearbyStop[] = [
  { ...LJUBLJANA, distance_m: 21 },
  { id: 'si:4', name: 'Ljubljana AP', lat: 46.0579, lon: 14.5147, modes: ['bus', 'other'], distance_m: 162 },
  { id: 'si:3', name: 'Kolodvor', lat: 46.0575, lon: 14.5113, modes: ['bus'], distance_m: 144.4 },
  { id: 'si:5', name: 'Navje', lat: 46.0597, lon: 14.5094, modes: [], distance_m: 292 },
];

const ADDED_STOPS_KEY = 'hopwatch.addedStops';
const DEBOUNCE_MS = 250;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function render(stop = LJUBLJANA, modelValue: string[] = []) {
  const { wrapper } = await mountApp(NearbyStops, {
    props: { stop },
    models: { modelValue },
  });
  await flushPromises();
  return wrapper;
}

type Wrapper = Awaited<ReturnType<typeof render>>;

function checkboxes(wrapper: Wrapper) {
  return wrapper.findAll('[role="checkbox"]').map((box) => ({
    box,
    label: box.attributes('aria-label'),
    checked: box.attributes('aria-checked') === 'true',
    disabled: box.attributes('aria-disabled') === 'true',
  }));
}

function checkbox(wrapper: Wrapper, name: string) {
  return checkboxes(wrapper).find((option) => option.label?.startsWith(`${name},`) || option.label === name)!;
}

function addField(wrapper: Wrapper) {
  return wrapper.get<HTMLInputElement>('.nearby-add input');
}

/** Types into "Add a stop" and waits until the search has been answered. */
async function typeAdd(wrapper: Wrapper, text: string) {
  const input = addField(wrapper);
  await input.trigger('focus');
  await input.setValue(text);
  await wait(DEBOUNCE_MS + 30);
  await flushPromises();
}

function addOptions(): HTMLElement[] {
  return [...document.body.querySelectorAll<HTMLElement>('.v-overlay-container .v-list-item')];
}

/** The accessible names of the "Add a stop" options. */
function addOptionNames(): string[] {
  return addOptions().map((item) => item.getAttribute('aria-label') ?? (item.textContent ?? '').trim());
}

/** Searches "Add a stop" for `text` and picks the option starting with `name`. */
async function addStop(wrapper: Wrapper, text: string, name: string) {
  await typeAdd(wrapper, text);
  const index = addOptionNames().findIndex((option) => option.startsWith(name));
  expect(index, `option ${name}`).not.toBe(-1);
  addOptions()[index].click();
  await flushPromises();
}

function stored(): Record<string, Stop[]> {
  return JSON.parse(window.localStorage.getItem(ADDED_STOPS_KEY) ?? '{}');
}

describe('NearbyStops', () => {
  it('lists the other stops within 300 m by distance with their modes and distance, all unchecked', async () => {
    const requests = mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
      lat: '46.0584',
      lon: '14.5127',
      radius_m: '300',
    });
    expect(wrapper.get('fieldset legend').text()).toBe('Nearby stops');
    const options = checkboxes(wrapper);
    expect(options.map((option) => option.label)).toEqual([
      'Kolodvor, Bus, 144 m',
      'Ljubljana AP, Bus and Service, 162 m',
      'Navje, 292 m',
    ]);
    expect(options.map((option) => option.checked)).toEqual([false, false, false]);
    expect(options.map((option) => option.box.attributes('tabindex'))).toEqual(['0', '0', '0']);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('shows each stop as a chip with mode icons, name and distance; screen readers skip the icons', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    const chip = checkbox(wrapper, 'Ljubljana AP').box;
    expect(chip.findAll(':scope > span').map((part) => part.text())).toEqual(['Ljubljana AP', '162 m']);
    const icons = chip.findAll('.v-icon');
    expect(icons.map((icon) => icon.classes().find((name) => name.startsWith('mdi-')))).toEqual([
      'mdi-bus',
      'mdi-transit-connection-variant',
    ]);
    expect(icons.every((icon) => icon.attributes('aria-hidden') === 'true')).toBe(true);
  });

  it('marks a checked chip with a check mark and a filled style', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render(LJUBLJANA, ['si:3']);

    const chips = wrapper.findAll('.nearby-chip');
    expect(chips[0].classes()).toContain('nearby-chip--checked');
    expect(chips[0].find('.mdi-check').exists()).toBe(true);
    expect(chips[1].classes()).not.toContain('nearby-chip--checked');
    expect(chips[1].find('.mdi-check').exists()).toBe(false);
  });

  it('checks the stops served by a mode the user includes by default', async () => {
    setActivePinia(createPinia());
    usePreferencesStore().setNearbyModes(['other']);
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    expect(wrapper.emitted('update:modelValue')).toEqual([[['si:4']]]);
    expect(checkboxes(wrapper).map((option) => option.checked)).toEqual([false, true, false]);
  });

  it('checks and unchecks a stop', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    await checkboxes(wrapper)[2].box.trigger('click');
    await checkboxes(wrapper)[0].box.trigger('click');
    expect(wrapper.props('modelValue')).toEqual(['si:5', 'si:3']);

    await checkboxes(wrapper)[2].box.trigger('click');
    expect(wrapper.props('modelValue')).toEqual(['si:3']);
  });

  it('toggles a stop with Space and Enter', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    await checkboxes(wrapper)[0].box.trigger('keydown', { key: ' ' });
    expect(wrapper.props('modelValue')).toEqual(['si:3']);
    expect(checkboxes(wrapper)[0].checked).toBe(true);

    await checkboxes(wrapper)[0].box.trigger('keydown', { key: 'Enter' });
    expect(wrapper.props('modelValue')).toEqual([]);

    // A held key toggles once; other keys do nothing.
    await checkboxes(wrapper)[1].box.trigger('keydown', { key: ' ' });
    await checkboxes(wrapper)[1].box.trigger('keydown', { key: ' ', repeat: true });
    await checkboxes(wrapper)[1].box.trigger('keydown', { key: 'a' });
    expect(wrapper.props('modelValue')).toEqual(['si:4']);
  });

  it('says so when no other stop is near', async () => {
    mockApi('get', '/stops/nearby', [{ ...LJUBLJANA, distance_m: 0 }]);
    const wrapper = await render();

    expect(wrapper.get('fieldset').text()).toContain('No other stops within 300 m.');
    expect(checkboxes(wrapper)).toHaveLength(0);
  });

  it('leaves the fieldset out when the nearby stops are not available', async () => {
    mockApi('get', '/stops/nearby', () => HttpResponse.error());
    const wrapper = await render();

    expect(wrapper.find('fieldset').exists()).toBe(false);
  });

  it('loads the stops around another stop and shows only the latest answer', async () => {
    let answerFirst: () => void = () => undefined;
    mockApi('get', '/stops/nearby', async ({ request }: { request: Request }) => {
      if (new URL(request.url).searchParams.get('lat') === '46.0584') {
        await new Promise<void>((resolve) => (answerFirst = resolve));
        return HttpResponse.json(AROUND);
      }
      return HttpResponse.json([{ ...KOPER, id: 'si:9', name: 'Koper AP', modes: ['bus'], distance_m: 90 }]);
    });
    const wrapper = await render();

    await wrapper.setProps({ stop: KOPER });
    await flushPromises();
    answerFirst();
    await flushPromises();

    expect(checkboxes(wrapper).map((option) => option.label)).toEqual(['Koper AP, Bus, 90 m']);
  });

  it('adds a stop found by "Add a stop" after the nearby stops, checked, with a remove button', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const searches = mockApi('get', '/stops', [LJUBLJANA, { ...AROUND[2] }, KOPER, KRANJ]);
    const wrapper = await render();

    expect(wrapper.get('.nearby-add label').text()).toBe('Add a stop');
    await typeAdd(wrapper, ' Ko ');
    expect(searches.map((request) => request.url.searchParams.get('q'))).toEqual(['Ko']);
    // From and the stops shown are not offered.
    expect(addOptionNames()).toEqual(['Koper, Train', 'Kranj']);

    addOptions()[0].click();
    await flushPromises();

    expect(checkboxes(wrapper).map((option) => option.label)).toEqual([
      'Kolodvor, Bus, 144 m',
      'Ljubljana AP, Bus and Service, 162 m',
      'Navje, 292 m',
      'Koper, Train',
    ]);
    expect(checkbox(wrapper, 'Koper').checked).toBe(true);
    expect(wrapper.props('modelValue')).toEqual(['si:2']);
    expect(wrapper.find('button[aria-label="Remove Koper"]').exists()).toBe(true);
    expect(wrapper.findAll('.nearby-chip__remove')).toHaveLength(1);
    expect(wrapper.get('[role="status"]').text()).toBe('Koper added and checked.');
    expect(stored()).toEqual({ 'si:1': [KOPER] });
  });

  it('shows an "Add a stop" option with the stop name and its modes on a second line', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    mockApi('get', '/stops', [KOPER]);
    const wrapper = await render();

    await typeAdd(wrapper, 'Ko');

    const lines = addOptions()[0].querySelectorAll('.nearby-add-choice > div');
    expect([...lines].map((line) => line.textContent)).toEqual(['Koper, ', 'Train']);
    expect(lines[0].querySelector('.d-sr-only')?.textContent).toBe(', ');
  });

  it('names an added stop without modes by its name only', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    mockApi('get', '/stops', [KRANJ]);
    const wrapper = await render();

    await addStop(wrapper, 'Kr', 'Kranj');

    expect(checkboxes(wrapper).at(-1)?.label).toBe('Kranj');
  });

  it('does not search fewer than two letters', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const searches = mockApi('get', '/stops', [KOPER]);
    const wrapper = await render();

    await typeAdd(wrapper, 'K');

    expect(searches).toHaveLength(0);
    expect(addOptions().map((item) => (item.textContent ?? '').trim())).toEqual([
      'Type at least two letters of the stop name.',
    ]);
  });

  it('does not search one letter padded with spaces', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    const searches = mockApi('get', '/stops', [KOPER]);
    const wrapper = await render();

    await typeAdd(wrapper, ' K');

    expect(searches).toHaveLength(0);
    expect(addOptionNames().filter((name) => name.startsWith('Koper'))).toEqual([]);
  });

  it('names the progress of a search in the interface language', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    mockApi('get', '/stops', () => new Promise(() => undefined));
    const { wrapper } = await mountApp(NearbyStops, {
      props: { stop: LJUBLJANA },
      models: { modelValue: [] },
      locale: 'sl',
    });

    await typeAdd(wrapper, 'Ko');

    expect(wrapper.find('.nearby-add [aria-label="Nalaganje"]').exists()).toBe(true);
  });

  it('says so when no stop is found', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    mockApi('get', '/stops', []);
    const wrapper = await render();

    await typeAdd(wrapper, 'Xy');

    expect(addOptions().map((item) => (item.textContent ?? '').trim())).toEqual(['No stops found.']);
  });

  it('removes an added stop: unchecked, gone from the chips and from the device', async () => {
    window.localStorage.setItem(ADDED_STOPS_KEY, JSON.stringify({ 'si:1': [KOPER, KRANJ] }));
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    await wrapper.get('button[aria-label="Remove Koper"]').trigger('click');
    await flushPromises();

    expect(checkboxes(wrapper).map((option) => option.label)).not.toContain('Koper, Train');
    expect(wrapper.props('modelValue')).toEqual(['si:7']);
    expect(stored()).toEqual({ 'si:1': [KRANJ] });
    expect(document.activeElement).toBe(addField(wrapper).element);
    expect(wrapper.get('[role="status"]').text()).toBe('Koper removed.');
  });

  it('remembers the added stops per From stop and checks them when that From stop is chosen again', async () => {
    mockApi('get', '/stops/nearby', AROUND);
    mockApi('get', '/stops', [KOPER]);
    const wrapper = await render();
    await addStop(wrapper, 'Ko', 'Koper');

    await wrapper.setProps({ stop: KRANJ, modelValue: [] });
    await flushPromises();
    expect(checkboxes(wrapper).map((option) => option.label)).not.toContain('Koper, Train');

    await wrapper.setProps({ stop: LJUBLJANA, modelValue: [] });
    await flushPromises();
    expect(checkbox(wrapper, 'Koper').checked).toBe(true);
    expect(wrapper.props('modelValue')).toEqual(['si:2']);
  });

  it('shows and checks the remembered stops on the next start', async () => {
    window.localStorage.setItem(ADDED_STOPS_KEY, JSON.stringify({ 'si:1': [KOPER], 'si:7': [LJUBLJANA] }));
    mockApi('get', '/stops/nearby', AROUND);
    const wrapper = await render();

    expect(wrapper.emitted('update:modelValue')).toEqual([[['si:2']]]);
    expect(checkboxes(wrapper).map((option) => [option.label, option.checked])).toEqual([
      ['Kolodvor, Bus, 144 m', false],
      ['Ljubljana AP, Bus and Service, 162 m', false],
      ['Navje, 292 m', false],
      ['Koper, Train', true],
    ]);
  });

  it('disables the unchecked stops with a hint once the board has 10 stops', async () => {
    const many: NearbyStop[] = Array.from({ length: 11 }, (_, i) => ({
      id: `n:${i}`,
      name: `Stop ${i}`,
      lat: 46,
      lon: 14.5,
      modes: ['bus'],
      distance_m: 10 + i,
    }));
    mockApi('get', '/stops/nearby', many);
    const wrapper = await render(
      LJUBLJANA,
      many.slice(0, 8).map((stop) => stop.id),
    );

    expect(checkboxes(wrapper).some((option) => option.disabled)).toBe(false);
    expect(wrapper.text()).not.toContain('at most 10 stops');

    await checkbox(wrapper, 'Stop 8').box.trigger('click');

    const hint = wrapper.get('[id$="-limit"]');
    expect(hint.text()).toBe('The departures board shows at most 10 stops. Uncheck a stop to choose another.');
    const unchecked = checkboxes(wrapper).filter((option) => !option.checked);
    expect(unchecked.map((option) => option.label)).toEqual(['Stop 9, Bus, 19 m', 'Stop 10, Bus, 20 m']);
    for (const option of unchecked) {
      expect(option.disabled).toBe(true);
      expect(option.box.attributes('aria-describedby')).toBe(hint.attributes('id'));
    }
    expect(
      checkboxes(wrapper)
        .filter((option) => option.checked)
        .every((option) => !option.disabled),
    ).toBe(true);

    await checkbox(wrapper, 'Stop 9').box.trigger('click');
    await checkbox(wrapper, 'Stop 10').box.trigger('keydown', { key: ' ' });
    expect(wrapper.props('modelValue')).toHaveLength(9);

    await checkbox(wrapper, 'Stop 0').box.trigger('click');
    expect(checkboxes(wrapper).some((option) => option.disabled)).toBe(false);
  });

  it('checks no more than 9 stops by default and adds a stop unchecked when the board is full', async () => {
    window.localStorage.setItem(
      ADDED_STOPS_KEY,
      JSON.stringify({
        'si:1': Array.from({ length: 10 }, (_, i) => ({ ...KOPER, id: `a:${i}`, name: `Added ${i}` })),
      }),
    );
    mockApi('get', '/stops/nearby', AROUND);
    mockApi('get', '/stops', [KRANJ]);
    const wrapper = await render();

    expect(wrapper.props('modelValue')).toEqual(Array.from({ length: 9 }, (_, i) => `a:${i}`));

    await addStop(wrapper, 'Kr', 'Kranj');

    expect(checkbox(wrapper, 'Kranj').checked).toBe(false);
    expect(checkbox(wrapper, 'Kranj').disabled).toBe(true);
    expect(wrapper.get('[role="status"]').text()).toBe('Kranj added.');
    expect(stored()['si:1'].map((stop) => stop.id)).toContain('si:7');
  });
});
