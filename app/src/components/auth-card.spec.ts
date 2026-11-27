import { describe, expect, it } from 'vitest';

import { mountApp } from '../test-utils';

import AuthCard from './auth-card.vue';

describe('auth card', () => {
  it('shows the app name, the heading and its content', async () => {
    const { wrapper } = await mountApp(AuthCard, {
      props: { heading: 'Log in' },
      slots: { default: '<p>Form goes here</p>' },
    });

    expect(wrapper.get('h1').text()).toBe('Hopwatch');
    expect(wrapper.get('h2').text()).toBe('Log in');
    expect(wrapper.text()).toContain('Form goes here');
  });

  it('shows the logo as decoration only', async () => {
    const { wrapper } = await mountApp(AuthCard, { props: { heading: 'Log in' } });

    expect(wrapper.get('img').attributes('alt')).toBe('');
  });
});
