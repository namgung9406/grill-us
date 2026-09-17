import type { RequestHandler, Response } from "express";

import type { ServerEnv } from "../env";
import { InsufficientScopeError } from "./verifyAccessToken";
import type { AccessTokenVerifier, AuthenticatedRequest, AuthPrincipal } from "./types";

const AUTH_REQUIRED_BODY = {
  error: { code: "AUTH_REQUIRED", message: "인증이 필요합니다." },
} as const;
const INSUFFICIENT_SCOPE_BODY = {
  error: { code: "INSUFFICIENT_SCOPE", message: "필요한 API 권한이 없습니다." },
} as const;

function sendAuthError(response: Response, error: InsufficientScopeError | null): void {
  if (error !== null) {
    response.status(403).json(INSUFFICIENT_SCOPE_BODY);
    return;
  }
  response.status(401).json(AUTH_REQUIRED_BODY);
}

function getBypassPrincipal(env: ServerEnv): AuthPrincipal | null {
  if (!env.LEADERBOARD_DEV_AUTH_BYPASS || env.NODE_ENV === "production") {
    return null;
  }
  if (env.LEADERBOARD_DEV_USER_ID === null || env.LEADERBOARD_DEV_DISPLAY_NAME === null) {
    throw new Error("Development auth bypass requires a complete fixed principal.");
  }
  return {
    objectId: env.LEADERBOARD_DEV_USER_ID,
    displayName: env.LEADERBOARD_DEV_DISPLAY_NAME,
  };
}

export function requirePrincipal(
  env: ServerEnv,
  verifier: AccessTokenVerifier | null,
): RequestHandler {
  const bypassPrincipal = getBypassPrincipal(env);

  return (request, response, next) => {
    if (bypassPrincipal !== null) {
      (request as AuthenticatedRequest).principal = bypassPrincipal;
      response.setHeader("X-Dev-Auth-Bypass", "true");
      next();
      return;
    }

    const authorization = request.header("authorization");
    const bearerMatch = authorization?.match(/^Bearer ([^\s,]+)$/);
    if (bearerMatch === undefined || bearerMatch === null || verifier === null) {
      sendAuthError(response, null);
      return;
    }

    const token = bearerMatch[1];
    if (token === undefined) {
      sendAuthError(response, null);
      return;
    }

    void verifier.verify(token).then(
      (principal) => {
        (request as AuthenticatedRequest).principal = principal;
        next();
      },
      (error) => {
        sendAuthError(response, error instanceof InsufficientScopeError ? error : null);
      },
    );
  };
}