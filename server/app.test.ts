import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import type { ServerEnv } from "./env";

const disabledProductionEnv: ServerEnv = {
  NODE_ENV: "production",
  PORT: 0,
  LEADERBOARD_ENABLED: false,
  ENTRA_TENANT_ID: null,
  ENTRA_API_AUDIENCE: null,
  ENTRA_REQUIRED_SCOPE: "Leaderboard.Access",
  LEADERBOARD_DEV_AUTH_BYPASS: false,
  LEADERBOARD_DEV_USER_ID: null,
  LEADERBOARD_DEV_DISPLAY_NAME: null,
  LEADERBOARD_RATE_LIMIT_MAX: 5,
  LEADERBOARD_DB_PATH: "server/data/should-not-exist.sqlite",
};

describe("createApp production boundary", () => {
  it("returns 404 without opening the database when leaderboard is disabled", async () => {
    const databaseFactory = vi.fn(() => {
      throw new Error("disabled leaderboard must not open SQLite");
    });
    const verifierFactory = vi.fn(() => {
      throw new Error("disabled leaderboard must not create a verifier");
    });
    const resources = createApp(disabledProductionEnv, { databaseFactory, verifierFactory });
    const server = createServer(resources.app);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const status = await new Promise<number>((resolve, reject) => {
        const outgoing = request(
          { host: "127.0.0.1", port, path: "/api/leaderboard", method: "GET" },
          (response) => {
            response.resume();
            response.once("end", () => resolve(response.statusCode ?? 0));
          },
        );
        outgoing.once("error", reject);
        outgoing.end();
      });

      expect(status).toBe(404);
      expect(resources.database).toBeNull();
      expect(resources.repository).toBeNull();
      expect(resources.authenticate).toBeNull();
      expect(databaseFactory).not.toHaveBeenCalled();
      expect(verifierFactory).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    }
  });
});