import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import { type AllauthError, login } from '../api/allauth';
import { allauthBody, mockAllauth, mountApp } from '../test-utils';

import { useAuthErrorText } from './auth-errors';

const ErrorText = defineComponent({
  props: { error: { type: null, required: true } },
  setup(props) {
    const text = useAuthErrorText();
    return () => h('p', { role: 'alert' }, text(props.error));
  },
});

/** The error of a login that allauth refuses with `errors`. */
async function refusedLogin(errors: AllauthError[], status = 400): Promise<unknown> {
  mockAllauth('post', '/auth/login', allauthBody(status, {}, { errors }), { status });
  try {
    await login('ana@example.com', 'secret');
  } catch (error) {
    return error;
  }
  throw new Error('the login succeeded');
}

async function shown(error: unknown, locale: 'en' | 'sl' = 'en'): Promise<string> {
  const { wrapper } = await mountApp(ErrorText, { props: { error }, locale });
  return wrapper.get('[role="alert"]').text();
}

describe('useAuthErrorText', () => {
  beforeEach(() => {
    document.cookie = 'csrftoken=test-token; path=/';
  });

  it.each([
    ['email_password_mismatch', 'The email address or password is incorrect.'],
    ['email_taken', 'An account with this email address already exists.'],
    ['password_too_short', 'The password is too short. It must contain at least 8 characters.'],
    ['password_too_common', 'This password is too common.'],
    ['password_entirely_numeric', 'The password cannot consist of digits only.'],
    ['password_too_similar', 'The password is too similar to the email address.'],
    ['too_many_login_attempts', 'Too many failed login attempts. Try again later.'],
  ])('explains allauth code %s in the interface language', async (code, text) => {
    const error = await refusedLogin([{ code, message: 'allauth text', param: 'password' }]);

    expect(await shown(error)).toBe(text);
  });

  it('explains an invalid email address', async () => {
    const error = await refusedLogin([{ code: 'invalid', message: 'Enter a valid email address.', param: 'email' }]);

    expect(await shown(error, 'sl')).not.toBe('Enter a valid email address.');
    expect(await shown(error)).toBe('Enter a valid email address.');
  });

  it('shows allauth’s own message for a code without a translation', async () => {
    const error = await refusedLogin([{ code: 'invalid', message: 'Password is not valid.', param: 'password' }]);

    expect(await shown(error)).toBe('Password is not valid.');
  });

  it('shows every reported error, one after another', async () => {
    const error = await refusedLogin([
      { code: 'password_too_short', message: 'too short', param: 'password' },
      { code: 'unlisted', message: 'Something else.', param: 'password' },
    ]);

    expect(await shown(error)).toBe(
      'The password is too short. It must contain at least 8 characters. Something else.',
    );
  });

  it('translates into Slovenian', async () => {
    const error = await refusedLogin([{ code: 'email_password_mismatch', message: 'allauth text' }]);

    const text = await shown(error, 'sl');

    expect(text).not.toBe('The email address or password is incorrect.');
    expect(text).not.toBe('allauth text');
  });

  it('gives a general message when allauth reports no details', async () => {
    const error = await refusedLogin([], 500);

    expect(await shown(error)).toBe('Something went wrong. Please try again.');
  });

  it('gives a general message for a failure outside allauth', async () => {
    expect(await shown(new TypeError('Failed to fetch'))).toBe('Something went wrong. Please try again.');
  });
});
