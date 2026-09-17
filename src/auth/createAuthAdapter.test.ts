import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClientEnv } from "@/env";

const env: ClientEnv = {
  VITE_ENTRA_CLIENT_ID: "client-id",
  VITE_ENTRA_TENANT_ID: "tenant-id",
  VITE_ENTRA_REDIRECT_URI: "http://127.0.0.1:4173",
  VITE_ENTRA_API_SCOPE: "api://app/Leaderboard.Access",
  VITE_LEADERBOARD_ENABLED: true,
  VITE_E2E_AUTH: false,
};

describe("createAuthAdapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("일반 mode에서는 실제 MSAL adapter를 선택한다", async () => {
    vi.stubEnv("MODE", "test");
    const { createAuthAdapter } = await import("./createAuthAdapter");

    await expect(createAuthAdapter(env)).resolves.toMatchObject({ kind: "real" });
  });

  it("e2e mode와 flag가 함께 있을 때만 고정 principal adapter를 선택한다", async () => {
    vi.stubEnv("MODE", "e2e");
    const { createAuthAdapter } = await import("./createAuthAdapter");
    const adapter = await createAuthAdapter({ ...env, VITE_E2E_AUTH: true });

    expect(adapter.kind).toBe("e2e");
    await expect(adapter.initialize()).resolves.toEqual({
      objectId: "00000000-0000-4000-8000-000000000001",
      displayName: "E2E 플레이어",
      email: "e2e@example.invalid",
    });
  });
});