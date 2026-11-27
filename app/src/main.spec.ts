import { describe, expect, it, vi } from 'vitest';

import { flushPromises, mockAnonymousSession } from './test-utils';

vi.mock('maplibre-gl', async () => (await import('./test-utils')).maplibreFake.module);

/** Opens the app at `path` as the browser does: the page `index.html` with `main.ts` loaded. */
async function openApp(path: string): Promise<void> {
  window.history.replaceState(null, '', path);
  const root = document.createElement('div');
  root.id = 'app';
  document.body.appendChild(root);
  vi.resetModules();
  await import('./main');
  await flushPromises();
}

function button(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === name,
  );
}

describe('main', () => {
  it('starts the app in the language chosen on this device, at the page of the address', async () => {
    window.localStorage.setItem('hopwatch.experience', 'lively');
    window.localStorage.setItem('hopwatch.locale', 'sl');
    mockAnonymousSession();

    await openApp('/settings');

    await vi.waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('Nastavitve'));
    expect(document.querySelector('.v-app-bar a.app-title')?.textContent?.trim()).toBe('Hopwatch');
    expect(document.title).toBe('Nastavitve – Hopwatch');
    expect(document.documentElement.lang).toBe('sl-SI');
  });

  it('shows form errors in the interface language', async () => {
    window.localStorage.setItem('hopwatch.experience', 'lively');
    mockAnonymousSession();

    await openApp('/login');
    await vi.waitFor(() => expect(button('Log in')).toBeDefined());
    button('Log in')!.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain('This field is required.'));
  });
});
