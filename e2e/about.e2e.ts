import { expect, test } from '@playwright/test';

import {
  chooseExperience,
  expectHeadingsInOrder,
  expectNoSeriousViolations,
  NEAR_LJUBLJANA,
  navigateTo,
} from './support';

const LINKS: [string, string][] = [
  ['DUJPP, nap.si', 'https://nap.si'],
  ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  ['Open Database Licence (ODbL)', 'https://www.openstreetmap.org/copyright'],
  ['OpenMapTiles', 'https://www.openmaptiles.org/'],
  ['OpenFreeMap', 'https://openfreemap.org'],
  ['Hopwatch source code on GitHub', 'https://github.com/velis74/hopwatch'],
];

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

test('the results link to the data sources and attributions on the About page', async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page);
  await page.getByRole('link', { name: 'Data sources and attributions', exact: true }).click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { level: 1, name: 'About Hopwatch', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('About Hopwatch – Hopwatch');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('the About page names every data source and licence with a link', async ({ page }) => {
  await page.goto('/about');
  await chooseExperience(page);

  const sources = page.getByRole('region', { name: 'Data sources and attributions', exact: true });
  await expect(sources.getByRole('heading', { level: 2, name: 'Data sources and attributions' })).toBeVisible();
  for (const heading of ['Timetables and real-time data', 'Map', 'Licence of Hopwatch'])
    await expect(sources.getByRole('heading', { level: 3, name: heading, exact: true })).toBeVisible();
  await expect(sources).toContainText('SŽ – Potniški promet');
  await expect(sources).toContainText('© OpenStreetMap contributors');
  await expect(sources).toContainText('MIT');
  for (const [name, href] of LINKS)
    await expect(sources.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  await expect(sources.getByRole('link')).toHaveCount(LINKS.length);

  await expectHeadingsInOrder(page);
  await expectNoSeriousViolations(page);
});

test('the menu opens the About page', async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page);
  await navigateTo(page, 'About');
  await expect(page.getByRole('heading', { name: 'About Hopwatch', exact: true })).toBeVisible();
});
