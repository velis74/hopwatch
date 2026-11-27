import axios, { type AxiosResponse } from 'axios';

/** Base path of the allauth headless API for browser clients (session cookie, CSRF token). */
export const ALLAUTH_BROWSER = '/_allauth/browser/v1';

export interface AllauthProvider {
  id: string;
  name: string;
  flows: string[];
}

export interface AllauthConfig {
  socialaccount?: { providers: AllauthProvider[] };
}

export interface AllauthUser {
  id: number;
  email: string;
  display: string;
}

export interface AllauthError {
  message: string;
  code: string;
  param?: string;
}

interface AllauthEnvelope<T> {
  status: number;
  data: T;
  meta?: { is_authenticated?: boolean };
  errors?: AllauthError[];
}

const client = axios.create({
  baseURL: ALLAUTH_BROWSER,
  withCredentials: true,
  // allauth answers 401 for "not logged in" and 409/400 with a body that carries the details.
  validateStatus: () => true,
});

/** The value of Django's `csrftoken` cookie, or an empty string before the first allauth response sets it. */
export function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function ensureCsrfToken(): Promise<string> {
  if (!csrfToken()) await client.get('/config');
  return csrfToken();
}

/** An allauth response other than the expected one, with the errors allauth reported. */
export class AllauthRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errors: AllauthError[],
  ) {
    super(errors[0]?.message ?? `allauth answered ${status}`);
  }
}

function unwrap<T>(response: AxiosResponse<AllauthEnvelope<T>>): AllauthEnvelope<T> {
  if (response.status >= 200 && response.status < 300) return response.data;
  throw new AllauthRequestError(response.status, response.data?.errors ?? []);
}

export async function fetchConfig(): Promise<AllauthConfig> {
  return unwrap(await client.get<AllauthEnvelope<AllauthConfig>>('/config')).data;
}

/** The logged-in user, or null when the session is anonymous. */
export async function fetchSession(): Promise<AllauthUser | null> {
  const response = await client.get<AllauthEnvelope<{ user?: AllauthUser }>>('/auth/session');
  if (response.status === 200) return response.data.data.user ?? null;
  if (response.status === 401 || response.status === 410) return null;
  throw new AllauthRequestError(response.status, response.data?.errors ?? []);
}

async function post<T>(path: string, body: object): Promise<AllauthEnvelope<T>> {
  const token = await ensureCsrfToken();
  return unwrap(await client.post<AllauthEnvelope<T>>(path, body, { headers: { 'X-CSRFToken': token } }));
}

export async function login(email: string, password: string): Promise<AllauthUser | null> {
  return (await post<{ user?: AllauthUser }>('/auth/login', { email, password })).data.user ?? null;
}

export async function signup(email: string, password: string): Promise<AllauthUser | null> {
  return (await post<{ user?: AllauthUser }>('/auth/signup', { email, password })).data.user ?? null;
}

export async function logout(): Promise<void> {
  const token = await ensureCsrfToken();
  // A successful logout answers 401: the session is now anonymous.
  const response = await client.delete('/auth/session', { headers: { 'X-CSRFToken': token } });
  if (response.status !== 401 && (response.status < 200 || response.status >= 300)) {
    throw new AllauthRequestError(response.status, response.data?.errors ?? []);
  }
}

/**
 * Starts a social login: a regular form POST, so the browser follows allauth's redirect to the provider and
 * back to `callbackUrl`.
 */
export async function redirectToProvider(provider: string, callbackUrl: string): Promise<void> {
  const token = await ensureCsrfToken();
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${ALLAUTH_BROWSER}/auth/provider/redirect`;
  form.hidden = true;
  const fields = { provider, process: 'login', callback_url: callbackUrl, csrfmiddlewaretoken: token };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
