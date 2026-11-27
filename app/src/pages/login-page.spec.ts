import type { VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '../stores/session';
import { flushPromises, mockApi, mockSession, mountApp } from '../test-utils';

import LoginPage from './login-page.vue';

const LOGGED_IN = { is_authenticated: true, session_token: null };

function input(wrapper: VueWrapper, label: string) {
  const element = wrapper.findAll('label').find((candidate) => candidate.text() === label);
  if (!element) throw new Error(`no label "${label}"`);
  return wrapper.get(`#${element.attributes('for')}`);
}

describe('login page', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-token; path=/';
  });

  it('shows the login form, the social providers and a link to create an account', async () => {
    const { wrapper, pinia } = await mountApp(LoginPage, { route: '/login' });
    useSessionStore(pinia).providers = ['google'];
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Log in');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Log in', 'Continue with Google']);
    expect(wrapper.text()).toContain('No account yet?');
    expect(wrapper.get('a').text()).toBe('Create an account');
    expect(wrapper.get('a').attributes('href')).toBe('/signup');
  });

  it('opens the home page after a successful login', async () => {
    mockApi('post', '/account/login', LOGGED_IN);
    mockSession({ id: 7, email: 'ana@example.com', display_name: 'Ana' });
    const { wrapper, router } = await mountApp(LoginPage, { route: '/login' });

    await input(wrapper, 'Email').setValue('ana@example.com');
    await input(wrapper, 'Password').setValue('secret');
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('home');
  });

  it('explains a failed provider login the server returned with', async () => {
    const { wrapper } = await mountApp(LoginPage, { route: '/login?error=cancelled' });

    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Logging in with the provider did not succeed. Please try again.',
    );
  });

  it('opens the home page when the session turns out to be logged in already', async () => {
    const { router, pinia } = await mountApp(LoginPage, { route: '/login' });
    const session = useSessionStore(pinia);

    session.account = { id: 7, email: 'ana@example.com', display_name: 'Ana' };
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('login');

    session.checked = true;
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('home');
  });
});
