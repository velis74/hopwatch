<template>
  <v-app>
    <a class="skip-link" href="#main-content">{{ t('app.skipToContent') }}</a>
    <v-defaults-provider :defaults="experienceDefaults">
      <v-app-bar :density="simple ? 'default' : 'comfortable'">
        <v-app-bar-title>
          <router-link :to="{ name: 'home' }" class="app-title text-decoration-none text-high-emphasis">
            <img :src="logo" alt="" class="app-logo" width="28" height="28" />
            <span>{{ t('app.title') }}</span>
          </router-link>
        </v-app-bar-title>
        <nav :aria-label="t('app.mainNavigation')" class="d-flex align-center ga-1 pr-2">
          <v-btn :to="{ name: 'settings' }" variant="text" prepend-icon="mdi-cog-outline">
            <span :class="{ 'visually-hidden': compact }">{{ t('app.settings') }}</span>
          </v-btn>
          <template v-if="session.loggedIn">
            <span class="user-email text-body-2" :title="session.account?.email">
              <span class="visually-hidden">{{ t('app.loggedInAs') }}</span>
              <span>{{ session.account?.email }}</span>
            </span>
            <v-btn variant="text" prepend-icon="mdi-logout" @click="logout">
              <span :class="{ 'visually-hidden': compact }">{{ t('app.logout') }}</span>
            </v-btn>
          </template>
          <v-btn v-else :to="{ name: 'login' }" variant="text" prepend-icon="mdi-login">
            <span :class="{ 'visually-hidden': compact }">{{ t('app.login') }}</span>
          </v-btn>
        </nav>
      </v-app-bar>
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
import { computed, onMounted, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useDisplay, useLocale } from 'vuetify';

import logo from './assets/logo.svg';
import ExperienceDialog from './components/experience-dialog.vue';
import { usePreferencesStore } from './stores/preferences';
import { useSessionStore } from './stores/session';

const { t, locale } = useI18n();
const vuetifyLocale = useLocale();
const router = useRouter();
const session = useSessionStore();
const preferences = usePreferencesStore();
const display = useDisplay();

const simple = computed(() => preferences.effectiveExperience === 'simple');
/** On narrow screens the app bar buttons show only their icons; the text stays as their accessible name. */
const compact = computed(() => display.xs.value);

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

const logoutFailed = ref(false);

async function logout() {
  try {
    await session.logout();
  } catch {
    logoutFailed.value = true;
    return;
  }
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

.user-email {
  max-width: 14em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 599px) {
  .user-email {
    max-width: 7em;
  }
}
</style>
