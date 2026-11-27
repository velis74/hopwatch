import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { browser } from '../api/account';
import { apiError, HttpResponse, mockAnonymousSession, mockApi, mockSession, validationError } from '../test-utils';

import { useSessionStore } from './session';

const ACCOUNT = { id: 7, email: 'ana@example.com', display_name: 'Ana Novak' };
const LOGGED_IN = { is_authenticated: true, session_token: null };

function provider(id: string, flows = ['redirect', 'token']) {
  return { id, name: id, flows, client_id: null };
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
    it('offers the supported providers with a browser login, in the app’s order', async () => {
      mockApi('get', '/account/providers', [
        provider('facebook'),
        provider('apple'),
        provider('google'),
        provider('github', ['token']),
      ]);
      mockSession(null);
      const session = useSessionStore();

      await session.initialise();

      expect(session.providers).toEqual(['google', 'apple']);
      expect(session.checked).toBe(true);
      expect(session.loggedIn).toBe(false);
    });

    it('leaves out a provider without a browser login', async () => {
      mockApi('get', '/account/providers', [provider('google', ['token'])]);
      mockSession(null);
      const session = useSessionStore();

      await session.initialise();

      expect(session.providers).toEqual([]);
    });

    it('offers no providers but still checks the session when the providers fail', async () => {
      mockApi('get', '/account/providers', () => HttpResponse.error());
      mockSession(ACCOUNT);
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
    it('loads the account of the logged-in user', async () => {
      mockSession(ACCOUNT);
      const session = useSessionStore();

      await session.refresh();

      expect(session.loggedIn).toBe(true);
      expect(session.account).toEqual(ACCOUNT);
    });

    it('is logged out when the session cannot be read', async () => {
      mockSession(ACCOUNT);
      const session = useSessionStore();
      await session.refresh();
      mockApi('get', '/account/session', () => HttpResponse.error());

      await session.refresh();

      expect(session.loggedIn).toBe(false);
    });
  });

  it('logs in and loads the account', async () => {
    const requests = mockApi('post', '/account/login', LOGGED_IN);
    mockSession(ACCOUNT);
    const session = useSessionStore();

    await session.login('ana@example.com', 'secret');

    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'secret' });
    expect(session.account).toEqual(ACCOUNT);
  });

  it('leaves the session logged out when the login is refused', async () => {
    mockApi('post', '/account/login', validationError({ password: ['hopwatch.email_password_mismatch'] }), {
      status: 422,
    });
    const session = useSessionStore();

    await expect(session.login('ana@example.com', 'wrong')).rejects.toThrow();

    expect(session.loggedIn).toBe(false);
  });

  it('signs up and loads the account', async () => {
    const requests = mockApi('post', '/account/signup', LOGGED_IN);
    mockSession(ACCOUNT);
    const session = useSessionStore();

    await session.signup('ana@example.com', 'long-secret');

    expect(requests[0].body).toEqual({ email: 'ana@example.com', password: 'long-secret' });
    expect(session.loggedIn).toBe(true);
  });

  describe('logout', () => {
    beforeEach(() => {
      mockSession(ACCOUNT);
    });

    it('ends the session', async () => {
      const session = useSessionStore();
      await session.refresh();
      const requests = mockApi('post', '/account/logout', { is_authenticated: false, session_token: null });

      await session.logout();

      expect(requests).toHaveLength(1);
      expect(session.loggedIn).toBe(false);
    });

    it('reloads the session and reports the error when the logout fails', async () => {
      const session = useSessionStore();
      await session.refresh();
      mockApi('post', '/account/logout', apiError('hopwatch.csrf_failed'), { status: 403 });
      mockSession({ ...ACCOUNT, display_name: 'Ana N.' });

      await expect(session.logout()).rejects.toThrow();

      expect(session.account).toEqual({ ...ACCOUNT, display_name: 'Ana N.' });
    });
  });

  it('logs in with a provider and asks the server to return to the login page', async () => {
    const requests = mockApi('post', '/account/social/redirect', { location: 'https://appleid.example/auth' });
    const navigate = vi.spyOn(browser, 'navigate').mockImplementation(() => undefined);
    const session = useSessionStore();

    await session.loginWith('apple');

    expect(requests[0].body).toEqual({ provider: 'apple', callback_url: `${window.location.origin}/login` });
    expect(navigate).toHaveBeenCalledWith('https://appleid.example/auth');
  });
});
