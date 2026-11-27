import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import vuetify from 'vite-plugin-vuetify';

const djangoTarget = process.env.HOPWATCH_DJANGO_URL ?? 'http://127.0.0.1:8100';
const fastApiTarget = process.env.HOPWATCH_API_URL ?? 'http://127.0.0.1:8101';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue(), vuetify({ autoImport: true })],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: fastApiTarget },
      // The social providers' callbacks.
      '/accounts': { target: djangoTarget },
      '/admin': { target: djangoTarget },
      // Django admin assets.
      '/static': { target: djangoTarget },
    },
  },
  preview: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
