import type { Request } from "express";

export interface AuthPrincipal {
  objectId: string;
  displayName: string;
}

export interface AuthenticatedRequest extends Request {
  principal: AuthPrincipal;
}

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthPrincipal>;
}