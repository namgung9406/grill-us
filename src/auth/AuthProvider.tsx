import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { parseClientEnv } from "@/env";

import { createAuthAdapter, type AuthAdapter } from "./createAuthAdapter";
import { AUTH_ERROR_KEY } from "./msal";
import { consumeReturnTo } from "./ProtectedRoute";
import type { AuthContextValue } from "./types";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const env = useMemo(() => parseClientEnv(import.meta.env, import.meta.env.MODE), []);
  const [retryKey, setRetryKey] = useState(0);
  const adapterPromise = useMemo(() => createAuthAdapter(env), [env, retryKey]);
  const [adapter, setAdapter] = useState<AuthAdapter | null>(null);
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    const storedError = sessionStorage.getItem(AUTH_ERROR_KEY);
    sessionStorage.removeItem(AUTH_ERROR_KEY);
    return storedError;
  });

  useEffect(() => {
    let active = true;
    setAdapter(null);

    void adapterPromise
      .then(async (nextAdapter) => {
        const nextUser = await nextAdapter.initialize();
        if (!active) {
          return;
        }
        setAdapter(nextAdapter);
        setUser(nextUser);
        if (nextUser !== null) {
          const returnTo = consumeReturnTo();
          if (returnTo !== null) {
            window.history.replaceState(null, "", returnTo);
          }
        }
      })
      .catch(() => {
        if (active) {
          setErrorMessage("로그인 처리에 실패했습니다. 다시 시도해주세요.");
        }
      });

    return () => {
      active = false;
    };
  }, [adapterPromise]);

  const login = useCallback(
    async () => {
      setErrorMessage(null);
      try {
        if (adapter === null) {
          throw new Error("인증 초기화가 완료되지 않았습니다.");
        }
        await adapter.login();
        const nextUser = adapter.getUser();
        setUser(nextUser);
        if (nextUser !== null) {
          const returnTo = consumeReturnTo();
          if (returnTo !== null) {
            window.history.replaceState(null, "", returnTo);
          }
        }
      } catch {
        setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해주세요.");
      }
    },
    [adapter],
  );

  const logout = useCallback(async () => {
    setErrorMessage(null);
    try {
      if (adapter === null) {
        throw new Error("인증 초기화가 완료되지 않았습니다.");
      }
      await adapter.logout();
      setUser(adapter.getUser());
    } catch {
      setErrorMessage("로그아웃을 시작하지 못했습니다. 다시 시도해주세요.");
    }
  }, [adapter]);

  const value = useMemo<AuthContextValue>(() => {
    const status =
      errorMessage !== null
        ? "error"
        : adapter === null
          ? "loading"
          : user === null
            ? "anonymous"
            : "authenticated";

    return {
      status,
      user,
      errorMessage,
      login,
      logout,
      acquireGraphToken: () =>
        adapter === null
          ? Promise.reject(new Error("인증 초기화가 완료되지 않았습니다."))
          : adapter.acquireGraphToken(),
      acquireApiToken: () =>
        adapter === null
          ? Promise.reject(new Error("인증 초기화가 완료되지 않았습니다."))
          : adapter.acquireApiToken(),
      retry: () => {
        setErrorMessage(null);
        setRetryKey((current) => current + 1);
      },
    };
  }, [adapter, errorMessage, login, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  }
  return context;
}