import { expect, type Page, test } from '@playwright/test';

import {
  chooseExperience,
  expectHeadingsInOrder,
  expectNoSeriousViolations,
  randomEmail,
  randomPassword,
  tabTo,
} from './support';

const SOCIAL = [
  { id: 'google', button: 'Continue with Google' },
  { id: 'apple', button: 'Continue with Apple' },
];

async function openLogin(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Log in', exact: true })).toBeVisible();
}

async function expectLoggedIn(page: Page, email: string): Promise<void> {
  const appBar = page.getByRole('banner');
  await expect(appBar.getByText(email, { exact: true })).toBeVisible();
  await expect(appBar.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await chooseExperience(page);
});

test('sign up, log out, a wrong password and log in again', async ({ page }) => {
  const email = randomEmail();
  const password = randomPassword();

  await openLogin(page);
  const loginEmail = page.getByLabel('Email', { exact: true });
  const loginPassword = page.getByLabel('Password', { exact: true });
  await expect(loginEmail).toHaveAttribute('autocomplete', 'email');
  await expect(loginPassword).toHaveAttribute('autocomplete', 'current-password');
  await expectNoSeriousViolations(page);
  await expectHeadingsInOrder(page);

  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Create an account', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Repeat password', { exact: true }).fill(password);
  await expectNoSeriousViolations(page);
  await expectHeadingsInOrder(page);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expectLoggedIn(page, email);

  await page.getByRole('banner').getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  await expect(page.getByRole('banner').getByText(email, { exact: true })).toHaveCount(0);

  await openLogin(page);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(`${password}-wrong`);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expectNoSeriousViolations(page);

  // The correct login by keyboard only.
  await page.getByLabel('Password', { exact: true }).fill('');
  await page.getByLabel('Email', { exact: true }).fill('');
  await tabTo(page, page.getByLabel('Email', { exact: true }));
  await page.keyboard.type(email);
  await tabTo(page, page.getByLabel('Password', { exact: true }));
  await page.keyboard.type(password);
  await tabTo(page, page.getByRole('button', { name: 'Log in', exact: true }));
  await page.keyboard.press('Enter');
  await expectLoggedIn(page, email);
});

test('social login buttons follow the providers the server lists', async ({ page }) => {
  const response = await page.request.get('/api/v1/account/providers');
  expect(response.ok()).toBe(true);
  const providers = (await response.json()) as { id: string; flows: string[] }[];
  const configured = new Set(
    providers.filter((provider) => provider.flows.includes('redirect')).map((provider) => provider.id),
  );

  await openLogin(page);
  for (const { id, button } of SOCIAL) {
    const locator = page.getByRole('button', { name: button, exact: true });
    if (!configured.has(id)) {
      await expect(locator, `${id} is not configured`).toHaveCount(0);
      continue;
    }
    await expect(locator).toBeVisible();
    if (id === 'apple') {
      // Apple's guidelines: a black button.
      expect(await locator.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(0, 0, 0)');
    }
  }
});
