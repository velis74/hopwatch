import { nextTick, watch } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw, START_LOCATION } from 'vue-router';

import i18n from '../i18n';

declare module 'vue-router' {
  interface RouteMeta {
    /** Message key of the page title, shown in the document title. */
    titleKey?: string;
  }
}

const routes: RouteRecordRaw[] = [
  {
    // The start page keeps the search while its list gives way to the details of a ride or a journey.
    path: '/',
    component: () => import('../pages/home-page.vue'),
    children: [
      { path: '', name: 'home', component: { render: () => null }, meta: { titleKey: 'pages.home.title' } },
      {
        path: 'ride/:tripId',
        name: 'ride',
        component: () => import('../pages/ride-page.vue'),
        meta: { titleKey: 'pages.ride.title' },
      },
      {
        path: 'journey',
        name: 'journey',
        component: () => import('../pages/journey-page.vue'),
        meta: { titleKey: 'pages.journey.title' },
      },
    ],
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../pages/login-page.vue'),
    meta: { titleKey: 'pages.login.title' },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('../pages/signup-page.vue'),
    meta: { titleKey: 'pages.signup.title' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../pages/settings-page.vue'),
    meta: { titleKey: 'pages.settings.title' },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

function applyDocumentTitle(): void {
  const app = i18n.global.t('app.title');
  const key = router.currentRoute.value.meta.titleKey;
  document.title = key ? `${i18n.global.t(key)} – ${app}` : app;
}

router.afterEach((to, from, failure) => {
  if (failure) return;
  void nextTick(() => {
    applyDocumentTitle();
    // A page change moves focus to the main region, so screen readers announce the new page. Within a page that
    // shows several views (the start page), the page moves focus to the heading of the view.
    if (from !== START_LOCATION && to.matched[0] !== from.matched[0]) document.getElementById('main-content')?.focus();
  });
});

watch(() => i18n.global.locale.value, applyDocumentTitle);

export default router;
