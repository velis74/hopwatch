import { api, type Account } from './hopwatch-api';

/** The session after a call that may change it. */
export interface SessionResult {
  is_authenticated: boolean;
  /** Set for an app client only; a browser's session is the session cookie. */
  session_token: string | null;
}

export interface SessionState extends SessionResult {
  account: Account | null;
}

export type ProviderFlow = 'redirect' | 'token';

export interface Provider {
  id: string;
  name: string;
  flows: ProviderFlow[];
  client_id: string | null;
}

/** Leaving the page for a social provider; replaced in specs. */
export const browser = {
  navigate(url: string): void {
    window.location.assign(url);
  },
};

/** The value of the `csrftoken` cookie, or an empty string before `GET /account/session` sets it. */
export function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/** The session and its user; also sets the CSRF cookie. */
export async function fetchSession(): Promise<SessionState> {
  return (await api.get<SessionState>('/account/session')).data;
}

export async function fetchProviders(): Promise<Provider[]> {
  return (await api.get<Provider[]>('/account/providers')).data;
}

/** The CSRF header of a `POST`; login and signup rotate the token, so it is read from the cookie for each call. */
async function csrfHeaders(): Promise<Record<string, string>> {
  if (!csrfToken()) await fetchSession();
  return { 'X-CSRFToken': csrfToken() };
}

async function post<T>(path: string, body: object = {}): Promise<T> {
  return (await api.post<T>(path, body, { headers: await csrfHeaders() })).data;
}

export async function login(email: string, password: string): Promise<SessionResult> {
  return post<SessionResult>('/account/login', { email, password });
}

export async function signup(email: string, password: string): Promise<SessionResult> {
  return post<SessionResult>('/account/signup', { email, password });
}

export async function logout(): Promise<void> {
  await post<SessionResult>('/account/logout');
}

/** Leaves for the provider's login page; the server brings the browser back to `callbackUrl`. */
export async function redirectToProvider(provider: string, callbackUrl: string): Promise<void> {
  const { location } = await post<{ location: string }>('/account/social/redirect', {
    provider,
    callback_url: callbackUrl,
  });
  browser.navigate(location);
}
