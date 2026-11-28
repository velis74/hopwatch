import { describe, expect, it } from 'vitest';

import { mountApp } from '../test-utils';

import AboutPage from './about-page.vue';

async function render() {
  const { wrapper } = await mountApp(AboutPage);
  return wrapper;
}

/** The links of the page as `[accessible name, href]`. */
function links(wrapper: Awaited<ReturnType<typeof render>>): [string, string | undefined][] {
  return wrapper.findAll('a').map((link) => [link.text(), link.attributes('href')]);
}

describe('about page', () => {
  it('says what Hopwatch is under a level-one heading', async () => {
    const wrapper = await render();

    expect(wrapper.get('h1').text()).toBe('About Hopwatch');
    expect(wrapper.get('h1 + p').text()).toContain('Hopwatch');
  });

  it('groups the attributions in a section named by its heading', async () => {
    const wrapper = await render();

    const section = wrapper.get('section');
    const heading = section.get('h2');
    expect(heading.text()).toBe('Data sources and attributions');
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(section.findAll('h3').map((h3) => h3.text())).toEqual([
      'Timetables and real-time data',
      'Map',
      'Licence of Hopwatch',
    ]);
  });

  it('credits the timetable data, the map data, the tiles and their licences', async () => {
    const wrapper = await render();

    const text = wrapper.text();
    expect(text).toContain('SŽ – Potniški promet');
    expect(text).toContain('© OpenStreetMap contributors');
    expect(text).toContain('MIT');
    expect(links(wrapper)).toEqual([
      ['DUJPP, nap.si', 'https://nap.si'],
      ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
      ['Open Database Licence (ODbL)', 'https://www.openstreetmap.org/copyright'],
      ['OpenMapTiles', 'https://www.openmaptiles.org/'],
      ['OpenFreeMap', 'https://openfreemap.org'],
      ['Hopwatch source code on GitHub', 'https://github.com/velis74/hopwatch'],
    ]);
  });

  it('opens every link in the same tab', async () => {
    const wrapper = await render();

    expect(wrapper.findAll('a[target]')).toHaveLength(0);
  });

  it('is translated', async () => {
    const { wrapper } = await mountApp(AboutPage, { locale: 'sl' });

    expect(wrapper.get('h1').text()).toBe('O aplikaciji Hopwatch');
    expect(wrapper.get('h2').text()).toBe('Viri podatkov in navedbe avtorstva');
  });
});
