import { describe, expect, it, vi } from 'vitest';

import { allauthBody, HttpResponse, mockAllauth } from '../test-utils';

import {
  AllauthRequestError,
  csrfToken,
  fetchConfig,
  fetchSession,
  login,
  logout,
  redirectToProvider,
  signup,
} from './allauth';

const USER = { id: 7, email: 'ana@example.com', display: 'Ana' };

/** A `/config` answer that sets the CSRF cookie, as Django does on the first allauth response. */
function mockConfigSettingCookie(token = 'fresh-token') {
  return mockAllauth('get', '/config', () => {
    document.cookie = `csrftoken=${token}; path=/`;
    return HttpResponse.json(allauthBody(200, {}));
  });
}

async function failure(promise: Promise<unknown>): Promise<AllauthRequestError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AllauthRequestError) return error;
    throw error;
  }
  throw new Error('the request succeeded');
}

describe('csrfToken', () => {
  it('is empty before allauth set the cookie', () => {
    expect(csrfToken()).toBe('');
  });

  it('reads the decoded csrftoken cookie among others', () => {
    document.cookie = 'theme=dark; path=/';
    document.cookie = 'csrftoken=a%2Bb; path=/';

    expect(csrfToken()).toBe('a+b');
  });
});

describe('fetchConfig', () => {
  it('gives the configured social providers', async () => {
    const providers = [{ id: 'google', name: 'Google', flows: ['provider_redirect'] }];
    mockAllauth('get', '/config', allauthBody(200, { socialaccount: { providers } }));

    await expect(fetchConfig()).resolves.toEqual({ socialaccount: { providers } });
  });

  it('reports a failed answer with allauth’s errors', async () => {
    mockAllauth('get', '/config', allauthBody(503, {}, { errors: [{ code: 'down', message: 'Maintenance.' }] }), {
      status: 503,
    });

    const error = await failure(fetchConfig());

    expect(error.status).toBe(503);
    expect(error.message).toBe('Maintenance.');
    expect(error.errors).toEqual([{ code: 'down', message: 'Maintenance.' }]);
  });

  it('names the status when the failed answer carries no body', async () => {
    mockAllauth('get', '/config', () => new HttpResponse(null, { status: 502 }));

    const error = await failure(fetchConfig());

    expect(error.errors).toEqual([]);
    expect(error.message).toBe('allauth answered 502');
  });
});

describe('fetchSession', () => {
  it('gives the logged-in user', async () => {
    mockAllauth('get', '/auth/session', allauthBody(200, { user: USER }, { meta: { is_authenticated: true } }));

    await expect(fetchSession()).resolves.toEqual(USER);
  });

  it('gives nothing for a session answer without a user', async () => {
    mockAllauth('get', '/auth/session', allauthBody(200, {}));

    await expect(fetchSession()).resolves.toBeNull();
  });

  it.each([401, 410])('gives nothing for an anonymous or expired session (%i)', async (status) => {
    mockAllauth('get', '/auth/session', allauthBody(status, { flows: [] }), { status });

    await expect(fetchSession()).resolves.toBeNull();
  });

  it('reports any other answer', async () => {
    mockAllauth('get', '/auth/session', () => new HttpResponse(null, { status: 500 }));

    const error = await failure(fetchSession());

    expect(error.status).toBe(500);
  });
});

describe('login and signup', () => {
  it('logs in with the email and password and the CSRF token', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    const requests = mockAllauth('post', '/auth/login', allauthBody(200, { user: USER }));

    await expect(login('ana@example.com', 'secret')).resolves.toEqual(USER);

    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'secret' });
    expect(requests[0].headers.get('X-CSRFToken')).toBe('known-token');
  });

  it('fetches the configuration first when the CSRF cookie is missing', async () => {
    const config = mockConfigSettingCookie('fresh-token');
    const requests = mockAllauth('post', '/auth/signup', allauthBody(200, { user: USER }));

    await expect(signup('ana@example.com', 'secret')).resolves.toEqual(USER);

    expect(config).toHaveLength(1);
    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'secret' });
    expect(requests[0].headers.get('X-CSRFToken')).toBe('fresh-token');
  });

  it('gives nothing when allauth needs a further step before the user is logged in', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    mockAllauth('post', '/auth/signup', allauthBody(200, { flows: [] }));
    mockAllauth('post', '/auth/login', allauthBody(200, { flows: [] }));

    await expect(signup('ana@example.com', 'secret')).resolves.toBeNull();
    await expect(login('ana@example.com', 'secret')).resolves.toBeNull();
  });

  it('reports a refused login with allauth’s errors', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    const errors = [{ code: 'email_password_mismatch', message: 'Wrong.', param: 'password' }];
    mockAllauth('post', '/auth/login', allauthBody(400, {}, { errors }), { status: 400 });

    const error = await failure(login('ana@example.com', 'wrong'));

    expect(error.status).toBe(400);
    expect(error.errors).toEqual(errors);
  });
});

describe('logout', () => {
  it.each([401, 200])('ends the session with the CSRF token (answer %i)', async (status) => {
    document.cookie = 'csrftoken=known-token; path=/';
    const requests = mockAllauth('delete', '/auth/session', allauthBody(status, {}), { status });

    await expect(logout()).resolves.toBeUndefined();

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get('X-CSRFToken')).toBe('known-token');
  });

  it('reports a refused logout', async () => {
    mockConfigSettingCookie();
    const errors = [{ code: 'csrf', message: 'CSRF failed.' }];
    mockAllauth('delete', '/auth/session', allauthBody(403, {}, { errors }), { status: 403 });

    const error = await failure(logout());

    expect(error.status).toBe(403);
    expect(error.message).toBe('CSRF failed.');
  });

  it('reports a failed logout without a body', async () => {
    document.cookie = 'csrftoken=known-token; path=/';
    mockAllauth('delete', '/auth/session', () => new HttpResponse(null, { status: 500 }));

    expect((await failure(logout())).status).toBe(500);
  });
});

describe('redirectToProvider', () => {
  it('posts a form to allauth’s provider redirect with the provider, callback and CSRF token', async () => {
    mockConfigSettingCookie('form-token');
    const submitted: HTMLFormElement[] = [];
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      submitted.push(this);
    });

    await redirectToProvider('google', 'https://hopwatch.test/login');

    expect(submitted).toHaveLength(1);
    const form = submitted[0];
    expect(form.isConnected).toBe(true);
    expect(form.method).toBe('post');
    expect(new URL(form.action).pathname).toBe('/_allauth/browser/v1/auth/provider/redirect');
    expect(Object.fromEntries(new FormData(form))).toEqual({
      provider: 'google',
      process: 'login',
      callback_url: 'https://hopwatch.test/login',
      csrfmiddlewaretoken: 'form-token',
    });
  });
});
