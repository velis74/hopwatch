import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { useLocale } from 'vuetify';

import App from './app.vue';
import i18n from './i18n';
import {
  allauthBody,
  APP_ROUTES,
  flushPromises,
  mockAllauth,
  mockAnonymousSession,
  mockApi,
  mountApp,
  STUB_ROUTES,
} from './test-utils';

const ANA = { id: 7, email: 'ana@example.com', display: 'Ana' };

function mockLoggedInSession(): void {
  mockAllauth('get', '/config', allauthBody(200, { socialaccount: { providers: [] } }));
  mockAllauth('get', '/auth/session', allauthBody(200, { user: ANA }, { meta: { is_authenticated: true } }));
  mockApi('get', '/account/me', { id: 7, email: ANA.email, display_name: 'Ana' });
}

function navigation(): HTMLElement {
  return document.querySelector<HTMLElement>('.v-app-bar nav')!;
}

/** Mounts the app and waits until it has loaded the session. */
async function mountLoggedIn(route: string) {
  const mounted = await mountApp(App, { route });
  await vi.waitFor(() => expect(navigation().querySelector('.user-email')).not.toBeNull());
  return mounted;
}

/** The links and buttons of the main navigation by their accessible text. */
function navigationControl(name: string): HTMLElement | undefined {
  return [...navigation().querySelectorAll<HTMLElement>('a, button')].find(
    (element) => element.textContent?.trim() === name,
  );
}

describe('app', () => {
  it('offers a skip link, the title linking home and the settings and login in the main navigation', async () => {
    mockAnonymousSession();
    const { router } = await mountApp(App, { route: '/settings' });

    const skip = document.querySelector<HTMLAnchorElement>('a.skip-link')!;
    expect(skip.textContent).toBe('Skip to main content');
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');

    const title = document.querySelector<HTMLAnchorElement>('.v-app-bar a.app-title')!;
    expect(title.textContent?.trim()).toBe('Hopwatch');
    expect(title.getAttribute('href')).toBe('/');
    expect(title.querySelector('img')?.getAttribute('alt')).toBe('');

    expect(navigationControl('Settings')?.getAttribute('href')).toBe('/settings');
    expect(navigationControl('Log in')?.getAttribute('href')).toBe('/login');
    expect(navigationControl('Log out')).toBeUndefined();

    expect(navigation().getAttribute('aria-label')).toBe('Main navigation');
    navigationControl('Log in')!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'));
  });

  it('asks for the experience on first start and lays the app out in the lively experience until then', async () => {
    mockAnonymousSession();
    await mountApp(App);

    expect(document.getElementById('experience-dialog-title')?.textContent?.trim()).toBe('Choose your experience');
    expect(document.documentElement.classList.contains('experience-lively')).toBe(true);
    expect(document.documentElement.classList.contains('experience-simple')).toBe(false);
  });

  it('gives the simple experience larger controls and switches the layout when the choice changes', async () => {
    window.localStorage.setItem('hopwatch.experience', 'simple');
    mockAnonymousSession();
    const { wrapper } = await mountApp(App, { routes: APP_ROUTES, route: '/settings' });

    expect(document.getElementById('experience-dialog-title')).toBeNull();
    expect(document.documentElement.classList.contains('experience-simple')).toBe(true);
    expect(navigationControl('Settings')?.classList.contains('v-btn--size-large')).toBe(true);

    await wrapper.find('input[type="radio"][value="lively"]').setValue(true);
    await flushPromises();

    expect(document.documentElement.classList.contains('experience-lively')).toBe(true);
    expect(document.documentElement.classList.contains('experience-simple')).toBe(false);
    expect(navigationControl('Settings')?.classList.contains('v-btn--size-large')).toBe(false);
  });

  it('shows who is logged in and logs out to the home page', async () => {
    window.localStorage.setItem('hopwatch.experience', 'lively');
    document.cookie = 'csrftoken=x; path=/';
    mockLoggedInSession();
    const { router } = await mountLoggedIn('/settings');

    const user = navigation().querySelector<HTMLElement>('.user-email')!;
    expect(user.textContent).toBe('Logged in asana@example.com');
    expect(user.getAttribute('title')).toBe('ana@example.com');
    expect(user.querySelector('.visually-hidden')?.textContent).toBe('Logged in as');
    expect(navigationControl('Log in')).toBeUndefined();

    const logout = mockAllauth('delete', '/auth/session', allauthBody(401, { flows: [] }), { status: 401 });
    navigationControl('Log out')!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('home'));

    expect(logout).toHaveLength(1);
    expect(logout[0].headers.get('X-CSRFToken')).toBe('x');
    expect(navigation().querySelector('.user-email')).toBeNull();
    expect(navigationControl('Log in')).toBeDefined();
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('tells the user when logging out fails and keeps them logged in', async () => {
    window.localStorage.setItem('hopwatch.experience', 'lively');
    document.cookie = 'csrftoken=x; path=/';
    mockLoggedInSession();
    const { router } = await mountLoggedIn('/settings');

    mockAllauth('delete', '/auth/session', allauthBody(500, {}), { status: 500 });
    navigationControl('Log out')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Logging out did not succeed.'));

    const alert = [...document.querySelectorAll('[role="alert"]')].find((element) =>
      element.textContent?.includes('Logging out did not succeed. Please try again.'),
    );
    expect(alert).toBeDefined();
    expect(navigation().querySelector('.user-email')?.getAttribute('title')).toBe('ana@example.com');
    expect(router.currentRoute.value.name).toBe('settings');
  });

  it('hides the logout failure message after a while', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      window.localStorage.setItem('hopwatch.experience', 'lively');
      document.cookie = 'csrftoken=x; path=/';
      mockLoggedInSession();
      await mountLoggedIn('/');
      mockAllauth('delete', '/auth/session', allauthBody(500, {}), { status: 500 });
      navigationControl('Log out')!.click();
      await vi.waitFor(() => expect(document.body.textContent).toContain('Logging out did not succeed.'));

      expect(document.querySelector('.v-snackbar--active')).not.toBeNull();

      await vi.advanceTimersByTimeAsync(10_000);
      await flushPromises();

      expect(document.querySelector('.v-snackbar--active')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows only icons in the app bar on a narrow screen, keeping the text as the accessible name', async () => {
    window.innerWidth = 360;
    window.dispatchEvent(new Event('resize'));
    try {
      mockAnonymousSession();
      await mountApp(App);

      for (const name of ['Settings', 'Log in']) {
        expect(navigationControl(name)?.querySelector('.visually-hidden')?.textContent).toBe(name);
      }
    } finally {
      window.innerWidth = 1024;
      window.dispatchEvent(new Event('resize'));
    }
  });

  it('shows the text of the app bar buttons on a wide screen', async () => {
    mockAnonymousSession();
    await mountApp(App);

    expect(navigation().querySelector('.visually-hidden')).toBeNull();
  });

  it('follows the interface language, also in Vuetify’s own strings', async () => {
    window.localStorage.setItem('hopwatch.experience', 'lively');
    mockAnonymousSession();
    // A page that shows one of Vuetify's own strings, as its components do (e.g. a dialog's close button).
    const Page = defineComponent(() => {
      const { t: vuetifyT } = useLocale();
      return () => h('p', { class: 'vuetify-string' }, vuetifyT('$vuetify.close'));
    });
    await mountApp(App, {
      locale: 'sl',
      routes: [{ path: '/', name: 'home', component: Page }, ...STUB_ROUTES.filter((route) => route.name !== 'home')],
    });

    expect(navigation().getAttribute('aria-label')).toBe('Glavna navigacija');
    expect(navigationControl('Nastavitve')).toBeDefined();
    expect(navigationControl('Prijava')).toBeDefined();
    expect(document.querySelector('.vuetify-string')?.textContent).toBe('Zapri');

    i18n.global.locale.value = 'en';
    await flushPromises();

    expect(navigationControl('Settings')).toBeDefined();
    expect(document.querySelector('.vuetify-string')?.textContent).toBe('Close');
  });
});
