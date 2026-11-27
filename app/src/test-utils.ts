import { DynamicFormsInputs, translateStrings as translateInputsStrings } from '@dynamicforms/vuetify-inputs';
import {
  DynamicFormsModalFormKit,
  translateStrings as translateModalStrings,
} from '@dynamicforms/vuetify-modal-form-kit';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { http, HttpResponse, type HttpResponseResolver } from 'msw/http';
import { setupServer } from 'msw/node';
import { createPinia, type Pinia, setActivePinia } from 'pinia';
import type { Component } from 'vue';
import { createMemoryHistory, createRouter, type Router, type RouteRecordRaw } from 'vue-router';
import { createVuetify } from 'vuetify';
import { en as vuetifyEn, sl as vuetifySl } from 'vuetify/locale';

import { ALLAUTH_BROWSER } from './api/allauth';
import i18n, { type SupportedLocale } from './i18n';

export { flushPromises, http, HttpResponse };

/* ------------------------------------------------------------------------------------------------------------ */
/* HTTP                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------ */

/** The network of every test; its handlers reset after each test. */
export const server = setupServer();

/** Requests that matched no handler; a test that made one fails after it. */
export const unhandledRequests: string[] = [];

/** Starts the mocked network: a request without a handler gets a network error and is listed. */
export function listen(): void {
  server.listen({
    onUnhandledFrame: ({ frame, defaults }) => {
      const { request } = (frame as { data?: { request?: Request } }).data ?? {};
      if (request) unhandledRequests.push(`${request.method} ${request.url}`);
      defaults.error();
    },
  });
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** A request the mocked network received. */
export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  /** The parsed JSON body; null without a body. */
  body: unknown;
}

/** A fixed answer: a JSON body and optionally a status, or an msw resolver for anything else. */
export type MockAnswer = unknown | HttpResponseResolver;

export interface MockInit {
  status?: number;
  headers?: Record<string, string>;
}

function absolute(path: string): string {
  return new URL(path, window.location.origin).href;
}

async function record(request: Request): Promise<RecordedRequest> {
  const text = await request.clone().text();
  return {
    method: request.method,
    url: new URL(request.url),
    headers: request.headers,
    body: text ? JSON.parse(text) : null,
  };
}

/**
 * Answers `method url` (path relative to the page origin, `:param` and `*` allowed) with `answer`; returns the list
 * of matching requests, filled as they arrive. A later mock of the same route takes precedence.
 */
export function mockHttp(method: HttpMethod, url: string, answer: MockAnswer, init: MockInit = {}): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  server.use(
    http[method](absolute(url), async (info) => {
      requests.push(await record(info.request));
      if (typeof answer === 'function') return (answer as HttpResponseResolver)(info);
      return HttpResponse.json(answer as never, { status: init.status ?? 200, headers: init.headers });
    }),
  );
  return requests;
}

/** {@link mockHttp} for the Hopwatch API: `path` is relative to `/api/v1`, e.g. `/stops/nearby`. */
export function mockApi(method: HttpMethod, path: string, answer: MockAnswer, init?: MockInit): RecordedRequest[] {
  return mockHttp(method, `/api/v1${path}`, answer, init);
}

/** The body allauth's headless API answers with. */
export function allauthBody(
  status: number,
  data: unknown = {},
  extra: { meta?: object; errors?: { message: string; code: string; param?: string }[] } = {},
): object {
  return { status, data, ...extra };
}

/**
 * {@link mockHttp} for allauth: `path` is relative to `/_allauth/browser/v1`, e.g. `/auth/session`. A plain `body`
 * is sent as given with `init.status` (default 200); build it with {@link allauthBody}.
 */
export function mockAllauth(method: HttpMethod, path: string, answer: MockAnswer, init?: MockInit): RecordedRequest[] {
  return mockHttp(method, `${ALLAUTH_BROWSER}${path}`, answer, init);
}

/** An anonymous allauth session without social providers: `/config` and `/auth/session` (401). */
export function mockAnonymousSession(): void {
  mockAllauth('get', '/config', allauthBody(200, { socialaccount: { providers: [] } }));
  mockAllauth('get', '/auth/session', allauthBody(401, { flows: [] }, { meta: { is_authenticated: false } }), {
    status: 401,
  });
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Geolocation                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------ */

export const GEOLOCATION_ERRORS = { denied: 1, unavailable: 2, timeout: 3 } as const;
export type GeolocationFailure = keyof typeof GEOLOCATION_ERRORS;

export interface GeolocationMock {
  /** The options of every `getCurrentPosition` call. */
  requests: (PositionOptions | undefined)[];
  /** Answers the calls still waiting (answer `'pending'`) with a position. */
  resolve(position: { lat: number; lon: number }): void;
  /** Answers the calls still waiting with an error. */
  fail(failure: GeolocationFailure): void;
}

/**
 * Gives the page `navigator.geolocation`, answering every request with `answer`: a position, a failure, or
 * `'pending'` to answer later through the returned mock. Without a call the page has no geolocation at all.
 */
export function mockGeolocation(
  answer: { lat: number; lon: number } | GeolocationFailure | 'pending',
): GeolocationMock {
  const waiting: { success: PositionCallback; error?: PositionErrorCallback | null }[] = [];
  const requests: (PositionOptions | undefined)[] = [];
  const position = (lat: number, lon: number): GeolocationPosition =>
    ({
      coords: { latitude: lat, longitude: lon, accuracy: 20 },
      timestamp: Date.now(),
    }) as GeolocationPosition;
  const error = (failure: GeolocationFailure): GeolocationPositionError =>
    ({ code: GEOLOCATION_ERRORS[failure], message: failure, ...GEOLOCATION_ERRORS }) as never;
  const mock: GeolocationMock = {
    requests,
    resolve: ({ lat, lon }) => waiting.splice(0).forEach((call) => call.success(position(lat, lon))),
    fail: (failure) => waiting.splice(0).forEach((call) => call.error?.(error(failure))),
  };
  const geolocation: Partial<Geolocation> = {
    getCurrentPosition(success, onError, options) {
      requests.push(options);
      waiting.push({ success, error: onError });
      if (answer === 'pending') return;
      if (typeof answer === 'string') mock.fail(answer);
      else mock.resolve(answer);
    },
    watchPosition: () => 0,
    clearWatch: () => undefined,
  };
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocation });
  return mock;
}

/** Takes `navigator.geolocation` away again; runs after every test. */
export function removeGeolocation(): void {
  delete (navigator as { geolocation?: Geolocation }).geolocation;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* MapLibre                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

type LngLat = [number, number];

class FakeMap {
  readonly canvas = document.createElement('canvas');
  center: LngLat;
  zoom: number;
  readonly moves: { kind: 'easeTo' | 'jumpTo'; center: LngLat; zoom?: number }[] = [];
  removed = false;

  constructor(readonly options: { container: HTMLElement; center: LngLat; zoom: number; [key: string]: unknown }) {
    if (maplibreFake.failure) throw maplibreFake.failure;
    this.center = options.center;
    this.zoom = options.zoom;
    // The real map labels its canvas as a region; the component is expected to hide it from assistive technology.
    this.canvas.setAttribute('role', 'region');
    this.canvas.setAttribute('aria-label', 'Map');
    this.canvas.tabIndex = 0;
    options.container.appendChild(this.canvas);
    maplibreFake.maps.push(this);
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  easeTo(options: { center: LngLat; zoom?: number }): this {
    this.moves.push({ kind: 'easeTo', ...options });
    this.center = options.center;
    return this;
  }

  jumpTo(options: { center: LngLat; zoom?: number }): this {
    this.moves.push({ kind: 'jumpTo', ...options });
    this.center = options.center;
    return this;
  }

  on(): this {
    return this;
  }

  off(): this {
    return this;
  }

  remove(): void {
    this.removed = true;
    this.canvas.remove();
  }
}

class FakeMarker {
  lngLat: LngLat | null = null;
  map: FakeMap | null = null;

  constructor(readonly options: { element?: HTMLElement } = {}) {
    maplibreFake.markers.push(this);
  }

  setLngLat(lngLat: LngLat): this {
    this.lngLat = lngLat;
    return this;
  }

  addTo(map: FakeMap): this {
    this.map = map;
    if (this.options.element) map.options.container.appendChild(this.options.element);
    return this;
  }

  remove(): this {
    this.options.element?.remove();
    this.map = null;
    return this;
  }
}

/**
 * A stand-in for `maplibre-gl`, which needs WebGL. In a spec:
 * `vi.mock('maplibre-gl', async () => (await import('<path>/test-utils')).maplibreFake.module);`
 * The maps and markers created are in `maps` / `markers`; set `failure` to make `new Map()` throw (no WebGL).
 */
export const maplibreFake = {
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  workerUrl: null as string | null,
  failure: null as Error | null,
  module: {
    Map: FakeMap,
    Marker: FakeMarker,
    setWorkerUrl(url: string): void {
      maplibreFake.workerUrl = url;
    },
  },
  reset(): void {
    maplibreFake.maps = [];
    maplibreFake.markers = [];
    maplibreFake.workerUrl = null;
    maplibreFake.failure = null;
  },
};

/* ------------------------------------------------------------------------------------------------------------ */
/* Mounting                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

const Blank = { render: () => null };

/** The app's routes by name and path; a page renders only where a spec passes its own `routes`. */
export const STUB_ROUTES: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: Blank, meta: { titleKey: 'pages.home.title' } },
  { path: '/login', name: 'login', component: Blank, meta: { titleKey: 'pages.login.title' } },
  { path: '/signup', name: 'signup', component: Blank, meta: { titleKey: 'pages.signup.title' } },
  { path: '/settings', name: 'settings', component: Blank, meta: { titleKey: 'pages.settings.title' } },
];

/** The app's routes with their real pages. */
export const APP_ROUTES: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./pages/home-page.vue'), meta: { titleKey: 'pages.home.title' } },
  {
    path: '/login',
    name: 'login',
    component: () => import('./pages/login-page.vue'),
    meta: { titleKey: 'pages.login.title' },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('./pages/signup-page.vue'),
    meta: { titleKey: 'pages.signup.title' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./pages/settings-page.vue'),
    meta: { titleKey: 'pages.settings.title' },
  },
];

export interface MountOptions {
  props?: Record<string, unknown>;
  slots?: Record<string, unknown>;
  /** The location the router starts at; default `/`. */
  route?: string;
  /** Routes of the memory-history router; default {@link STUB_ROUTES}. */
  routes?: RouteRecordRaw[];
  /** The interface language; default `en`. */
  locale?: SupportedLocale;
}

export interface Mounted<C extends Component> {
  wrapper: VueWrapper<InstanceType<C extends new (...args: never[]) => unknown ? C : never>>;
  router: Router;
  pinia: Pinia;
}

let installedTranslations = false;

/**
 * Mounts `component` as the app does (Vuetify, DynamicForms inputs and dialogs, the app's vue-i18n instance, a new
 * pinia, a memory-history router) into an element attached to `document.body`, and waits for the router and pending
 * promises. Dialogs and menus teleport to `document.body`: query them there. The wrapper unmounts after the test.
 */
export async function mountApp<C extends Component>(component: C, options: MountOptions = {}): Promise<Mounted<C>> {
  i18n.global.locale.value = options.locale ?? 'en';
  if (!installedTranslations) {
    translateInputsStrings(i18n.global.t, 'inputs');
    translateModalStrings(i18n.global.t, 'modal');
    installedTranslations = true;
  }
  const vuetify = createVuetify({
    theme: { defaultTheme: 'light' },
    locale: { locale: i18n.global.locale.value, fallback: 'en', messages: { en: vuetifyEn, sl: vuetifySl } },
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: options.routes ?? STUB_ROUTES });
  await router.push(options.route ?? '/');
  await router.isReady();

  const attachTo = document.createElement('div');
  document.body.appendChild(attachTo);
  const wrapper = mount(component, {
    attachTo,
    props: options.props as never,
    slots: options.slots as never,
    global: {
      plugins: [
        vuetify,
        pinia,
        router,
        i18n,
        [
          DynamicFormsInputs,
          {
            registerComponents: true,
            registerVuetifyComponents: true,
            errorText: (error: { code?: string; params?: object }) => {
              const key = `errors.${error.code}`;
              return error.code && i18n.global.te(key) ? i18n.global.t(key, { ...error.params }) : undefined;
            },
          },
        ],
        [DynamicFormsModalFormKit, { registerComponents: true, registerVuetifyComponents: true }],
      ] as never,
    },
  });
  await flushPromises();
  return { wrapper: wrapper as never, router, pinia };
}
