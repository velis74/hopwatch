import { expect, type Page, test } from '@playwright/test';

import {
  chooseExperience,
  chooseOption,
  departuresList,
  expectHeadingsInOrder,
  expectNoSeriousViolations,
  inServiceHours,
  NEAR_LJUBLJANA,
  NEAREST_STOP,
  tabTo,
} from './support';

test.use({ geolocation: NEAR_LJUBLJANA, permissions: ['geolocation'] });

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

async function goHome(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
}

async function measure(page: Page): Promise<{ font: number; target: number }> {
  const heading = page.getByRole('heading', { level: 2, name: NEAREST_STOP, exact: true });
  await expect(heading).toBeVisible();
  const font = await heading.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  const box = await page.getByRole('button', { name: 'Swap from and to', exact: true }).boundingBox();
  expect(box).not.toBeNull();
  return { font, target: Math.min(box!.width, box!.height) };
}

async function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => (animation as CSSAnimation).animationName ?? animation.constructor.name),
  );
}

test('first start asks for an experience and remembers the choice on the device', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Choose your experience' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Simple and large', exact: true })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Lively', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await expectNoSeriousViolations(page);

  await chooseExperience(page, 'Simple and large');
  await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Choose your experience' })).toHaveCount(0);

  await openSettings(page);
  await expect(page.getByRole('radio', { name: 'Simple and large', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Lively', exact: true })).not.toBeChecked();
});

test('the experience dialog is operable by keyboard', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Choose your experience' });
  await expect(dialog).toBeVisible();

  const lively = dialog.getByRole('radio', { name: 'Lively', exact: true });
  const simple = dialog.getByRole('radio', { name: 'Simple and large', exact: true });
  await tabTo(page, simple.or(lively));
  if (await lively.evaluate((element) => element === document.activeElement)) {
    await page.keyboard.press('Space');
  } else {
    await page.keyboard.press('ArrowDown');
    if (!(await lively.isChecked())) await page.keyboard.press('Space');
  }
  await expect(lively).toBeChecked();

  await tabTo(page, dialog.getByRole('button', { name: 'Continue', exact: true }));
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Departures', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Choose your experience' })).toHaveCount(0);
});

test('keyboard focus stays inside the experience dialog', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Choose your experience' });
  await expect(dialog).toBeVisible();
  const focusInDialog = () => dialog.evaluate((element) => element.contains(document.activeElement));

  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await focusInDialog()).toBe(true);
  }
  await dialog.getByRole('radio', { name: 'Lively', exact: true }).check();
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await focusInDialog()).toBe(true);
  }
});

test('"Simple and large" has a larger font and touch targets than "Lively"', async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page, 'Simple and large');
  const simple = await measure(page);

  await openSettings(page);
  await page.getByRole('radio', { name: 'Lively', exact: true }).check();
  await goHome(page);
  const lively = await measure(page);

  expect(simple.font).toBeGreaterThan(lively.font);
  expect(simple.target).toBeGreaterThanOrEqual(lively.target);
  // WCAG 2.2 AA 2.5.8: targets at least 24 by 24 CSS pixels.
  expect(lively.target).toBeGreaterThanOrEqual(24);
});

test('"Simple and large" runs no decorative animation', async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page, 'Simple and large');
  await expect(page.getByRole('heading', { level: 2, name: NEAREST_STOP, exact: true })).toBeVisible();
  if (inServiceHours()) await expect(departuresList(page)).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await runningAnimations(page)).toEqual([]);
});

for (const experience of ['Lively', 'Simple and large'] as const) {
  test(`prefers-reduced-motion disables animation in "${experience}"`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await chooseExperience(page, experience);
    await expect(page.getByRole('heading', { level: 2, name: NEAREST_STOP, exact: true })).toBeVisible();
    if (inServiceHours()) await expect(departuresList(page)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await runningAnimations(page)).toEqual([]);
  });
}

test('settings change the experience and the language', async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page, 'Lively');
  await expect(page.locator('html')).toHaveAttribute('lang', /^en/);

  await openSettings(page);
  await expectNoSeriousViolations(page);
  await expectHeadingsInOrder(page);

  await expect(page.getByRole('radio', { name: 'Lively', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'Simple and large', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Simple and large', exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Simple and large', exact: true })).toBeChecked();

  await chooseOption(page, page.getByRole('combobox', { name: 'Language', exact: true }), /^(Slovenian|Slovenščina)$/);
  await expect(page.locator('html')).toHaveAttribute('lang', /^sl/);
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(0);
  await expectNoSeriousViolations(page);

  await chooseOption(page, page.getByRole('combobox', { name: /^(Language|Jezik)$/ }), /^(English|Angleščina)$/);
  await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
});

test.describe('with a Slovenian browser', () => {
  test.use({ locale: 'sl-SI' });

  test('the app starts in Slovenian', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', /^sl/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Choose your experience' })).toHaveCount(0);
  });
});
