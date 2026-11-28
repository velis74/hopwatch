<template>
  <v-app>
    <a class="skip-link" href="#main-content">{{ t('app.skipToContent') }}</a>
    <v-defaults-provider :defaults="experienceDefaults">
      <v-app-bar :density="simple ? 'default' : 'comfortable'">
        <template v-if="narrow" #prepend>
          <v-app-bar-nav-icon
            ref="menuButton"
            :aria-label="t('app.menu')"
            :aria-expanded="menuOpen ? 'true' : 'false'"
            aria-controls="app-navigation"
            @click="menuOpen = !menuOpen"
          />
        </template>
        <v-app-bar-title>
          <router-link :to="{ name: 'home' }" class="app-title text-decoration-none text-high-emphasis">
            <img :src="logo" alt="" class="app-logo" width="28" height="28" />
            <span>{{ t('app.title') }}</span>
          </router-link>
        </v-app-bar-title>
      </v-app-bar>
      <v-navigation-drawer
        id="app-navigation"
        :model-value="narrow ? menuOpen : true"
        :aria-label="t('app.mainNavigation')"
        :temporary="narrow"
        :permanent="!narrow"
        :rail="!narrow"
        :expand-on-hover="!narrow"
        :rail-width="simple ? 64 : 56"
        :width="expandedWidth"
        :retain-focus="narrow"
        disable-resize-watcher
        disable-route-watcher
        :class="{ 'app-navigation--focused': !narrow && focusInside }"
        @update:model-value="(open: boolean) => narrow && (menuOpen = open)"
        @keydown.esc="narrow && (menuOpen = false)"
        @focusin="focusInside = true"
        @focusout="onFocusOut"
      >
        <ul class="app-navigation-list">
          <li>
            <v-list-item
              :to="{ name: 'home' }"
              prepend-icon="mdi-train-bus"
              :title="t('pages.home.title')"
              :density="itemDensity"
              rounded="lg"
            />
          </li>
          <li>
            <v-list-item
              :to="{ name: 'settings' }"
              prepend-icon="mdi-cog-outline"
              :title="t('app.settings')"
              :density="itemDensity"
              rounded="lg"
            />
          </li>
        </ul>
        <template #append>
          <ul class="app-navigation-list">
            <template v-if="session.loggedIn">
              <li>
                <v-list-item prepend-icon="mdi-account-circle-outline" :density="itemDensity">
                  <template #title>
                    <span class="user-email" :title="session.account?.email">
                      <span class="visually-hidden">{{ t('app.loggedInAs') }}</span>
                      <span>{{ session.account?.email }}</span>
                    </span>
                  </template>
                </v-list-item>
              </li>
              <li>
                <v-list-item
                  tag="button"
                  type="button"
                  class="app-navigation-button"
                  prepend-icon="mdi-logout"
                  :title="t('app.logout')"
                  :density="itemDensity"
                  rounded="lg"
                  @click="logout"
                />
              </li>
            </template>
            <li v-else>
              <v-list-item
                :to="{ name: 'login' }"
                prepend-icon="mdi-login"
                :title="t('app.login')"
                :density="itemDensity"
                rounded="lg"
              />
            </li>
          </ul>
        </template>
      </v-navigation-drawer>
      <v-main id="main-content" tabindex="-1">
        <router-view />
      </v-main>
      <experience-dialog />
    </v-defaults-provider>
    <v-snackbar v-model="logoutFailed" color="error" role="alert">
      {{ t('auth.errors.logoutFailed') }}
    </v-snackbar>
    <modal-view />
  </v-app>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay, useLocale } from 'vuetify';

import logo from './assets/logo.svg';
import ExperienceDialog from './components/experience-dialog.vue';
import { usePreferencesStore } from './stores/preferences';
import { useSessionStore } from './stores/session';

const { t, locale } = useI18n();
const vuetifyLocale = useLocale();
const router = useRouter();
const route = useRoute();
const session = useSessionStore();
const preferences = usePreferencesStore();

const simple = computed(() => preferences.effectiveExperience === 'simple');
/** Below Vuetify `md` the navigation is a temporary drawer opened from the app bar; from `md` up a rail. */
const { mobile: narrow } = useDisplay({ mobileBreakpoint: 'md' });
const itemDensity = computed(() => (simple.value ? 'default' : 'compact'));
const itemMinHeight = computed(() => (simple.value ? '48px' : '40px'));
const expandedWidth = computed(() => (simple.value ? 304 : 256));
const expandedWidthPx = computed(() => `${expandedWidth.value}px`);

/** Larger controls in the simple experience. */
const experienceDefaults = computed(() =>
  simple.value
    ? {
        VBtn: { size: 'large' },
        VTextField: { density: 'default' },
        VAutocomplete: { density: 'default' },
        VSelect: { density: 'default' },
      }
    : {
        VTextField: { density: 'comfortable' },
        VAutocomplete: { density: 'comfortable' },
        VSelect: { density: 'comfortable' },
      },
);

watchEffect(() => {
  vuetifyLocale.current.value = locale.value;
});

watchEffect(() => {
  const root = document.documentElement.classList;
  root.toggle('experience-simple', simple.value);
  root.toggle('experience-lively', !simple.value);
});

const menuOpen = ref(false);
const menuButton = ref<{ $el: HTMLElement } | null>(null);
/** Keyboard focus in the rail expands it as hovering does. */
const focusInside = ref(false);

/** The drawer renders the `nav` element and its scrim side by side, so its `$el` is not the `nav`. */
function navigationElement(): HTMLElement | null {
  return document.getElementById('app-navigation');
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  focusInside.value = !!next && !!navigationElement()?.contains(next);
}

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false;
  },
);

watch(narrow, () => {
  menuOpen.value = false;
});

/** Opening moves focus to the first item; closing returns it to the menu button unless the new page took it. */
watch(menuOpen, async (open) => {
  await nextTick();
  const element = navigationElement();
  if (!element) return;
  if (open) {
    element.querySelector<HTMLElement>('a, button')?.focus();
    return;
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const active = document.activeElement;
  if (!active || active === document.body || element.contains(active)) menuButton.value?.$el.focus();
});

const logoutFailed = ref(false);

async function logout() {
  try {
    await session.logout();
  } catch {
    logoutFailed.value = true;
    return;
  }
  menuOpen.value = false;
  await router.push({ name: 'home' });
}

onMounted(() => session.initialise());
</script>

<style scoped>
.app-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.app-logo {
  display: block;
}

.app-navigation-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  margin: 0;
  list-style: none;
}

.app-navigation-list .v-list-item {
  min-height: v-bind(itemMinHeight);
  padding-inline: 8px;
}

.app-navigation-button {
  width: 100%;
  text-align: start;
}

/* Focus in the rail widens it over the page, as hovering does; the layout keeps the rail width. */
.v-navigation-drawer--rail.app-navigation--focused {
  width: v-bind(expandedWidthPx) !important;
}

.v-navigation-drawer--rail.app-navigation--focused,
.v-navigation-drawer--rail.v-navigation-drawer--is-hovering {
  box-shadow:
    0 8px 10px -5px rgba(0, 0, 0, 0.2),
    0 16px 24px 2px rgba(0, 0, 0, 0.14);
}
</style>
