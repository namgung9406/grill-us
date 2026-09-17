import {
  InteractionStatus,
  type AccountInfo,
  type RedirectRequest,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { parseClientEnv } from "@/env";

import {
  apiTokenRequest,
  AUTH_ERROR_KEY,
  graphTokenRequest,
  isInteractionRequired,
  LeaderboardDisabledError,
  loginRequest,
  TokenRedirectStartedError,
} from "./msal";
import type { AuthContextValue, AuthenticatedUser } from "./types";

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthenticatedUser(account: AccountInfo): AuthenticatedUser {
  const emailClaim = account.idTokenClaims?.email ?? account.idTokenClaims?.preferred_username;
  const email = typeof emailClaim === "string" ? emailClaim : null;

  return {
    objectId: account.localAccountId,
    displayName: account.name ?? account.username,
    email,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { accounts, inProgress, instance } = useMsal();
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    const storedError = sessionStorage.getItem(AUTH_ERROR_KEY);
    sessionStorage.removeItem(AUTH_ERROR_KEY);
    return storedError;
  });
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;
  const env = useMemo(() => parseClientEnv(import.meta.env, import.meta.env.MODE), []);

  const runTokenRequest = useCallback(
    async (request: RedirectRequest): Promise<string> => {
      if (account === null) {
        await instance.loginRedirect(loginRequest);
        throw new TokenRedirectStartedError();
      }

      try {
        const result = await instance.acquireTokenSilent({ ...request, account });
        return result.accessToken;
      } catch (error) {
        if (error instanceof Error && isInteractionRequired(error)) {
          await instance.acquireTokenRedirect({ ...request, account });
          throw new TokenRedirectStartedError();
        }
        throw error;
      }
    },
    [account, instance],
  );

  const login = useCallback(
    async () => {
      setErrorMessage(null);
      try {
        await instance.loginRedirect(loginRequest);
      } catch {
        setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해주세요.");
      }
    },
    [instance],
  );

  const logout = useCallback(async () => {
    setErrorMessage(null);
    try {
      await instance.logoutRedirect({ account });
    } catch {
      setErrorMessage("로그아웃을 시작하지 못했습니다. 다시 시도해주세요.");
    }
  }, [account, instance]);

  const acquireApiToken = useCallback(() => {
    if (!env.VITE_LEADERBOARD_ENABLED) {
      return Promise.reject(new LeaderboardDisabledError());
    }
    return runTokenRequest(apiTokenRequest(env));
  }, [env, runTokenRequest]);

  const value = useMemo<AuthContextValue>(() => {
    const user = account === null ? null : toAuthenticatedUser(account);
    const status =
      inProgress !== InteractionStatus.None
        ? "loading"
        : errorMessage !== null
          ? "error"
          : user === null
            ? "anonymous"
            : "authenticated";

    return {
      status,
      user,
      errorMessage,
      login,
      logout,
      acquireGraphToken: () => runTokenRequest(graphTokenRequest),
      acquireApiToken,
      retry: () => {
        setErrorMessage(null);
      },
    };
  }, [account, acquireApiToken, errorMessage, inProgress, login, logout, runTokenRequest]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  }
  return context;
}