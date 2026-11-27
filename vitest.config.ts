import { resolve } from 'node:path';

import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './app/vite.config';

// Unit and component tests of the app; the root is `app/`, as in the Vite config.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
      setupFiles: ['src/test-setup.ts'],
      // Vuetify and the DynamicForms packages import their own CSS, which Node cannot load.
      server: { deps: { inline: ['vuetify', /@dynamicforms\//u, 'vue-cached-icon'] } },
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}'],
        reporter: ['text-summary', 'json'],
        reportsDirectory: resolve(import.meta.dirname, 'coverage'),
      },
    },
  }),
);
