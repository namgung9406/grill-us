import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  apiErrorBodySchema,
  leaderboardSubmissionResponseSchema,
  type LeaderboardSubmission,
} from "../../src/shared/leaderboard";
import { createApp, type AppResources } from "../app";
import type { AccessTokenVerifier } from "../auth/types";
import type { ServerEnv } from "../env";

interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

interface TestServer {
  server: Server;
  resources: AppResources;
  port: number;
}

const env: ServerEnv = {
  NODE_ENV: "test",
  PORT: 0,
  LEADERBOARD_ENABLED: true,
  ENTRA_TENANT_ID: "tenant-id",
  ENTRA_API_AUDIENCE: "api://leaderboard",
  ENTRA_REQUIRED_SCOPE: "Leaderboard.Access",
  LEADERBOARD_DEV_AUTH_BYPASS: false,
  LEADERBOARD_DEV_USER_ID: null,
  LEADERBOARD_DEV_DISPLAY_NAME: null,
  LEADERBOARD_RATE_LIMIT_MAX: 5,
  LEADERBOARD_DB_PATH: ":memory:",
};

const validSubmission: LeaderboardSubmission = {
  resultId: "00000000-0000-4000-8000-000000000001",
  outcome: "defeated",
  normalElapsedMs: 0,
  totalActiveMs: 5_000,
  enemyKills: 10,
  hitCount: 1,
  bossTimesMs: [null, null, null],
};

const servers: TestServer[] = [];

async function startTestServer(overrides: Partial<ServerEnv> = {}): Promise<TestServer> {
  const verifier: AccessTokenVerifier = {
    verify: (token) => Promise.resolve({
      objectId: token === "user-2" ? "user-2" : "user-1",
      displayName: token === "user-2" ? "Player Two" : "Player One",
    }),
  };
  const resources = createApp(
    { ...env, ...overrides },
    {
      databaseFactory: () => new Database(":memory:"),
      verifierFactory: () => verifier,
    },
  );
  const server = createServer(resources.app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const testServer = { server, resources, port: address.port };
  servers.push(testServer);
  return testServer;
}

function send(
  server: TestServer,
  method: "GET" | "POST",
  path: string,
  token?: string,
  body?: string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {};
    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const outgoingRequest = request(
      { host: "127.0.0.1", port: server.port, method, path, headers },
      (incomingResponse) => {
        const chunks: Buffer[] = [];
        incomingResponse.on("data", (chunk: Buffer) => chunks.push(chunk));
        incomingResponse.on("end", () => resolve({
          status: incomingResponse.statusCode ?? 0,
          headers: incomingResponse.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        }));
      },
    );
    outgoingRequest.on("error", reject);
    if (body !== undefined) {
      outgoingRequest.write(body);
    }
    outgoingRequest.end();
  });
}

afterEach(async () => {
  for (const testServer of servers.splice(0)) {
    await new Promise<void>((resolve, reject) => testServer.server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    }));
    testServer.resources.database?.close();
  }
});

describe("leaderboard routes", () => {
  it("uses only the authenticated principal and returns no internal identity fields", async () => {
    const server = await startTestServer();
    const response = await send(server, "POST", "/api/leaderboard/results", "user-1", JSON.stringify(validSubmission));

    expect(response.status).toBe(201);
    const body = leaderboardSubmissionResponseSchema.parse(JSON.parse(response.text));
    expect(body.entry.displayName).toBe("Player One");
    expect(body.entry.score).toBe(950);
    expect(response.text).not.toContain("user_oid");
    expect(response.text).not.toContain("user-1");
  });

  it("returns the same entry for a retry and rejects another principal without exposing the row", async () => {
    const server = await startTestServer();
    const payload = JSON.stringify(validSubmission);
    const created = await send(server, "POST", "/api/leaderboard/results", "user-1", payload);
    const duplicate = await send(server, "POST", "/api/leaderboard/results", "user-1", payload);
    const conflict = await send(server, "POST", "/api/leaderboard/results", "user-2", payload);

    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(leaderboardSubmissionResponseSchema.parse(JSON.parse(duplicate.text))).toEqual({
      entry: leaderboardSubmissionResponseSchema.parse(JSON.parse(created.text)).entry,
      duplicate: true,
    });
    expect(conflict.status).toBe(409);
    expect(apiErrorBodySchema.parse(JSON.parse(conflict.text)).error.code).toBe("RESULT_ID_CONFLICT");
    expect(conflict.text).not.toContain("Player One");
  });

  it("counts invalid bodies and rejects the sixth attempt with Retry-After", async () => {
    const server = await startTestServer();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await send(server, "POST", "/api/leaderboard/results", "user-1", "{}");
      expect(invalid.status).toBe(422);
    }

    const limited = await send(server, "POST", "/api/leaderboard/results", "user-1", JSON.stringify(validSubmission));
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("600");
    expect(apiErrorBodySchema.parse(JSON.parse(limited.text)).error.code).toBe("RATE_LIMITED");
  });

  it("returns 400 for malformed JSON after authentication and records the attempt", async () => {
    const server = await startTestServer();
    const malformed = await send(server, "POST", "/api/leaderboard/results", "user-1", "{");

    expect(malformed.status).toBe(400);
    expect(apiErrorBodySchema.parse(JSON.parse(malformed.text)).error.code).toBe("MALFORMED_JSON");
    expect(server.resources.repository?.countAttempts("user-1", 0)).toBe(1);
  });

  it("authenticates GET, validates its limit, and preserves the disabled 404 without DB work", async () => {
    const server = await startTestServer();
    expect((await send(server, "GET", "/api/leaderboard")).status).toBe(401);
    expect((await send(server, "GET", "/api/leaderboard?limit=11", "user-1")).status).toBe(422);

    const disabled = await startTestServer({ LEADERBOARD_ENABLED: false });
    expect((await send(disabled, "POST", "/api/leaderboard/results", "user-1", "{")).status).toBe(404);
    expect(disabled.resources.database).toBeNull();
  });

  it("rejects extra score and identity fields through the strict request schema", async () => {
    const server = await startTestServer();
    const response = await send(server, "POST", "/api/leaderboard/results", "user-1", JSON.stringify({
      ...validSubmission,
      score: 999_999,
      userId: "attacker",
      name: "Attacker",
    }));

    expect(response.status).toBe(422);
    expect(apiErrorBodySchema.parse(JSON.parse(response.text)).error.code).toBe("VALIDATION_ERROR");
  });
});