import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { useLocale } from 'vuetify';

import App from './app.vue';
import i18n from './i18n';
import {
  apiError,
  APP_ROUTES,
  flushPromises,
  mockAnonymousSession,
  mockApi,
  mockSession,
  mountApp,
  STUB_ROUTES,
} from './test-utils';

function mockLoggedInSession(): void {
  mockApi('get', '/account/providers', []);
  mockSession({ id: 7, email: 'ana@example.com', display_name: 'Ana' });
}

function navigation(): HTMLElement {
  return document.querySelector<HTMLElement>('nav#app-navigation')!;
}

function menuButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('.v-app-bar button[aria-controls="app-navigation"]');
}

/** Sets the window width as a resize does. */
function resizeTo(width: number): void {
  window.innerWidth = width;
  window.dispatchEvent(new Event('resize'));
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
  it('has a skip link, the title linking home, departures, settings, about and login in the navigation', async () => {
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

    expect(navigationControl('Departures')?.getAttribute('href')).toBe('/');
    expect(navigationControl('Settings')?.getAttribute('href')).toBe('/settings');
    expect(navigationControl('About')?.getAttribute('href')).toBe('/about');
    expect(navigationControl('Log in')?.getAttribute('href')).toBe('/login');
    expect(navigationControl('Log out')).toBeUndefined();
    expect(navigationControl('Settings')?.getAttribute('aria-current')).toBe('page');
    expect(navigationControl('Departures')?.hasAttribute('aria-current')).toBe(false);

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
    mockApi('get', '/operators', []);
    const { wrapper } = await mountApp(App, { routes: APP_ROUTES, route: '/settings' });

    expect(document.getElementById('experience-dialog-title')).toBeNull();
    expect(document.documentElement.classList.contains('experience-simple')).toBe(true);
    expect(navigationControl('Settings')?.classList.contains('v-list-item--density-default')).toBe(true);
    expect(navigation().style.width).toBe('64px');

    await wrapper.find('input[type="radio"][value="lively"]').setValue(true);
    await flushPromises();

    expect(document.documentElement.classList.contains('experience-lively')).toBe(true);
    expect(document.documentElement.classList.contains('experience-simple')).toBe(false);
    expect(navigationControl('Settings')?.classList.contains('v-list-item--density-compact')).toBe(true);
    expect(navigation().style.width).toBe('56px');
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

    const logout = mockApi('post', '/account/logout', { is_authenticated: false, session_token: null });
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

    mockApi('post', '/account/logout', apiError('hopwatch.anything'), { status: 500 });
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
      mockApi('post', '/account/logout', apiError('hopwatch.anything'), { status: 500 });
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

  it('opens the navigation from the menu button when narrow, closes it on Escape and on navigation', async () => {
    resizeTo(360);
    try {
      mockAnonymousSession();
      const { router } = await mountApp(App, { route: '/settings' });

      const button = menuButton()!;
      expect(button.getAttribute('aria-label')).toBe('Menu');
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(document.getElementById(button.getAttribute('aria-controls')!)).toBe(navigation());
      expect(navigation().classList.contains('v-navigation-drawer--active')).toBe(false);

      button.click();
      await vi.waitFor(() => expect(document.activeElement).toBe(navigationControl('Departures')));
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(navigation().classList.contains('v-navigation-drawer--active')).toBe(true);
      expect(navigation().classList.contains('v-navigation-drawer--temporary')).toBe(true);

      navigation().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await vi.waitFor(() => expect(document.activeElement).toBe(button));
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(navigation().classList.contains('v-navigation-drawer--active')).toBe(false);

      button.click();
      await vi.waitFor(() => expect(document.activeElement).toBe(navigationControl('Departures')));
      navigationControl('Departures')!.click();
      await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('home'));
      await vi.waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('false'));
      expect(navigation().classList.contains('v-navigation-drawer--active')).toBe(false);
    } finally {
      resizeTo(1024);
    }
  });

  it('closes the navigation on the scrim on a narrow screen', async () => {
    resizeTo(360);
    try {
      mockAnonymousSession();
      await mountApp(App);

      const button = menuButton()!;
      button.click();
      await vi.waitFor(() => expect(document.querySelector('.v-navigation-drawer__scrim')).not.toBeNull());
      document.querySelector<HTMLElement>('.v-navigation-drawer__scrim')!.click();

      await vi.waitFor(() => expect(document.activeElement).toBe(button));
      expect(button.getAttribute('aria-expanded')).toBe('false');
    } finally {
      resizeTo(1024);
    }
  });

  it('shows the navigation as a rail on a wide screen that widens while it holds keyboard focus', async () => {
    mockAnonymousSession();
    await mountApp(App);

    expect(menuButton()).toBeNull();
    expect(navigation().classList.contains('v-navigation-drawer--rail')).toBe(true);
    expect(navigation().classList.contains('v-navigation-drawer--active')).toBe(true);
    expect(navigationControl('Settings')?.textContent?.trim()).toBe('Settings');

    navigationControl('Settings')!.focus();
    await flushPromises();
    expect(navigation().classList.contains('app-navigation--focused')).toBe(true);

    navigationControl('Settings')!.blur();
    await flushPromises();
    expect(navigation().classList.contains('app-navigation--focused')).toBe(false);
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
      routes: [{ path: '/', name: 'home', component: Page }, ...STUB_ROUTES.filter((route) => route.path !== '/')],
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
