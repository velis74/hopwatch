import { describe, expect, it } from 'vitest';

import type { Journeys } from '../api/hopwatch-api';
import { itinerary, journeysPage, leg } from '../test-journeys';
import { mountApp } from '../test-utils';

import JourneyList from './journey-list.vue';

function time(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

async function render(props: { journeys: Journeys | null; error?: boolean; selectedId?: string | null }) {
  const { wrapper } = await mountApp(JourneyList, { props: { selectedId: null, ...props } });
  return wrapper;
}

function button(wrapper: Awaited<ReturnType<typeof render>>, text: string) {
  return wrapper.findAll('button').filter((candidate) => candidate.text() === text);
}

describe('JourneyList', () => {
  it('is a section headed "Journeys" with an ordered list of itineraries', async () => {
    const wrapper = await render({ journeys: journeysPage([itinerary(), itinerary({ id: 'it-2' })]) });

    const heading = wrapper.get('h2');
    expect(heading.text()).toBe('Journeys');
    expect(wrapper.get('section').attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(wrapper.findAll('ol > li')).toHaveLength(2);
  });

  it('shows the times, duration, transfers and legs of an itinerary', async () => {
    const wrapper = await render({ journeys: journeysPage([itinerary()]) });

    const item = wrapper.get('ol > li');
    expect(item.get('.journey-summary').text()).toContain(
      `${time('2026-11-27T09:05:00Z')} – ${time('2026-11-27T10:35:00Z')}`,
    );
    expect(item.get('.journey-summary').text()).toContain('1 h 30 min');
    expect(item.get('.journey-summary').text()).toContain('1 transfer');
    const legs = item.get('ul');
    expect(legs.attributes('aria-label')).toBe('Legs');
    const texts = legs.findAll('li').map((entry) => entry.text());
    expect(texts[0]).toContain('Train IC 502 to Koper');
    expect(texts[0]).toContain(`${time('2026-11-27T09:05:00Z')} Ljubljana – ${time('2026-11-27T10:20:00Z')} Divača`);
    expect(texts[0]).toContain('Platform 3');
    expect(texts[1]).toContain('Walk 240 m');
    expect(texts[2]).toContain('Bus 1 to Koper');
    expect(item.find('.journey-expected').exists()).toBe(false);
  });

  it.each([
    [0, 'No transfers'],
    [2, '2 transfers'],
  ])('counts %i transfers', async (transfers, text) => {
    const wrapper = await render({ journeys: journeysPage([itinerary({ transfers })]) });

    expect(wrapper.get('.journey-summary').text()).toContain(text);
  });

  it('gives a short duration in minutes', async () => {
    const wrapper = await render({ journeys: journeysPage([itinerary({ duration_minutes: 42 })]) });

    expect(wrapper.get('.journey-summary').text()).toContain('42 min');
    expect(wrapper.get('.journey-summary').text()).not.toContain('h');
  });

  it('shows expected times, delays with their source and ticket links where known', async () => {
    const wrapper = await render({
      journeys: journeysPage([
        itinerary({
          expected_departure: '2026-11-27T09:07:00Z',
          expected_arrival: '2026-11-27T10:41:00Z',
          legs: [
            leg({ delay_minutes: 2, delay_source: 'official', ticket_url: 'https://tickets.example/ic502' }),
            leg({ mode: 'bus', line: '6', headsign: null, delay_minutes: -1 }),
            leg({ mode: 'tram', line: '2', delay_minutes: 0 }),
            leg({ mode: 'walk', line: null, headsign: null, distance_m: null }),
          ],
        }),
      ]),
    });

    expect(wrapper.get('.journey-expected').text()).toBe(
      `Expected departure ${time('2026-11-27T09:07:00Z')}. Expected arrival ${time('2026-11-27T10:41:00Z')}`,
    );
    const legs = wrapper.findAll('.journey-leg');
    expect(legs[0].text()).toContain('+2 min (official)');
    expect(legs[0].find('.text-error').exists()).toBe(true);
    expect(legs[0].get('a').attributes()).toMatchObject({ href: 'https://tickets.example/ic502', target: '_blank' });
    expect(legs[0].get('a').text()).toBe('Tickets');
    expect(legs[1].text()).toContain('Bus 6');
    expect(legs[1].text()).not.toContain(' to ');
    expect(legs[1].text()).toContain('1 min early');
    expect(legs[2].text()).toContain('Tram 2 to Koper');
    expect(legs[2].text()).toContain('On time');
    expect(legs[3].get('.journey-leg-name').text()).toBe('Walk');
  });

  it('does not repeat an expected time equal to the timetable', async () => {
    const wrapper = await render({
      journeys: journeysPage([
        itinerary({ expected_departure: '2026-11-27T09:05:00Z', expected_arrival: '2026-11-27T10:35:00Z' }),
      ]),
    });

    expect(wrapper.find('.journey-expected').exists()).toBe(false);
  });

  it('offers each itinerary on the map, marking the selected one as pressed', async () => {
    const wrapper = await render({
      journeys: journeysPage([itinerary(), itinerary({ id: 'it-2' })]),
      selectedId: 'it-2',
    });

    const buttons = button(wrapper, 'Show on map');
    expect(buttons.map((entry) => entry.attributes('aria-pressed'))).toEqual(['false', 'true']);
    const summary = wrapper.findAll('.journey-summary')[0];
    expect(buttons[0].attributes('aria-describedby')).toBe(summary.attributes('id'));

    await buttons[0].trigger('click');

    expect(wrapper.emitted('select')).toEqual([['it-1']]);
  });

  it('asks for the earlier and the later page', async () => {
    const wrapper = await render({ journeys: journeysPage([itinerary()]) });

    await button(wrapper, 'Earlier')[0].trigger('click');
    await button(wrapper, 'Later')[0].trigger('click');

    expect(wrapper.emitted('earlier')).toHaveLength(1);
    expect(wrapper.emitted('later')).toHaveLength(1);
  });

  it('disables the pages there are no cursors for', async () => {
    const wrapper = await render({
      journeys: journeysPage([itinerary()], { earlier_cursor: null, later_cursor: null }),
    });

    expect(button(wrapper, 'Earlier')[0].attributes('disabled')).toBeDefined();
    expect(button(wrapper, 'Later')[0].attributes('disabled')).toBeDefined();
  });

  it('moves the focus to the first journey on request', async () => {
    const wrapper = await render({ journeys: journeysPage([itinerary(), itinerary({ id: 'it-2' })]) });

    await (wrapper.vm as unknown as { focusFirst: () => Promise<void> }).focusFirst();

    expect(document.activeElement).toBe(wrapper.findAll('ol > li')[0].element);
  });

  it('says so when no journey is found', async () => {
    const wrapper = await render({ journeys: journeysPage([]) });

    expect(wrapper.text()).toContain('No journeys found.');
    expect(wrapper.find('ol').exists()).toBe(false);
  });

  it('says journeys are being found until they arrive', async () => {
    const wrapper = await render({ journeys: null });

    expect(wrapper.text()).toContain('Finding journeys…');
  });

  it('warns when journeys are not available', async () => {
    const wrapper = await render({ journeys: null, error: true });

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Journeys are not available right now. Please try again later.',
    );
  });

  it('names the operator of each ride and tags a favourite one', async () => {
    window.localStorage.setItem('hopwatch.favouriteOperators', '["1123"]');
    const wrapper = await render({ journeys: journeysPage([itinerary()]) });

    const [train, walk, bus] = wrapper.findAll('.journey-leg');
    expect(train.get('.journey-leg-operator').text()).toBe('SŽ - Potniški promet, d.o.o.');
    expect(walk.find('.journey-leg-operator').exists()).toBe(false);
    expect(bus.get('.journey-leg-operator').text()).toBe('Arriva d.o.o. Favourite');
    expect(bus.get('.favourite-tag').text()).toBe('Favourite');
  });
});
