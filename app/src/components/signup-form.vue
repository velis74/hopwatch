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
      :passthrough-attrs="{ autocomplete: 'new-password', name: 'password' }"
      class="mb-2"
    />
    <df-input
      :control="fields.repeatPassword"
      :label="t('auth.repeatPassword')"
      input-type="password"
      :passthrough-attrs="{ autocomplete: 'new-password', name: 'repeat-password' }"
    />
    <v-alert v-if="error" type="error" variant="tonal" class="mt-2" role="alert">{{ error }}</v-alert>
    <v-btn type="submit" color="primary" variant="flat" block class="mt-4" :loading="submitting">
      {{ t('auth.createAccount') }}
    </v-btn>
  </v-form>
</template>

<script setup lang="ts">
import { Field, Group, Validators } from '@dynamicforms/vue-forms';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { useAuthErrorText } from '../composables/auth-errors';
import { useSessionStore } from '../stores/session';

const emit = defineEmits<{ signedUp: [] }>();

const { t } = useI18n();
const session = useSessionStore();
const errorText = useAuthErrorText();

const fields = {
  email: new Field<string>({ value: '', validators: [new Validators.Required()] }),
  password: new Field<string>({ value: '', validators: [new Validators.Required({ trim: false })] }),
  repeatPassword: new Field<string>({
    value: '',
    validators: [
      new Validators.Required({ trim: false }),
      new Validators.CompareTo('password', (mine: string, other: string) => mine === other, {
        code: 'hopwatch.passwords_mismatch',
      }),
    ],
  }),
};
const form = new Group(fields);

const error = ref('');
const submitting = ref(false);

async function submit() {
  error.value = '';
  for (const field of Object.values(fields)) field.touched = true;
  await form.settled();
  if (!form.valid) return;
  submitting.value = true;
  try {
    await session.signup(fields.email.value.trim(), fields.password.value);
    emit('signedUp');
  } catch (e) {
    error.value = errorText(e);
  } finally {
    submitting.value = false;
  }
}
</script>
