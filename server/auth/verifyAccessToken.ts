import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";

import type { ServerEnv } from "../env";
import type { AccessTokenVerifier } from "./types";

const tokenClaimsSchema = z.object({
  tid: z.string().trim().min(1),
  oid: z.uuid(),
  name: z.string().trim().min(1),
  scp: z.string().optional(),
});

export class InsufficientScopeError extends Error {
  public constructor() {
    super("The access token does not contain the required scope.");
    this.name = "InsufficientScopeError";
  }
}

export function createAccessTokenVerifier(
  env: ServerEnv,
  keyResolver?: JWTVerifyGetKey,
): AccessTokenVerifier {
  const tenantId = env.ENTRA_TENANT_ID;
  const audience = env.ENTRA_API_AUDIENCE;

  if (tenantId === null || audience === null) {
    throw new Error("Entra tenant and API audience are required for token verification.");
  }

  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  const jwks = keyResolver ?? createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
  );

  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ["RS256"],
        audience,
        issuer,
      });
      const claims = tokenClaimsSchema.parse(payload);

      if (claims.tid !== tenantId) {
        throw new Error("The token tenant does not match the configured tenant.");
      }

      const scopes = claims.scp?.split(/\s+/).filter(Boolean) ?? [];
      if (!scopes.includes(env.ENTRA_REQUIRED_SCOPE)) {
        throw new InsufficientScopeError();
      }

      return {
        objectId: claims.oid,
        displayName: claims.name,
      };
    },
  };
}