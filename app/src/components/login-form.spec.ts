import type { VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { allauthBody, flushPromises, HttpResponse, mockAllauth, mockApi, mountApp } from '../test-utils';

import LoginForm from './login-form.vue';

const USER = { id: 7, email: 'ana@example.com', display: 'Ana' };

/** The input labelled `label`. */
function input(wrapper: VueWrapper, label: string) {
  const element = wrapper.findAll('label').find((candidate) => candidate.text() === label);
  if (!element) throw new Error(`no label "${label}"`);
  return wrapper.get(`#${element.attributes('for')}`);
}

function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((candidate) => candidate.text() === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

async function logIn(wrapper: VueWrapper, email: string, password: string) {
  await input(wrapper, 'Email').setValue(email);
  await input(wrapper, 'Password').setValue(password);
  await button(wrapper, 'Log in').trigger('click');
  await flushPromises();
}

describe('login form', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-token; path=/';
  });

  it('asks for an email address and a password', async () => {
    const { wrapper } = await mountApp(LoginForm);

    expect(input(wrapper, 'Email').attributes()).toMatchObject({ type: 'email', autocomplete: 'email' });
    expect(input(wrapper, 'Password').attributes()).toMatchObject({
      type: 'password',
      autocomplete: 'current-password',
    });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('requires both fields and sends nothing without them', async () => {
    const requests = mockAllauth('post', '/auth/login', allauthBody(200, { user: USER }));
    const { wrapper } = await mountApp(LoginForm);

    await button(wrapper, 'Log in').trigger('click');
    await flushPromises();

    expect(wrapper.text().match(/This field is required\./g)).toHaveLength(2);
    expect(requests).toHaveLength(0);
    expect(wrapper.emitted('loggedIn')).toBeUndefined();
  });

  it('logs in with the trimmed email and the password as typed', async () => {
    const requests = mockAllauth('post', '/auth/login', allauthBody(200, { user: USER }));
    mockAllauth('get', '/auth/session', allauthBody(200, { user: USER }));
    mockApi('get', '/account/me', { id: 7, email: 'ana@example.com', display_name: 'Ana' });
    const { wrapper } = await mountApp(LoginForm);

    await logIn(wrapper, '  ana@example.com ', ' secret ');

    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: ' secret ' });
    expect(wrapper.emitted('loggedIn')).toHaveLength(1);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows why allauth refused the login and keeps the user on the form', async () => {
    mockAllauth(
      'post',
      '/auth/login',
      allauthBody(400, {}, { errors: [{ code: 'email_password_mismatch', message: 'x', param: 'password' }] }),
      { status: 400 },
    );
    const { wrapper } = await mountApp(LoginForm);

    await logIn(wrapper, 'ana@example.com', 'wrong');

    expect(wrapper.get('[role="alert"]').text()).toBe('The email address or password is incorrect.');
    expect(wrapper.emitted('loggedIn')).toBeUndefined();
    expect(button(wrapper, 'Log in').attributes('disabled')).toBeUndefined();
  });

  it('shows a busy button while the login is under way', async () => {
    let answer!: () => void;
    mockAllauth(
      'post',
      '/auth/login',
      () =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(HttpResponse.json(allauthBody(400, {}), { status: 400 }));
        }),
    );
    const { wrapper } = await mountApp(LoginForm);

    await logIn(wrapper, 'ana@example.com', 'secret');

    expect(wrapper.find('.v-btn--loading').exists()).toBe(true);
    answer();
    await flushPromises();
    expect(wrapper.find('.v-btn--loading').exists()).toBe(false);
    expect(wrapper.get('[role="alert"]').text()).toBe('Something went wrong. Please try again.');
  });

  it('shows the error it was opened with until the next attempt', async () => {
    mockAllauth('post', '/auth/login', allauthBody(200, { user: USER }));
    mockAllauth('get', '/auth/session', allauthBody(200, { user: USER }));
    mockApi('get', '/account/me', { id: 7, email: 'ana@example.com', display_name: 'Ana' });
    const { wrapper } = await mountApp(LoginForm, { props: { initialError: 'The provider login failed.' } });

    expect(wrapper.get('[role="alert"]').text()).toBe('The provider login failed.');

    await logIn(wrapper, 'ana@example.com', 'secret');

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
