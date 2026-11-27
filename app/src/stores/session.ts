import { defineStore } from 'pinia';

import * as allauth from '../api/allauth';
import { accountMe, type Account } from '../api/hopwatch-api';

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
    /** Loads the configured social providers and the logged-in user; sets the CSRF cookie as a side effect. */
    async initialise(): Promise<void> {
      try {
        const config = await allauth.fetchConfig();
        const configured = (config.socialaccount?.providers ?? []).map((provider) => provider.id);
        this.providers = SOCIAL_PROVIDERS.filter((id) => configured.includes(id));
      } catch {
        this.providers = [];
      }
      await this.refresh();
      this.checked = true;
    },

    async refresh(): Promise<void> {
      try {
        const user = await allauth.fetchSession();
        if (!user) {
          this.account = null;
          return;
        }
        try {
          this.account = await accountMe();
        } catch {
          this.account = { id: user.id, email: user.email, display_name: user.display };
        }
      } catch {
        this.account = null;
      }
    },

    async login(email: string, password: string): Promise<void> {
      await allauth.login(email, password);
      await this.refresh();
    },

    async signup(email: string, password: string): Promise<void> {
      await allauth.signup(email, password);
      await this.refresh();
    },

    /** Ends the session; on failure reloads the session state and rethrows. */
    async logout(): Promise<void> {
      try {
        await allauth.logout();
      } catch (error) {
        await this.refresh();
        throw error;
      }
      this.account = null;
    },

    /** allauth returns to the login page, with `?error=` when the login failed. */
    async loginWith(provider: SocialProvider): Promise<void> {
      await allauth.redirectToProvider(provider, `${window.location.origin}/login`);
    },
  },
});
