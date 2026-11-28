import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  chooseExperience,
  expectNoSeriousViolations,
  mainNavigation,
  menuButton,
  NEAR_LJUBLJANA,
  navigateTo,
  openNavigation,
  stopField,
  tabTo,
} from './support';

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

function navigationLink(navigation: Locator, name: string): Locator {
  return navigation.getByRole('link', { name, exact: true });
}

async function focusInside(navigation: Locator): Promise<boolean> {
  return navigation.evaluate((element) => element.contains(document.activeElement));
}

async function width(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  return box?.width ?? 0;
}

async function itemHeight(page: Page): Promise<number> {
  const box = await navigationLink(await openNavigation(page), 'Settings').boundingBox();
  expect(box).not.toBeNull();
  return box!.height;
}

test.describe('narrow screen', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the menu button is only on narrow screens');
    await page.goto('/');
    await chooseExperience(page);
  });

  test('the menu button opens the navigation drawer, Escape and the scrim close it', async ({ page }) => {
    const button = menuButton(page);
    const navigation = mainNavigation(page);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(await button.getAttribute('aria-controls')).toBe(await navigation.getAttribute('id'));
    await expect(navigation).not.toBeInViewport();

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(navigation).toBeInViewport();
    await expect(navigationLink(navigation, 'Departures')).toBeFocused();
    await expect(navigationLink(navigation, 'Departures')).toHaveAttribute('aria-current', 'page');
    await expect(navigationLink(navigation, 'Settings')).toBeVisible();
    await expect(navigationLink(navigation, 'Log in')).toBeVisible();
    await expectNoSeriousViolations(page);

    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await focusInside(navigation), `focus stays in the drawer after ${key}`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(navigation).not.toBeInViewport();

    await button.click();
    await expect(navigation).toBeInViewport();
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width - 16, viewport.height / 2);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(navigation).not.toBeInViewport();
  });

  test('following a link closes the drawer and marks the new page', async ({ page }) => {
    await navigateTo(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(mainNavigation(page)).not.toBeInViewport();

    const navigation = await openNavigation(page);
    await expect(navigationLink(navigation, 'Settings')).toHaveAttribute('aria-current', 'page');
    await expect(navigationLink(navigation, 'Departures')).not.toHaveAttribute('aria-current', 'page');
  });
});

test.describe('wide screen', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(isMobile, 'the rail is only on wide screens');
    await page.goto('/');
    await chooseExperience(page);
  });

  test('a rail of named icons widens on hover and on keyboard focus', async ({ page }) => {
    const navigation = mainNavigation(page);
    await expect(menuButton(page)).toHaveCount(0);
    await expect(navigation).toBeInViewport();
    expect(await width(navigation)).toBeLessThan(100);
    for (const name of ['Departures', 'Settings', 'Log in'])
      await expect(navigationLink(navigation, name)).toBeVisible();
    await expect(navigationLink(navigation, 'Departures')).toHaveAttribute('aria-current', 'page');
    await expectNoSeriousViolations(page);

    await tabTo(page, navigationLink(navigation, 'Settings'));
    await expect.poll(() => width(navigation), { message: 'focus widens the rail' }).toBeGreaterThanOrEqual(200);
    await tabTo(page, stopField(page, 'From'));
    await expect.poll(() => width(navigation), { message: 'the rail narrows when focus leaves' }).toBeLessThan(100);

    const box = (await navigation.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await expect.poll(() => width(navigation), { message: 'hover widens the rail' }).toBeGreaterThanOrEqual(200);
    await page.mouse.move(box.x + 600, box.y + 40);
    await expect
      .poll(() => width(navigation), { message: 'the rail narrows when the pointer leaves' })
      .toBeLessThan(100);

    await navigationLink(navigation, 'Settings').click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(navigationLink(navigation, 'Settings')).toHaveAttribute('aria-current', 'page');
  });
});

test('"Simple and large" has larger navigation items than "Lively"', async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page, 'Lively');
  const lively = await itemHeight(page);

  await navigateTo(page, 'Settings');
  await page.getByRole('radio', { name: 'Simple and large', exact: true }).check();
  const simple = await itemHeight(page);

  expect(simple).toBeGreaterThan(lively);
  // WCAG 2.2 AA 2.5.8: targets at least 24 by 24 CSS pixels.
  expect(lively).toBeGreaterThanOrEqual(24);
});
