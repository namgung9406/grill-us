import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { FullScreenLoading } from "@/components/FullScreenLoading";

import { useAuth } from "./AuthProvider";

export const RETURN_TO_KEY = "grill-us:auth:return-to";

export function sanitizeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(value)) {
    return "/games";
  }

  const parsed = new URL(value, window.location.origin);
  if (parsed.origin !== window.location.origin) {
    return "/games";
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function consumeReturnTo(): string | null {
  const stored = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return stored === null ? null : sanitizeReturnTo(stored);
}

export function ProtectedRoute() {
  const { login, status } = useAuth();
  const location = useLocation();
  const loginStarted = useRef(false);

  useEffect(() => {
    if (status !== "anonymous" || loginStarted.current) {
      return;
    }

    loginStarted.current = true;
    const returnTo = sanitizeReturnTo(`${location.pathname}${location.search}${location.hash}`);
    sessionStorage.setItem(RETURN_TO_KEY, returnTo);
    void login(returnTo);
  }, [location.hash, location.pathname, location.search, login, status]);

  if (status === "loading" || status === "anonymous") {
    return <FullScreenLoading message="로그인 페이지로 이동하고 있습니다..." />;
  }

  if (status === "error") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}