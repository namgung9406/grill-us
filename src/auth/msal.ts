import {
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type RedirectRequest,
} from "@azure/msal-browser";

import type { ClientEnv } from "@/env";

export const AUTH_ERROR_KEY = "grill-us:auth:error";

export const loginRequest = {
  scopes: ["openid", "profile", "email"],
} satisfies RedirectRequest;

export const graphTokenRequest = {
  scopes: ["User.Read.All"],
} satisfies RedirectRequest;

export class LeaderboardDisabledError extends Error {
  public constructor() {
    super("개발 리더보드가 비활성화되어 있습니다.");
    this.name = "LeaderboardDisabledError";
  }
}

export class TokenRedirectStartedError extends Error {
  public constructor() {
    super("추가 인증을 위해 페이지를 이동합니다.");
    this.name = "TokenRedirectStartedError";
  }
}

export function apiTokenRequest(env: ClientEnv): RedirectRequest {
  if (!env.VITE_LEADERBOARD_ENABLED || env.VITE_ENTRA_API_SCOPE === null) {
    throw new LeaderboardDisabledError();
  }

  return { scopes: [env.VITE_ENTRA_API_SCOPE] };
}

export function createMsalInstance(env: ClientEnv): PublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: env.VITE_ENTRA_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${env.VITE_ENTRA_TENANT_ID}`,
      redirectUri: env.VITE_ENTRA_REDIRECT_URI,
      postLogoutRedirectUri: env.VITE_ENTRA_REDIRECT_URI,
    },
    cache: {
      cacheLocation: BrowserCacheLocation.SessionStorage,
      storeAuthStateInCookie: false,
    },
  });
}

export async function initializeMsal(instance: PublicClientApplication): Promise<AccountInfo | null> {
  await instance.initialize();

  try {
    const redirectResult = await instance.handleRedirectPromise();
    const account = redirectResult?.account ?? instance.getAllAccounts()[0] ?? null;

    if (account !== null) {
      instance.setActiveAccount(account);
    }

    return account;
  } catch {
    sessionStorage.setItem(AUTH_ERROR_KEY, "로그인 처리에 실패했습니다. 다시 시도해주세요.");
    const account = instance.getAllAccounts()[0] ?? null;
    if (account !== null) {
      instance.setActiveAccount(account);
    }
    return account;
  }
}

export function isInteractionRequired(error: Error): boolean {
  return error instanceof InteractionRequiredAuthError;
}