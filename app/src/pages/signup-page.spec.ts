import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { useSessionStore } from '../stores/session';
import { allauthBody, flushPromises, mockAllauth, mockApi, mountApp } from '../test-utils';

import SignupPage from './signup-page.vue';

const USER = { id: 7, email: 'ana@example.com', display: 'Ana' };

function input(wrapper: VueWrapper, label: string) {
  const element = wrapper.findAll('label').find((candidate) => candidate.text() === label);
  if (!element) throw new Error(`no label "${label}"`);
  return wrapper.get(`#${element.attributes('for')}`);
}

describe('signup page', () => {
  it('shows the signup form, the social providers and a link to log in', async () => {
    const { wrapper, pinia } = await mountApp(SignupPage, { route: '/signup' });
    useSessionStore(pinia).providers = ['apple'];
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Create an account');
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Create account', 'Continue with Apple']);
    expect(wrapper.text()).toContain('Already have an account?');
    expect(wrapper.get('a').text()).toBe('Log in to your account');
    expect(wrapper.get('a').attributes('href')).toBe('/login');
  });

  it('opens the home page once the account is created', async () => {
    document.cookie = 'csrftoken=test-token; path=/';
    mockAllauth('post', '/auth/signup', allauthBody(200, { user: USER }));
    mockAllauth('get', '/auth/session', allauthBody(200, { user: USER }));
    mockApi('get', '/account/me', { id: 7, email: 'ana@example.com', display_name: 'Ana' });
    const { wrapper, router } = await mountApp(SignupPage, { route: '/signup' });

    await input(wrapper, 'Email').setValue('ana@example.com');
    await input(wrapper, 'Password').setValue('long-secret');
    await input(wrapper, 'Repeat password').setValue('long-secret');
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('home');
  });
});
