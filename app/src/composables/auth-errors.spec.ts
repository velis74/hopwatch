import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import { login } from '../api/account';
import { apiError, HttpResponse, mockApi, mountApp } from '../test-utils';

import { useAuthErrorText } from './auth-errors';

const ErrorText = defineComponent({
  props: { error: { type: null, required: true } },
  setup(props) {
    const text = useAuthErrorText();
    return () => h('p', { role: 'alert' }, text(props.error));
  },
});

type FieldErrors = Record<string, { code: string; detail: string }[]>;

/** The error of a login the server refuses with `body` and `status`. */
async function refused(body: object, status = 422): Promise<unknown> {
  mockApi('post', '/account/login', body, { status });
  try {
    await login('ana@example.com', 'secret');
  } catch (error) {
    return error;
  }
  throw new Error('the login succeeded');
}

function refusedFields(fields: FieldErrors): Promise<unknown> {
  const fieldErrors = Object.fromEntries(
    Object.entries(fields).map(([field, errors]) => [field, errors.map((error) => ({ ...error, params: {} }))]),
  );
  return refused({ ...apiError('fastapi-viewsets.validation_failed'), field_errors: fieldErrors });
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
    ['hopwatch.email_password_mismatch', 'The email address or password is incorrect.'],
    ['hopwatch.email_taken', 'An account with this email address already exists.'],
    ['hopwatch.password_too_short', 'The password is too short. It must contain at least 8 characters.'],
    ['hopwatch.password_too_common', 'This password is too common.'],
    ['hopwatch.password_entirely_numeric', 'The password cannot consist of digits only.'],
    ['hopwatch.password_too_similar', 'The password is too similar to the email address.'],
    ['hopwatch.too_many_login_attempts', 'Too many failed login attempts. Try again later.'],
  ])('explains the code %s in the interface language', async (code, text) => {
    const error = await refusedFields({ password: [{ code, detail: 'server text' }] });

    expect(await shown(error)).toBe(text);
  });

  it('explains an invalid email address', async () => {
    const error = await refusedFields({
      email: [{ code: 'fastapi-viewsets.invalid', detail: 'Enter a valid email address.' }],
    });

    expect(await shown(error, 'sl')).not.toBe('Enter a valid email address.');
    expect(await shown(error)).toBe('Enter a valid email address.');
  });

  it('shows the server’s own message for a code without a translation', async () => {
    const error = await refusedFields({ password: [{ code: 'fastapi-viewsets.invalid', detail: 'Not valid.' }] });

    expect(await shown(error)).toBe('Not valid.');
  });

  it('shows every reported error, one after another', async () => {
    const error = await refusedFields({
      password: [
        { code: 'hopwatch.password_too_short', detail: 'too short' },
        { code: 'hopwatch.unlisted', detail: 'Something else.' },
      ],
    });

    expect(await shown(error)).toBe(
      'The password is too short. It must contain at least 8 characters. Something else.',
    );
  });

  it('explains too many requests from the address', async () => {
    const error = await refused(apiError('hopwatch.too_many_requests'), 429);

    expect(await shown(error)).toBe('Too many failed login attempts. Try again later.');
  });

  it('translates into Slovenian', async () => {
    const error = await refusedFields({
      password: [{ code: 'hopwatch.email_password_mismatch', detail: 'server text' }],
    });

    const text = await shown(error, 'sl');

    expect(text).not.toBe('The email address or password is incorrect.');
    expect(text).not.toBe('server text');
  });

  it('gives a general message for an error without a known code', async () => {
    expect(await shown(await refused(apiError('hopwatch.csrf_failed'), 403))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('gives a general message for an answer that is not an error body', async () => {
    mockApi('post', '/account/login', () => new HttpResponse(null, { status: 500 }));
    const error = await login('ana@example.com', 'secret').catch((e: unknown) => e);

    expect(await shown(error)).toBe('Something went wrong. Please try again.');
  });

  it('gives a general message for a failure outside the API', async () => {
    expect(await shown(new TypeError('Failed to fetch'))).toBe('Something went wrong. Please try again.');
  });
});
