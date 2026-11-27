import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { browser } from '../api/account';
import { useSessionStore } from '../stores/session';
import { flushPromises, mockApi, mountApp, validationError } from '../test-utils';

import SocialLoginButtons from './social-login-buttons.vue';

function buttons(wrapper: VueWrapper) {
  return wrapper.findAll('button');
}

/** Answers the redirect request and captures the navigation to the provider instead of leaving the page. */
function captureRedirects() {
  const requests = mockApi('post', '/account/social/redirect', { location: 'https://provider.example/auth' });
  const navigate = vi.spyOn(browser, 'navigate').mockImplementation(() => undefined);
  return { requests, navigate };
}

async function mountWith(providers: ('google' | 'apple')[], locale: 'en' | 'sl' = 'en') {
  const mounted = await mountApp(SocialLoginButtons, { locale });
  useSessionStore(mounted.pinia).providers = providers;
  await flushPromises();
  return mounted;
}

describe('social login buttons', () => {
  it('shows nothing when no provider is configured', async () => {
    const { wrapper } = await mountWith([]);

    expect(wrapper.text()).toBe('');
    expect(buttons(wrapper)).toHaveLength(0);
  });

  it('offers each configured provider after an “or” separator', async () => {
    const { wrapper } = await mountWith(['google', 'apple']);

    expect(wrapper.text()).toContain('or');
    expect(buttons(wrapper).map((button) => button.text())).toEqual(['Continue with Google', 'Continue with Apple']);
  });

  it('names the providers in the interface language', async () => {
    const { wrapper } = await mountWith(['apple'], 'sl');

    expect(buttons(wrapper)[0].text()).not.toBe('Continue with Apple');
    expect(buttons(wrapper)[0].text()).toContain('Apple');
  });

  it('starts the provider login, returning to the login page, and shows the button busy', async () => {
    document.cookie = 'csrftoken=test-token; path=/';
    const { requests, navigate } = captureRedirects();
    const { wrapper } = await mountWith(['google', 'apple']);

    await buttons(wrapper)[1].trigger('click');
    await flushPromises();

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ provider: 'apple', callback_url: `${window.location.origin}/login` });
    expect(navigate).toHaveBeenCalledWith('https://provider.example/auth');
    expect(buttons(wrapper)[1].classes()).toContain('v-btn--loading');
    expect(buttons(wrapper)[0].classes()).not.toContain('v-btn--loading');
  });

  it('is no longer busy when the browser brings the page back from its history', async () => {
    document.cookie = 'csrftoken=test-token; path=/';
    captureRedirects();
    const { wrapper } = await mountWith(['google']);
    await buttons(wrapper)[0].trigger('click');
    await flushPromises();

    window.dispatchEvent(new Event('pageshow'));
    await flushPromises();

    expect(buttons(wrapper)[0].classes()).not.toContain('v-btn--loading');
  });

  it('tells the user when the provider login cannot start, and is no longer busy', async () => {
    document.cookie = 'csrftoken=test-token; path=/';
    mockApi('post', '/account/social/redirect', validationError({ provider: ['hopwatch.unknown_provider'] }), {
      status: 422,
    });
    const navigate = vi.spyOn(browser, 'navigate').mockImplementation(() => undefined);
    const { wrapper } = await mountWith(['google']);

    await buttons(wrapper)[0].trigger('click');
    await flushPromises();

    expect(navigate).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Logging in with the provider did not succeed. Please try again.',
    );
    expect(buttons(wrapper)[0].classes()).not.toContain('v-btn--loading');
  });

  it('stops listening for restored pages once it is gone', async () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    const { wrapper } = await mountWith(['google']);

    wrapper.unmount();

    expect(removed).toHaveBeenCalledWith('pageshow', expect.any(Function));
  });
});
