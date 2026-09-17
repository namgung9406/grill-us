import { describe, expect, it } from "vitest";

import type { ClientEnv } from "@/env";

import {
  apiTokenRequest,
  graphTokenRequest,
  LeaderboardDisabledError,
  loginRequest,
} from "./msal";

const enabledEnv: ClientEnv = {
  VITE_ENTRA_CLIENT_ID: "client",
  VITE_ENTRA_TENANT_ID: "tenant",
  VITE_ENTRA_REDIRECT_URI: "http://localhost:5173",
  VITE_ENTRA_API_SCOPE: "api://client/Leaderboard.Access",
  VITE_LEADERBOARD_ENABLED: true,
  VITE_E2E_AUTH: false,
};

describe("MSAL token requests", () => {
  it("로그인, Graph, API scope를 서로 분리한다", () => {
    expect(loginRequest.scopes).toEqual(["openid", "profile", "email"]);
    expect(graphTokenRequest.scopes).toEqual(["User.Read.All"]);
    expect(apiTokenRequest(enabledEnv).scopes).toEqual(["api://client/Leaderboard.Access"]);
  });

  it("비활성 리더보드에서는 API 요청을 만들지 않는다", () => {
    expect(() => apiTokenRequest({ ...enabledEnv, VITE_LEADERBOARD_ENABLED: false })).toThrow(
      LeaderboardDisabledError,
    );
  });
});