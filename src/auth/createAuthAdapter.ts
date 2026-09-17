import type { AccountInfo, PublicClientApplication, RedirectRequest } from "@azure/msal-browser";

import type { ClientEnv } from "@/env";

import {
  apiTokenRequest,
  createMsalInstance,
  graphTokenRequest,
  initializeMsal,
  isInteractionRequired,
  LeaderboardDisabledError,
  loginRequest,
  TokenRedirectStartedError,
} from "./msal";
import type { AuthenticatedUser } from "./types";

export interface AuthAdapter {
  readonly kind: "real" | "e2e";
  initialize: () => Promise<AuthenticatedUser | null>;
  getUser: () => AuthenticatedUser | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  acquireGraphToken: () => Promise<string>;
  acquireApiToken: () => Promise<string>;
}

function toAuthenticatedUser(account: AccountInfo): AuthenticatedUser {
  const emailClaim = account.idTokenClaims?.email ?? account.idTokenClaims?.preferred_username;

  return {
    objectId: account.localAccountId,
    displayName: account.name ?? account.username,
    email: typeof emailClaim === "string" ? emailClaim : null,
  };
}

class RealAuthAdapter implements AuthAdapter {
  public readonly kind = "real" as const;
  readonly #env: ClientEnv;
  readonly #instance: PublicClientApplication;
  #initializePromise: Promise<AuthenticatedUser | null> | null = null;
  #user: AuthenticatedUser | null = null;

  public constructor(env: ClientEnv) {
    this.#env = env;
    this.#instance = createMsalInstance(env);
  }

  public initialize(): Promise<AuthenticatedUser | null> {
    this.#initializePromise ??= initializeMsal(this.#instance).then((account) => {
      this.#user = account === null ? null : toAuthenticatedUser(account);
      return this.#user;
    });
    return this.#initializePromise;
  }

  public getUser(): AuthenticatedUser | null {
    return this.#user;
  }

  public async login(): Promise<void> {
    await this.#instance.loginRedirect(loginRequest);
  }

  public async logout(): Promise<void> {
    await this.#instance.logoutRedirect({ account: this.#instance.getActiveAccount() });
  }

  public acquireGraphToken(): Promise<string> {
    return this.#runTokenRequest(graphTokenRequest);
  }

  public acquireApiToken(): Promise<string> {
    if (!this.#env.VITE_LEADERBOARD_ENABLED) {
      return Promise.reject(new LeaderboardDisabledError());
    }
    return this.#runTokenRequest(apiTokenRequest(this.#env));
  }

  async #runTokenRequest(request: RedirectRequest): Promise<string> {
    const account = this.#instance.getActiveAccount();
    if (account === null) {
      await this.#instance.loginRedirect(loginRequest);
      throw new TokenRedirectStartedError();
    }

    try {
      const result = await this.#instance.acquireTokenSilent({ ...request, account });
      return result.accessToken;
    } catch (error) {
      if (error instanceof Error && isInteractionRequired(error)) {
        await this.#instance.acquireTokenRedirect({ ...request, account });
        throw new TokenRedirectStartedError();
      }
      throw error;
    }
  }
}

export async function createAuthAdapter(env: ClientEnv): Promise<AuthAdapter> {
  if (import.meta.env.MODE === "e2e" && env.VITE_E2E_AUTH) {
    const { E2eAuthAdapter } = await import("@/test-support/E2eAuthAdapter");
    return new E2eAuthAdapter(env);
  }

  return new RealAuthAdapter(env);
}