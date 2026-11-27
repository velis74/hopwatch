import type { VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '../stores/session';
import { flushPromises, mountApp } from '../test-utils';

import SocialLoginButtons from './social-login-buttons.vue';

function buttons(wrapper: VueWrapper) {
  return wrapper.findAll('button');
}

/** Captures the provider redirect form instead of leaving the page. */
function captureRedirects(): HTMLFormElement[] {
  const submitted: HTMLFormElement[] = [];
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    submitted.push(this);
  });
  return submitted;
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
    const submitted = captureRedirects();
    const { wrapper } = await mountWith(['google', 'apple']);

    await buttons(wrapper)[1].trigger('click');
    await flushPromises();

    expect(submitted).toHaveLength(1);
    const fields = Object.fromEntries(new FormData(submitted[0]));
    expect(fields).toMatchObject({ provider: 'apple', callback_url: `${window.location.origin}/login` });
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

  it('stops listening for restored pages once it is gone', async () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    const { wrapper } = await mountWith(['google']);

    wrapper.unmount();

    expect(removed).toHaveBeenCalledWith('pageshow', expect.any(Function));
  });
});
