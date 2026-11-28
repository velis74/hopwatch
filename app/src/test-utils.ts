import { DynamicFormsVueGrid, translateStrings as translateGridStrings } from '@dynamicforms/vue-grid';
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

import FavouriteOperatorButton from './components/favourite-operator-button.vue';
import OperatorName from './components/operator-name.vue';
import i18n, { type SupportedLocale, VUETIFY_MESSAGES } from './i18n';

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

/** The body of an API error: `detail_code` with field errors `fields` (field name -> codes). */
export function apiError(code: string, fields: Record<string, string[]> = {}, detail = 'Refused.'): object {
  return {
    detail,
    detail_code: code,
    detail_params: {},
    field_errors: Object.fromEntries(
      Object.entries(fields).map(([field, codes]) => [field, codes.map((c) => ({ code: c, params: {}, detail: c }))]),
    ),
  };
}

/** The body of a refused validation with field errors `fields` (field name -> codes); answer it with status 422. */
export function validationError(fields: Record<string, string[]>): object {
  return apiError('fastapi-viewsets.validation_failed', fields, 'The request failed validation');
}

/** `GET /account/session` answering `account`, or an anonymous session without one. */
export function mockSession(account: { id: number; email: string; display_name: string } | null): RecordedRequest[] {
  return mockApi('get', '/account/session', { is_authenticated: account !== null, session_token: null, account });
}

/** An anonymous session without social providers. */
export function mockAnonymousSession(): void {
  mockSession(null);
  mockApi('get', '/account/providers', []);
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
  readonly fits: { bounds: [LngLat, LngLat]; options: Record<string, unknown> }[] = [];
  readonly sources = new Map<string, FakeSource>();
  readonly layers: { id: string; source: string; filter: unknown; paint: Record<string, unknown> }[] = [];
  /** Whether the style has loaded; while false, `once('load')` callbacks wait for {@link FakeMap.loadStyle}. */
  styleLoaded = true;
  private readonly loadCallbacks: (() => void)[] = [];
  removed = false;

  constructor(readonly options: { container: HTMLElement; center: LngLat; zoom: number; [key: string]: unknown }) {
    if (maplibreFake.failure) throw maplibreFake.failure;
    this.styleLoaded = !maplibreFake.styleLoading;
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

  fitBounds(bounds: [LngLat, LngLat], options: Record<string, unknown> = {}): this {
    this.fits.push({ bounds, options });
    return this;
  }

  isStyleLoaded(): boolean {
    return this.styleLoaded;
  }

  /** Finishes loading the style and runs the waiting `load` callbacks. */
  loadStyle(): void {
    this.styleLoaded = true;
    this.loadCallbacks.splice(0).forEach((callback) => callback());
  }

  addSource(id: string, source: { data: unknown }): this {
    this.sources.set(id, new FakeSource(source.data));
    return this;
  }

  getSource(id: string): FakeSource | undefined {
    return this.sources.get(id);
  }

  addLayer(layer: { id: string; source: string; filter: unknown; paint: Record<string, unknown> }): this {
    this.layers.push(layer);
    return this;
  }

  once(event: string, callback: () => void): this {
    if (event === 'load') this.loadCallbacks.push(callback);
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

class FakeSource {
  constructor(public data: unknown) {}

  setData(data: unknown): this {
    this.data = data;
    return this;
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
 * The maps and markers created are in `maps` / `markers`; set `failure` to make `new Map()` throw (no WebGL) and
 * `styleLoading` to create maps whose style loads on `loadStyle()`.
 */
export const maplibreFake = {
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
  workerUrl: null as string | null,
  failure: null as Error | null,
  /** New maps start without a loaded style. */
  styleLoading: false,
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
    maplibreFake.styleLoading = false;
  },
};

/* ------------------------------------------------------------------------------------------------------------ */
/* Mounting                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

const Blank = { render: () => null };

/** The app's routes by name and path; a page renders only where a spec passes its own `routes`. */
export const STUB_ROUTES: RouteRecordRaw[] = [
  {
    path: '/',
    component: Blank,
    children: [
      { path: '', name: 'home', component: Blank, meta: { titleKey: 'pages.home.title' } },
      { path: 'ride/:tripId', name: 'ride', component: Blank, meta: { titleKey: 'pages.ride.title' } },
      { path: 'journey', name: 'journey', component: Blank, meta: { titleKey: 'pages.journey.title' } },
    ],
  },
  { path: '/login', name: 'login', component: Blank, meta: { titleKey: 'pages.login.title' } },
  { path: '/signup', name: 'signup', component: Blank, meta: { titleKey: 'pages.signup.title' } },
  { path: '/settings', name: 'settings', component: Blank, meta: { titleKey: 'pages.settings.title' } },
  { path: '/about', name: 'about', component: Blank, meta: { titleKey: 'pages.about.title' } },
];

/** The app's routes with their real pages. */
export const APP_ROUTES: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('./pages/home-page.vue'),
    children: [
      { path: '', name: 'home', component: Blank, meta: { titleKey: 'pages.home.title' } },
      {
        path: 'ride/:tripId',
        name: 'ride',
        component: () => import('./pages/ride-page.vue'),
        meta: { titleKey: 'pages.ride.title' },
      },
      {
        path: 'journey',
        name: 'journey',
        component: () => import('./pages/journey-page.vue'),
        meta: { titleKey: 'pages.journey.title' },
      },
    ],
  },
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
  {
    path: '/about',
    name: 'about',
    component: () => import('./pages/about-page.vue'),
    meta: { titleKey: 'pages.about.title' },
  },
];

export interface MountOptions {
  props?: Record<string, unknown>;
  /**
   * Props bound as `v-model:<name>` with these initial values: every `update:<name>` sets the prop on the mounted
   * component, also while `mountApp` still waits for pending promises.
   */
  models?: Record<string, unknown>;
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
    translateGridStrings(i18n.global.t, 'grid');
    installedTranslations = true;
  }
  const vuetify = createVuetify({
    theme: { defaultTheme: 'light' },
    locale: { locale: i18n.global.locale.value, fallback: 'en', messages: VUETIFY_MESSAGES },
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: options.routes ?? STUB_ROUTES });
  await router.push(options.route ?? '/');
  await router.isReady();

  const mounted: { wrapper?: { setProps(props: Record<string, unknown>): Promise<void> } } = {};
  const models = Object.fromEntries(
    Object.entries(options.models ?? {}).flatMap(([name, value]) => [
      [name, value],
      [`onUpdate:${name}`, (update: unknown) => mounted.wrapper?.setProps({ [name]: update })],
    ]),
  );
  const attachTo = document.createElement('div');
  document.body.appendChild(attachTo);
  const wrapper = mount(component, {
    attachTo,
    props: { ...options.props, ...models } as never,
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
        [DynamicFormsVueGrid, { registerComponents: true }],
      ] as never,
      components: { OperatorName, FavouriteOperatorButton },
    },
  });
  mounted.wrapper = wrapper as never;
  await flushPromises();
  return { wrapper: wrapper as never, router, pinia };
}
