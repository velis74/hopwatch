import { expect, test } from '@playwright/test';

import {
  chooseExperience,
  departureItems,
  departuresList,
  expectNoSeriousViolations,
  inServiceHours,
  navigateTo,
  NEAR_LJUBLJANA,
} from './support';

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

const TOGGLE = /^Favourite operator: (.+)$/u;

test('an operator marked as favourite from a departure is tagged, listed in the settings and unmarked there', async ({
  page,
}) => {
  await page.goto('/');
  await chooseExperience(page);
  test.skip(!inServiceHours(), 'no departures expected at the fixture stop at this hour');

  const list = departuresList(page);
  const mark = list.getByRole('button', { name: TOGGLE, pressed: false }).first();
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  const operator = TOGGLE.exec((await mark.getAttribute('aria-label')) ?? '')![1];
  const ofOperator = departureItems(list).filter({ hasText: operator });
  await expect(ofOperator.filter({ hasText: 'Favourite' })).toHaveCount(0);

  await mark.click();

  const remove = list.getByRole('button', { name: `Favourite operator: ${operator}`, exact: true });
  await expect(remove.first()).toHaveAttribute('aria-pressed', 'true');
  const count = await ofOperator.count();
  expect(count).toBeGreaterThan(0);
  await expect(ofOperator.filter({ hasText: /\bFavourite\b/u })).toHaveCount(count);
  await expect(remove).toHaveCount(count);
  await expectNoSeriousViolations(page);

  await navigateTo(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const favourites = page.getByRole('group', { name: 'Favourite operators', exact: true });
  const box = favourites.getByRole('checkbox', { name: operator, exact: true });
  await expect(box).toBeChecked();
  await expect(favourites.getByRole('checkbox', { checked: true })).toHaveCount(1);
  await expectNoSeriousViolations(page);

  await box.uncheck();
  await page.reload();
  await expect(
    page
      .getByRole('group', { name: 'Favourite operators', exact: true })
      .getByRole('checkbox', { name: operator, exact: true }),
  ).not.toBeChecked();

  await page.goto('/');
  await expect(
    departuresList(page)
      .getByRole('button', { name: `Favourite operator: ${operator}`, exact: true })
      .first(),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(departureItems(departuresList(page)).filter({ hasText: /\bFavourite\b/u })).toHaveCount(0);
});
