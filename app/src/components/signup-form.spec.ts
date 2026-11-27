import type { VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { flushPromises, mockApi, mockSession, mountApp, validationError } from '../test-utils';

import SignupForm from './signup-form.vue';

const LOGGED_IN = { is_authenticated: true, session_token: null };

/** The input labelled `label`. */
function input(wrapper: VueWrapper, label: string) {
  const element = wrapper.findAll('label').find((candidate) => candidate.text() === label);
  if (!element) throw new Error(`no label "${label}"`);
  return wrapper.get(`#${element.attributes('for')}`);
}

function createAccountButton(wrapper: VueWrapper) {
  const found = wrapper.findAll('button').find((candidate) => candidate.text() === 'Create account');
  if (!found) throw new Error('no button "Create account"');
  return found;
}

async function signUp(wrapper: VueWrapper, email: string, password: string, repeated: string) {
  await input(wrapper, 'Email').setValue(email);
  await input(wrapper, 'Password').setValue(password);
  await input(wrapper, 'Repeat password').setValue(repeated);
  await createAccountButton(wrapper).trigger('click');
  await flushPromises();
}

describe('signup form', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-token; path=/';
  });

  it('asks for an email address and a new password twice', async () => {
    const { wrapper } = await mountApp(SignupForm);

    expect(input(wrapper, 'Email').attributes('type')).toBe('email');
    expect(input(wrapper, 'Password').attributes()).toMatchObject({ type: 'password', autocomplete: 'new-password' });
    expect(input(wrapper, 'Repeat password').attributes()).toMatchObject({
      type: 'password',
      autocomplete: 'new-password',
    });
  });

  it('requires every field and sends nothing without them', async () => {
    const requests = mockApi('post', '/account/signup', LOGGED_IN);
    const { wrapper } = await mountApp(SignupForm);

    await createAccountButton(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.text().match(/This field is required\./g)).toHaveLength(3);
    expect(requests).toHaveLength(0);
  });

  it('refuses passwords that do not match', async () => {
    const requests = mockApi('post', '/account/signup', LOGGED_IN);
    const { wrapper } = await mountApp(SignupForm);

    await signUp(wrapper, 'ana@example.com', 'long-secret', 'long-secreT');

    expect(wrapper.text()).toContain('The passwords do not match.');
    expect(requests).toHaveLength(0);
    expect(wrapper.emitted('signedUp')).toBeUndefined();
  });

  it('creates the account with the trimmed email and reports success', async () => {
    const requests = mockApi('post', '/account/signup', LOGGED_IN);
    mockSession({ id: 7, email: 'ana@example.com', display_name: 'Ana' });
    const { wrapper } = await mountApp(SignupForm);

    await signUp(wrapper, ' ana@example.com ', 'long-secret', 'long-secret');

    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'long-secret' });
    expect(wrapper.emitted('signedUp')).toHaveLength(1);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows every reason the server refused the account', async () => {
    const errors = validationError({ email: ['hopwatch.email_taken'], password: ['hopwatch.password_too_common'] });
    mockApi('post', '/account/signup', errors, { status: 422 });
    const { wrapper } = await mountApp(SignupForm);

    await signUp(wrapper, 'ana@example.com', 'password', 'password');

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'An account with this email address already exists. This password is too common.',
    );
    expect(wrapper.emitted('signedUp')).toBeUndefined();
    expect(wrapper.find('.v-btn--loading').exists()).toBe(false);
  });
});
