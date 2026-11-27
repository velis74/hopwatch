import { enableAutoUnmount } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { listen, maplibreFake, removeGeolocation, server, unhandledRequests } from './test-utils';

// Browser APIs Vuetify uses that jsdom does not implement.
const browser = window as Partial<Window & typeof globalThis>;

if (!browser.ResizeObserver) {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
if (!browser.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (!browser.visualViewport) {
  const viewport = Object.assign(new EventTarget(), {
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    onresize: null,
    onscroll: null,
    onscrollend: null,
    get width() {
      return window.innerWidth;
    },
    get height() {
      return window.innerHeight;
    },
  }) as VisualViewport;
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: viewport });
}
window.scrollTo = () => undefined;

beforeAll(listen);
afterAll(() => server.close());

// Hooks run in reverse order: the wrappers unmount before the page is cleared.
afterEach(() => {
  vi.restoreAllMocks();
  server.resetHandlers();
  removeGeolocation();
  maplibreFake.reset();
  window.localStorage.clear();
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0].trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
  document.body.innerHTML = '';
  const unhandled = unhandledRequests.splice(0);
  if (unhandled.length) throw new Error(`Requests without a mocked answer:\n${unhandled.join('\n')}`);
});

enableAutoUnmount(afterEach);
