import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type i18nInstance from '../i18n';

vi.mock('maplibre-gl', async () => (await import('../test-utils')).maplibreFake.module);

type Router = (typeof import('./index'))['default'];

let router: Router;
let i18n: typeof i18nInstance;
let main: HTMLElement;

/** Navigates as a link click does and waits for the title and focus to follow. */
async function go(location: string): Promise<void> {
  await router.push(location);
  await nextTick();
  await nextTick();
}

describe('router', () => {
  beforeEach(async () => {
    vi.resetModules();
    window.history.replaceState(null, '', '/');
    ({ default: router } = await import('./index'));
    ({ default: i18n } = await import('../i18n'));
    i18n.global.locale.value = 'en';
    main = document.createElement('main');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.appendChild(main);
  });

  it.each([
    ['/', 'Departures – Hopwatch'],
    ['/login', 'Log in – Hopwatch'],
    ['/signup', 'Create an account – Hopwatch'],
    ['/settings', 'Settings – Hopwatch'],
  ])('titles the document of %s', async (path, title) => {
    await go(path);

    expect(document.title).toBe(title);
    expect(window.location.pathname).toBe(path);
  });

  it('leaves focus alone when the app opens', async () => {
    await go('/settings');

    expect(document.activeElement).not.toBe(main);
  });

  it('moves focus to the main region on every later page change, so screen readers announce the new page', async () => {
    await go('/settings');

    await go('/login');
    expect(document.activeElement).toBe(main);

    main.blur();
    await go('/');
    expect(document.activeElement).toBe(main);
  });

  it('keeps focus where it is when only the query of the page changes', async () => {
    await go('/login');
    await go('/settings');
    main.blur();

    await go('/settings?tab=language');

    expect(document.activeElement).not.toBe(main);
  });

  it('retitles the document when the interface language changes', async () => {
    await go('/settings');

    i18n.global.locale.value = 'sl';
    await nextTick();

    expect(document.title).toBe('Nastavitve – Hopwatch');
  });

  it('titles a page without its own title with the app name', async () => {
    router.addRoute({ path: '/untitled', component: { render: () => null } });

    await go('/untitled');

    expect(document.title).toBe('Hopwatch');
  });

  it('keeps the title and focus when a navigation is cancelled', async () => {
    await go('/settings');
    const stop = router.beforeEach((to) => to.path !== '/login');

    await go('/login');
    stop();

    expect(router.currentRoute.value.path).toBe('/settings');
    expect(document.title).toBe('Settings – Hopwatch');
    expect(document.activeElement).not.toBe(main);
  });
});
