import type { AddressInfo } from "node:net";

import express from "express";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { ServerEnv } from "../env";
import { requirePrincipal } from "./requirePrincipal";
import type { AccessTokenVerifier, AuthenticatedRequest } from "./types";
import { createAccessTokenVerifier, InsufficientScopeError } from "./verifyAccessToken";

const tenantId = "11111111-1111-4111-8111-111111111111";
const audience = "api://leaderboard";
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
const objectId = "22222222-2222-4222-8222-222222222222";

const env: ServerEnv = {
  NODE_ENV: "test",
  PORT: 3001,
  LEADERBOARD_ENABLED: true,
  ENTRA_TENANT_ID: tenantId,
  ENTRA_API_AUDIENCE: audience,
  ENTRA_REQUIRED_SCOPE: "Leaderboard.Access",
  LEADERBOARD_DEV_AUTH_BYPASS: false,
  LEADERBOARD_DEV_USER_ID: null,
  LEADERBOARD_DEV_DISPLAY_NAME: null,
  LEADERBOARD_RATE_LIMIT_MAX: 5,
  LEADERBOARD_DB_PATH: ":memory:",
};

interface TokenOptions {
  issuer?: string;
  audience?: string;
  tenantId?: string;
  expiresAt?: number;
  omitClaim?: "oid" | "name" | "scp";
  scope?: string;
}

async function requestProtected(
  middlewareEnv: ServerEnv,
  middlewareVerifier: AccessTokenVerifier | null,
  authorization?: string,
): Promise<Response> {
  const app = express();
  app.get("/protected", requirePrincipal(middlewareEnv, middlewareVerifier), (request, response) => {
    response.json((request as AuthenticatedRequest).principal);
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;

  try {
    return await fetch(`http://127.0.0.1:${address.port}/protected`, {
      headers: authorization === undefined ? {} : { authorization },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe("createAccessTokenVerifier", () => {
  let signToken: (options?: TokenOptions) => Promise<string>;
  let verifier: ReturnType<typeof createAccessTokenVerifier>;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.alg = "RS256";
    publicJwk.kid = "local-test-key";
    verifier = createAccessTokenVerifier(env, createLocalJWKSet({ keys: [publicJwk] }));

    signToken = async (options = {}) => {
      const payload: JWTPayload = {
        tid: options.tenantId ?? tenantId,
        oid: objectId,
        name: "테스트 사용자",
        scp: options.scope ?? "Profile.Read Leaderboard.Access",
      };
      if (options.omitClaim !== undefined) {
        delete payload[options.omitClaim];
      }

      return new SignJWT(payload)
        .setProtectedHeader({ alg: "RS256", kid: "local-test-key" })
        .setIssuer(options.issuer ?? issuer)
        .setAudience(options.audience ?? audience)
        .setIssuedAt()
        .setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1_000) + 300)
        .sign(privateKey);
    };
  });

  it("accepts a valid custom API token and returns only the principal", async () => {
    await expect(verifier.verify(await signToken())).resolves.toEqual({
      objectId,
      displayName: "테스트 사용자",
    });
  });

  it.each([
    { issuer: "https://login.microsoftonline.com/wrong/v2.0" },
    { audience: "https://graph.microsoft.com" },
    { tenantId: "33333333-3333-4333-8333-333333333333" },
    { expiresAt: 1 },
    { omitClaim: "oid" as const },
    { omitClaim: "name" as const },
  ])("rejects invalid issuer, audience, tenant, expiry, and identity claims", async (options) => {
    await expect(verifier.verify(await signToken(options))).rejects.toBeInstanceOf(Error);
  });

  it.each([
    { omitClaim: "scp" as const },
    { scope: "Leaderboard.Access.Read Profile.Read" },
  ])("classifies only a missing exact scope as insufficient scope", async (options) => {
    await expect(verifier.verify(await signToken(options))).rejects.toBeInstanceOf(
      InsufficientScopeError,
    );
  });
});

describe("requirePrincipal", () => {
  const principal = { objectId, displayName: "테스트 사용자" };

  it.each([undefined, "Bearer", "bearer token", "Bearer token extra", "Bearer first,second"])(
    "rejects every authorization form except one exact Bearer token",
    async (authorization) => {
      const verifier: AccessTokenVerifier = { verify: vi.fn(() => Promise.resolve(principal)) };
      const response = await requestProtected(env, verifier, authorization);

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: { code: "AUTH_REQUIRED", message: "인증이 필요합니다." },
      });
    },
  );

  it("maps only insufficient scope to 403 and all other verification failures to 401", async () => {
    const verifier: AccessTokenVerifier = {
      verify: vi.fn((token) => {
        if (token === "missing-scope") {
          return Promise.reject(new InsufficientScopeError());
        }
        return Promise.reject(new Error("verification failed"));
      }),
    };

    const scopeResponse = await requestProtected(env, verifier, "Bearer missing-scope");
    expect(scopeResponse.status).toBe(403);
    await expect(scopeResponse.json()).resolves.toEqual({
      error: { code: "INSUFFICIENT_SCOPE", message: "필요한 API 권한이 없습니다." },
    });

    const invalidResponse = await requestProtected(env, verifier, "Bearer invalid");
    expect(invalidResponse.status).toBe(401);
    await expect(invalidResponse.json()).resolves.toEqual({
      error: { code: "AUTH_REQUIRED", message: "인증이 필요합니다." },
    });
  });

  it("uses the fixed non-production bypass principal without invoking the verifier", async () => {
    const verify = vi.fn(() => Promise.resolve(principal));
    const verifier: AccessTokenVerifier = { verify };
    const bypassEnv: ServerEnv = {
      ...env,
      LEADERBOARD_DEV_AUTH_BYPASS: true,
      LEADERBOARD_DEV_USER_ID: "fixed-dev-user",
      LEADERBOARD_DEV_DISPLAY_NAME: "Fixed Dev User",
    };

    const response = await requestProtected(bypassEnv, verifier);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-dev-auth-bypass")).toBe("true");
    await expect(response.json()).resolves.toEqual({
      objectId: "fixed-dev-user",
      displayName: "Fixed Dev User",
    });
    expect(verify).not.toHaveBeenCalled();
  });
});