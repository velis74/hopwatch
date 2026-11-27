import { DynamicFormsInputs, translateStrings as translateInputsStrings } from '@dynamicforms/vuetify-inputs';
import {
  DynamicFormsModalFormKit,
  translateStrings as translateModalStrings,
} from '@dynamicforms/vuetify-modal-form-kit';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import { en as vuetifyEn, sl as vuetifySl } from 'vuetify/locale';

import App from './app.vue';
import i18n from './i18n';
import router from './router';

import '@mdi/font/css/materialdesignicons.css';
import '@dynamicforms/vuetify-inputs/styles.css';
import 'vuetify/styles';
import './styles/app.css';

translateInputsStrings(i18n.global.t, 'inputs');
translateModalStrings(i18n.global.t, 'modal');

const vuetify = createVuetify({
  theme: { defaultTheme: 'system' },
  // Vuetify's own strings; app.vue keeps the locale in step with vue-i18n.
  locale: { locale: i18n.global.locale.value, fallback: 'en', messages: { en: vuetifyEn, sl: vuetifySl } },
});

createApp(App)
  .use(vuetify)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .use(DynamicFormsInputs, {
    registerComponents: true,
    registerVuetifyComponents: true,
    // Validator and server error codes (`<namespace>.<code>`) are translated from `errors.<namespace>.<code>`.
    errorText: (error) => {
      const key = `errors.${error.code}`;
      return error.code && i18n.global.te(key) ? i18n.global.t(key, { ...error.params }) : undefined;
    },
  })
  .use(DynamicFormsModalFormKit, { registerComponents: true, registerVuetifyComponents: true })
  .mount('#app');
