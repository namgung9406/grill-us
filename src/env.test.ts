import { describe, expect, it } from "vitest";

import { parseClientEnv } from "./env";

function validEnv(overrides: Partial<ImportMetaEnv> = {}): ImportMetaEnv {
  return {
    BASE_URL: "/",
    DEV: true,
    MODE: "development",
    PROD: false,
    SSR: false,
    VITE_ENTRA_CLIENT_ID: "client-id",
    VITE_ENTRA_TENANT_ID: "tenant-id",
    VITE_ENTRA_REDIRECT_URI: "http://localhost:5173",
    ...overrides,
  };
}

describe("parseClientEnv", () => {
  it.each(["VITE_ENTRA_CLIENT_ID", "VITE_ENTRA_TENANT_ID", "VITE_ENTRA_REDIRECT_URI"] as const)(
    "%s가 없으면 실패한다",
    (key) => {
      expect(() => parseClientEnv(validEnv({ [key]: undefined }), "development")).toThrow();
    },
  );

  it("URL과 boolean 형식을 검증한다", () => {
    expect(() =>
      parseClientEnv(validEnv({ VITE_ENTRA_REDIRECT_URI: "not-a-url" }), "development"),
    ).toThrow();
    expect(() =>
      parseClientEnv(
        validEnv({ VITE_LEADERBOARD_ENABLED: "yes" as "true" }),
        "development",
      ),
    ).toThrow();
  });

  it("리더보드가 활성화되면 정확한 API scope를 요구한다", () => {
    expect(() =>
      parseClientEnv(validEnv({ VITE_LEADERBOARD_ENABLED: "true" }), "development"),
    ).toThrow();
    expect(() =>
      parseClientEnv(
        validEnv({
          VITE_ENTRA_API_SCOPE: "api://leaderboard/Leaderboard.Access",
          VITE_LEADERBOARD_ENABLED: "true",
        }),
        "development",
      ),
    ).not.toThrow();
  });

  it.each([
    { VITE_E2E_AUTH: "true" as const },
    { VITE_LEADERBOARD_ENABLED: "true" as const, VITE_ENTRA_API_SCOPE: "api://app/Leaderboard.Access" },
  ])("운영 모드의 개발 기능을 거부한다", (overrides) => {
    expect(() => parseClientEnv(validEnv(overrides), "production")).toThrow(
      "운영 모드에서는 E2E 인증과 개발 리더보드를 활성화할 수 없습니다.",
    );
  });

  it("정상 환경을 typed 값과 기본 false로 반환한다", () => {
    expect(parseClientEnv(validEnv(), "development")).toEqual({
      VITE_ENTRA_CLIENT_ID: "client-id",
      VITE_ENTRA_TENANT_ID: "tenant-id",
      VITE_ENTRA_REDIRECT_URI: "http://localhost:5173",
      VITE_ENTRA_API_SCOPE: null,
      VITE_LEADERBOARD_ENABLED: false,
      VITE_E2E_AUTH: false,
    });
  });
});