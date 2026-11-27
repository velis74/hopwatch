import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { allauthBody, HttpResponse, mockAllauth, mockAnonymousSession, mockApi } from '../test-utils';

import { useSessionStore } from './session';

const USER = { id: 7, email: 'ana@example.com', display: 'Ana' };
const ACCOUNT = { id: 7, email: 'ana@example.com', display_name: 'Ana Novak' };

function mockLoggedInSession() {
  mockAllauth('get', '/auth/session', allauthBody(200, { user: USER }, { meta: { is_authenticated: true } }));
}

function mockAnonymous() {
  mockAllauth('get', '/auth/session', allauthBody(401, { flows: [] }), { status: 401 });
}

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.cookie = 'csrftoken=test-token; path=/';
  });

  it('starts unchecked and logged out', () => {
    const session = useSessionStore();

    expect(session.checked).toBe(false);
    expect(session.loggedIn).toBe(false);
    expect(session.providers).toEqual([]);
  });

  describe('initialise', () => {
    it('offers the supported providers allauth has configured, in the app’s order', async () => {
      const providers = ['facebook', 'apple', 'google'].map((id) => ({ id, name: id, flows: ['provider_redirect'] }));
      mockAllauth('get', '/config', allauthBody(200, { socialaccount: { providers } }));
      mockAnonymous();
      const session = useSessionStore();

      await session.initialise();

      expect(session.providers).toEqual(['google', 'apple']);
      expect(session.checked).toBe(true);
      expect(session.loggedIn).toBe(false);
    });

    it('offers no providers when social login is not configured', async () => {
      mockAllauth('get', '/config', allauthBody(200, {}));
      mockAnonymous();
      const session = useSessionStore();

      await session.initialise();

      expect(session.providers).toEqual([]);
    });

    it('offers no providers but still checks the session when the configuration fails', async () => {
      mockAllauth('get', '/config', () => HttpResponse.error());
      mockLoggedInSession();
      mockApi('get', '/account/me', ACCOUNT);
      const session = useSessionStore();

      await session.initialise();

      expect(session.providers).toEqual([]);
      expect(session.checked).toBe(true);
      expect(session.account).toEqual(ACCOUNT);
    });

    it('is anonymous for the default anonymous session', async () => {
      mockAnonymousSession();
      const session = useSessionStore();

      await session.initialise();

      expect(session.checked).toBe(true);
      expect(session.account).toBeNull();
    });
  });

  describe('refresh', () => {
    it('loads the Hopwatch account of the logged-in user', async () => {
      mockLoggedInSession();
      mockApi('get', '/account/me', ACCOUNT);
      const session = useSessionStore();

      await session.refresh();

      expect(session.loggedIn).toBe(true);
      expect(session.account).toEqual(ACCOUNT);
    });

    it('falls back to allauth’s user when the account cannot be loaded', async () => {
      mockLoggedInSession();
      mockApi('get', '/account/me', { detail: 'down' }, { status: 503 });
      const session = useSessionStore();

      await session.refresh();

      expect(session.account).toEqual({ id: 7, email: 'ana@example.com', display_name: 'Ana' });
    });

    it('is logged out when the session cannot be read', async () => {
      mockLoggedInSession();
      mockApi('get', '/account/me', ACCOUNT);
      const session = useSessionStore();
      await session.refresh();
      mockAllauth('get', '/auth/session', () => HttpResponse.error());

      await session.refresh();

      expect(session.loggedIn).toBe(false);
    });
  });

  it('logs in and loads the account', async () => {
    const requests = mockAllauth('post', '/auth/login', allauthBody(200, { user: USER }));
    mockLoggedInSession();
    mockApi('get', '/account/me', ACCOUNT);
    const session = useSessionStore();

    await session.login('ana@example.com', 'secret');

    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'secret' });
    expect(session.account).toEqual(ACCOUNT);
  });

  it('leaves the session logged out when the login is refused', async () => {
    mockAllauth('post', '/auth/login', allauthBody(400, {}, { errors: [{ code: 'x', message: 'No.' }] }), {
      status: 400,
    });
    const session = useSessionStore();

    await expect(session.login('ana@example.com', 'wrong')).rejects.toThrow('No.');

    expect(session.loggedIn).toBe(false);
  });

  it('signs up and loads the account', async () => {
    const requests = mockAllauth('post', '/auth/signup', allauthBody(200, { user: USER }));
    mockLoggedInSession();
    mockApi('get', '/account/me', ACCOUNT);
    const session = useSessionStore();

    await session.signup('ana@example.com', 'long-secret');

    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'long-secret' });
    expect(session.loggedIn).toBe(true);
  });

  describe('logout', () => {
    beforeEach(() => {
      mockLoggedInSession();
      mockApi('get', '/account/me', ACCOUNT);
    });

    it('ends the session', async () => {
      const session = useSessionStore();
      await session.refresh();
      const requests = mockAllauth('delete', '/auth/session', allauthBody(401, {}), { status: 401 });

      await session.logout();

      expect(requests).toHaveLength(1);
      expect(session.loggedIn).toBe(false);
    });

    it('reloads the session and reports the error when the logout fails', async () => {
      const session = useSessionStore();
      await session.refresh();
      mockAllauth('delete', '/auth/session', allauthBody(500, {}, { errors: [{ code: 'x', message: 'Failed.' }] }), {
        status: 500,
      });
      mockApi('get', '/account/me', { ...ACCOUNT, display_name: 'Ana N.' });

      await expect(session.logout()).rejects.toThrow('Failed.');

      expect(session.account).toEqual({ ...ACCOUNT, display_name: 'Ana N.' });
    });
  });

  it('logs in with a provider and asks allauth to return to the login page', async () => {
    const submitted: HTMLFormElement[] = [];
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      submitted.push(this);
    });
    const session = useSessionStore();

    await session.loginWith('apple');

    const fields = Object.fromEntries(new FormData(submitted[0]));
    expect(fields.provider).toBe('apple');
    expect(fields.callback_url).toBe(`${window.location.origin}/login`);
  });
});
