import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Stop } from '../api/hopwatch-api';
import { flushPromises, mountApp } from '../test-utils';

import JourneyForm, { type TimeMode } from './journey-form.vue';

const LJUBLJANA: Stop = { id: 'si:1', name: 'Ljubljana', lat: 46.0569, lon: 14.5058, modes: [] };
const KOPER: Stop = { id: 'si:2', name: 'Koper', lat: 45.548, lon: 13.7302, modes: [] };

type Model = { from: Stop | null; to: Stop | null; timeMode: TimeMode; time: string };

async function render(initial: Partial<Model> = {}) {
  const model: Model = { from: LJUBLJANA, to: null, timeMode: 'now', time: '', ...initial };
  const { wrapper } = await mountApp(JourneyForm, {
    models: model,
  });
  return wrapper;
}

function labelled(wrapper: Awaited<ReturnType<typeof render>>, text: string) {
  // Vuetify renders the field's label twice; only the one shown for the field's current state names the input.
  const label = wrapper.findAll('label[for]').find((candidate) => candidate.text() === text);
  if (!label) throw new Error(`No label ${text}`);
  return wrapper.get(`#${label.attributes('for')}`);
}

function radio(value: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
}

describe('JourneyForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 27, 9, 41));
  });
  afterEach(() => vi.useRealTimers());

  it('has a From and a To stop field, a swap button and the time choice, leaving now by default', async () => {
    const wrapper = await render();

    expect(wrapper.get('form').attributes('aria-label')).toBe('Journey');
    expect(labelled(wrapper, 'From').element.tagName).toBe('INPUT');
    expect(labelled(wrapper, 'To').element.tagName).toBe('INPUT');
    expect(wrapper.get('.v-autocomplete').text()).toContain('Ljubljana');
    expect(wrapper.findAll('button').some((button) => button.text() === 'Swap from and to')).toBe(true);

    const group = wrapper.get('[role="radiogroup"]');
    const groupLabel = document.getElementById(group.attributes('aria-labelledby')!);
    expect(groupLabel?.textContent).toBe('When');
    const labels = [...group.element.querySelectorAll('input[type="radio"]')].map(
      (input) => document.querySelector(`label[for="${input.id}"]`)?.textContent,
    );
    expect(labels).toEqual(['Leave now', 'Depart at', 'Arrive by']);
    expect(radio('now').checked).toBe(true);
    expect(wrapper.findAll('label').some((label) => label.text() === 'Time')).toBe(false);
  });

  it('only the To field can be cleared', async () => {
    const wrapper = await render({ to: KOPER });

    expect(wrapper.find('button[aria-label="Clear To"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Clear From"]').exists()).toBe(false);
  });

  it('swaps from and to', async () => {
    const wrapper = await render({ to: KOPER });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Swap from and to')!
      .trigger('click');

    expect(wrapper.props('from')).toEqual(KOPER);
    expect(wrapper.props('to')).toEqual(LJUBLJANA);
  });

  it('cannot swap without stops', async () => {
    const wrapper = await render({ from: null });

    const swap = wrapper.findAll('button').find((button) => button.text() === 'Swap from and to')!;
    expect(swap.attributes('disabled')).toBeDefined();
  });

  it.each(['depart', 'arrive'] as const)('asks for a time starting at now for %s', async (mode) => {
    const wrapper = await render();

    radio(mode).click();
    await flushPromises();

    expect(wrapper.props('timeMode')).toBe(mode);
    expect(wrapper.props('time')).toBe('2026-11-27T09:41');
    const input = labelled(wrapper, 'Time');
    expect(input.attributes('type')).toBe('datetime-local');
    expect((input.element as HTMLInputElement).value).toBe('2026-11-27T09:41');
  });

  it('keeps a time already chosen', async () => {
    const wrapper = await render({ time: '2026-11-28T07:00' });

    radio('arrive').click();
    await flushPromises();

    expect(wrapper.props('time')).toBe('2026-11-28T07:00');
  });

  it('takes the typed time', async () => {
    const wrapper = await render({ timeMode: 'depart', time: '2026-11-27T09:41' });

    await labelled(wrapper, 'Time').setValue('2026-11-27T18:30');

    expect(wrapper.props('time')).toBe('2026-11-27T18:30');
  });

  it('submits with the button it is given, only with From', async () => {
    const { wrapper } = await mountApp(JourneyForm, {
      props: { submitLabel: 'Show departures' },
      models: { from: LJUBLJANA, to: null, timeMode: 'now', time: '' },
    });

    const submit = wrapper.get('button[type="submit"]');
    expect(submit.text()).toBe('Show departures');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);

    await wrapper.setProps({ from: null });
    expect(submit.attributes('disabled')).toBeDefined();
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('has no submit button without a label', async () => {
    const wrapper = await render();

    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });
});
