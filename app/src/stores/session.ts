import { defineStore } from 'pinia';

import * as accountApi from '../api/account';
import type { Account } from '../api/hopwatch-api';

export const SOCIAL_PROVIDERS = ['google', 'apple'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const useSessionStore = defineStore('session', {
  state: () => ({
    account: null as Account | null,
    providers: [] as SocialProvider[],
    checked: false,
  }),
  getters: {
    loggedIn: (state) => state.account !== null,
  },
  actions: {
    /** Loads the social providers a browser can log in with and the logged-in user; sets the CSRF cookie. */
    async initialise(): Promise<void> {
      await this.refresh();
      try {
        const offered = (await accountApi.fetchProviders())
          .filter((provider) => provider.flows.includes('redirect'))
          .map((provider) => provider.id);
        this.providers = SOCIAL_PROVIDERS.filter((id) => offered.includes(id));
      } catch {
        this.providers = [];
      }
      this.checked = true;
    },

    async refresh(): Promise<void> {
      try {
        this.account = (await accountApi.fetchSession()).account;
      } catch {
        this.account = null;
      }
    },

    async login(email: string, password: string): Promise<void> {
      await accountApi.login(email, password);
      await this.refresh();
    },

    async signup(email: string, password: string): Promise<void> {
      await accountApi.signup(email, password);
      await this.refresh();
    },

    /** Ends the session; on failure reloads the session state and rethrows. */
    async logout(): Promise<void> {
      try {
        await accountApi.logout();
      } catch (error) {
        await this.refresh();
        throw error;
      }
      this.account = null;
    },

    /** The server returns to the login page, with `?error=` when the login failed. */
    async loginWith(provider: SocialProvider): Promise<void> {
      await accountApi.redirectToProvider(provider, `${window.location.origin}/login`);
    },
  },
});
