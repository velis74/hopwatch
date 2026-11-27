import { errorBodyOf } from '@dynamicforms/fastapi-viewsets';
import { describe, expect, it, vi } from 'vitest';

import { apiError, HttpResponse, mockApi, mockSession, validationError } from '../test-utils';

import { browser, csrfToken, fetchProviders, fetchSession, login, logout, redirectToProvider, signup } from './account';

const ACCOUNT = { id: 7, email: 'ana@example.com', display_name: 'Ana' };
const LOGGED_IN = { is_authenticated: true, session_token: null };

/** A `GET /account/session` that sets the CSRF cookie, as the server does. */
function mockSessionSettingCookie(token = 'fresh-token') {
  return mockApi('get', '/account/session', () => {
    document.cookie = `csrftoken=${token}; path=/`;
    return HttpResponse.json({ is_authenticated: false, session_token: null, account: null });
  });
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the request succeeded');
}

describe('csrfToken', () => {
  it('is empty before the server set the cookie', () => {
    expect(csrfToken()).toBe('');
  });

  it('reads the decoded csrftoken cookie among others', () => {
    document.cookie = 'theme=dark; path=/';
    document.cookie = 'csrftoken=a%2Bb; path=/';

    expect(csrfToken()).toBe('a+b');
  });
});

describe('fetchSession and fetchProviders', () => {
  it('gives the session and its user', async () => {
    mockSession(ACCOUNT);

    await expect(fetchSession()).resolves.toEqual({ ...LOGGED_IN, account: ACCOUNT });
  });

  it('gives an anonymous session without a user', async () => {
    mockSession(null);

    expect((await fetchSession()).account).toBeNull();
  });

  it('gives the configured providers', async () => {
    const providers = [{ id: 'google', name: 'Google', flows: ['redirect', 'token'], client_id: 'web' }];
    mockApi('get', '/account/providers', providers);

    await expect(fetchProviders()).resolves.toEqual(providers);
  });

  it('reports a failed answer with its error body', async () => {
    mockApi('get', '/account/session', apiError('hopwatch.anything'), { status: 503 });

    expect(errorBodyOf(await failure(fetchSession())).detail_code).toBe('hopwatch.anything');
  });
});

describe('login and signup', () => {
  it('logs in with the email, the password and the CSRF token', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    const requests = mockApi('post', '/account/login', LOGGED_IN);

    await expect(login('ana@example.com', 'secret')).resolves.toEqual(LOGGED_IN);

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'secret' });
    expect(requests[0].headers.get('X-CSRFToken')).toBe('known-token');
  });

  it('reads the session first when the CSRF cookie is missing', async () => {
    const session = mockSessionSettingCookie('fresh-token');
    const requests = mockApi('post', '/account/signup', LOGGED_IN);

    await expect(signup('ana@example.com', 'secret')).resolves.toEqual(LOGGED_IN);

    expect(session).toHaveLength(1);
    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'secret' });
    expect(requests[0].headers.get('X-CSRFToken')).toBe('fresh-token');
  });

  it('reads the CSRF token from the cookie for every call', async () => {
    document.cookie = 'csrftoken=before-login; path=/';
    mockApi('post', '/account/login', () => {
      document.cookie = 'csrftoken=after-login; path=/';
      return HttpResponse.json(LOGGED_IN);
    });
    const logouts = mockApi('post', '/account/logout', { is_authenticated: false, session_token: null });

    await login('ana@example.com', 'secret');
    await logout();

    expect(logouts[0].headers.get('X-CSRFToken')).toBe('after-login');
  });

  it('reports a refused login with its field errors', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    mockApi('post', '/account/login', validationError({ password: ['hopwatch.email_password_mismatch'] }), {
      status: 422,
    });

    const body = errorBodyOf(await failure(login('ana@example.com', 'wrong')));

    expect(body.field_errors.password[0].code).toBe('hopwatch.email_password_mismatch');
  });
});

describe('logout', () => {
  it('ends the session with the CSRF token', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    const requests = mockApi('post', '/account/logout', { is_authenticated: false, session_token: null });

    await expect(logout()).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('X-CSRFToken')).toBe('known-token');
  });

  it('reports a refused logout', async () => {
    mockSessionSettingCookie();
    mockApi('post', '/account/logout', apiError('hopwatch.csrf_failed'), { status: 403 });

    expect(errorBodyOf(await failure(logout())).detail_code).toBe('hopwatch.csrf_failed');
  });
});

describe('redirectToProvider', () => {
  it('asks for the provider’s page with the callback and the CSRF token, and goes there', async () => {
    mockSessionSettingCookie('redirect-token');
    const requests = mockApi('post', '/account/social/redirect', { location: 'https://accounts.example/auth' });
    const navigate = vi.spyOn(browser, 'navigate').mockImplementation(() => undefined);

    await redirectToProvider('google', 'https://hopwatch.test/login');

    expect(requests[0].body).toEqual({ provider: 'google', callback_url: 'https://hopwatch.test/login' });
    expect(requests[0].headers.get('X-CSRFToken')).toBe('redirect-token');
    expect(navigate).toHaveBeenCalledWith('https://accounts.example/auth');
  });

  it('stays on the page when the server refuses', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    mockApi('post', '/account/social/redirect', validationError({ provider: ['hopwatch.unknown_provider'] }), {
      status: 422,
    });
    const navigate = vi.spyOn(browser, 'navigate').mockImplementation(() => undefined);

    await failure(redirectToProvider('google', '/login'));

    expect(navigate).not.toHaveBeenCalled();
  });
});
