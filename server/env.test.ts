import type { AddressInfo } from "node:net";

import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { parseServerEnv } from "./env";

function validEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    LEADERBOARD_ENABLED: "false",
    ...overrides,
  };
}

async function request(app: Express, path: string, init?: RequestInit): Promise<Response> {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address() as AddressInfo;

  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
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

describe("parseServerEnv", () => {
  it("returns the documented defaults while the leaderboard is disabled", () => {
    expect(parseServerEnv(validEnv())).toEqual({
      NODE_ENV: "development",
      PORT: 3001,
      LEADERBOARD_ENABLED: false,
      ENTRA_TENANT_ID: null,
      ENTRA_API_AUDIENCE: null,
      ENTRA_REQUIRED_SCOPE: "Leaderboard.Access",
      LEADERBOARD_DEV_AUTH_BYPASS: false,
      LEADERBOARD_DEV_USER_ID: null,
      LEADERBOARD_DEV_DISPLAY_NAME: null,
      LEADERBOARD_RATE_LIMIT_MAX: 5,
      LEADERBOARD_DB_PATH: "server/data/leaderboard.sqlite",
    });
  });

  it.each([
    { LEADERBOARD_ENABLED: "true" },
    { LEADERBOARD_DEV_AUTH_BYPASS: "true", LEADERBOARD_DEV_USER_ID: "dev-user", LEADERBOARD_DEV_DISPLAY_NAME: "Dev User" },
  ])("rejects production-only feature activation", (overrides) => {
    expect(() => parseServerEnv(validEnv({ NODE_ENV: "production", ...overrides }))).toThrow();
  });

  it("requires Entra configuration when enabled without bypass", () => {
    expect(() => parseServerEnv(validEnv({ LEADERBOARD_ENABLED: "true" }))).toThrow();
    expect(() =>
      parseServerEnv(
        validEnv({
          LEADERBOARD_ENABLED: "true",
          ENTRA_TENANT_ID: "tenant-id",
          ENTRA_API_AUDIENCE: "api://leaderboard",
        }),
      ),
    ).not.toThrow();
  });

  it("requires a complete fixed principal when bypass is enabled", () => {
    expect(() =>
      parseServerEnv(validEnv({ LEADERBOARD_ENABLED: "true", LEADERBOARD_DEV_AUTH_BYPASS: "true" })),
    ).toThrow();
    expect(() =>
      parseServerEnv(
        validEnv({
          LEADERBOARD_ENABLED: "true",
          LEADERBOARD_DEV_AUTH_BYPASS: "true",
          LEADERBOARD_DEV_USER_ID: "dev-user",
          LEADERBOARD_DEV_DISPLAY_NAME: "Dev User",
        }),
      ),
    ).not.toThrow();
  });

  it("allows a rate-limit override only in tests", () => {
    expect(() => parseServerEnv(validEnv({ LEADERBOARD_RATE_LIMIT_MAX: "6" }))).toThrow();
    expect(parseServerEnv(validEnv({ NODE_ENV: "test", LEADERBOARD_RATE_LIMIT_MAX: "1000" })).LEADERBOARD_RATE_LIMIT_MAX).toBe(1_000);
    expect(() => parseServerEnv(validEnv({ NODE_ENV: "test", LEADERBOARD_RATE_LIMIT_MAX: "1001" }))).toThrow();
  });

  it("keeps disabled leaderboard requests bodyless without creating DB or JWKS resources", async () => {
    const databaseFactory = vi.fn(() => {
      throw new Error("database factory must not be called");
    });
    const verifierFactory = vi.fn(() => {
      throw new Error("verifier factory must not be called");
    });
    const { app } = createApp(parseServerEnv(validEnv()), { databaseFactory, verifierFactory });

    const response = await request(app, "/api/leaderboard/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{malformed",
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(databaseFactory).not.toHaveBeenCalled();
    expect(verifierFactory).not.toHaveBeenCalled();
  });

  it("returns only the minimal health payload and disables the Express signature", async () => {
    const { app } = createApp(parseServerEnv(validEnv()));
    const response = await request(app, "/api/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-powered-by")).toBeNull();
    await expect(response.json()).resolves.toEqual({ status: "ok", leaderboardEnabled: false });
  });
});