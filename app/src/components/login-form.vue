<template>
  <v-form novalidate @submit.prevent="submit">
    <df-input
      :control="fields.email"
      :label="t('auth.email')"
      input-type="email"
      :passthrough-attrs="{ autocomplete: 'email', name: 'email' }"
      class="mb-2"
    />
    <df-input
      :control="fields.password"
      :label="t('auth.password')"
      input-type="password"
      :passthrough-attrs="{ autocomplete: 'current-password', name: 'password' }"
    />
    <v-alert v-if="error" type="error" variant="tonal" class="mt-2" role="alert">{{ error }}</v-alert>
    <v-btn type="submit" color="primary" variant="flat" block class="mt-4" :loading="submitting">
      {{ t('auth.login') }}
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import { Field, Group, Validators } from '@dynamicforms/vue-forms';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useAuthErrorText } from '../composables/auth-errors';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ initialError?: string }>();
const emit = defineEmits<{ loggedIn: [] }>();

const { t } = useI18n();
const session = useSessionStore();
const errorText = useAuthErrorText();

const fields = {
  email: new Field<string>({ value: '', validators: [new Validators.Required()] }),
  password: new Field<string>({ value: '', validators: [new Validators.Required({ trim: false })] }),
};
const form = new Group(fields);

const error = ref(props.initialError ?? '');
const submitting = ref(false);

async function submit() {
  error.value = '';
  fields.email.touched = true;
  fields.password.touched = true;
  await form.settled();
  if (!form.valid) return;
  submitting.value = true;
  try {
    await session.login(fields.email.value.trim(), fields.password.value);
    emit('loggedIn');
  } catch (e) {
    error.value = errorText(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
/* An autofilled input shows the floating label, as a filled one does. */
:deep(.v-field:has(input:is(:autofill, :-webkit-autofill)) .v-label.v-field-label) {
  visibility: hidden;
}
:deep(.v-field:has(input:is(:autofill, :-webkit-autofill)) .v-label.v-field-label--floating) {
  visibility: unset;
}
</style>
