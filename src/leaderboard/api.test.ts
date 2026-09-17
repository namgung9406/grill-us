import { describe, expect, it, vi } from "vitest";

import type { RunResult } from "@/games/dex-survivor/domain/types";
import type { LeaderboardEntry } from "@/shared/leaderboard";

import { createLeaderboardApi } from "./api";

const result: RunResult = {
  resultId: "00000000-0000-4000-8000-000000000010",
  ownerObjectId: "private-owner-id",
  outcome: "cleared",
  score: 99_999,
  normalElapsedMs: 120_000,
  totalActiveMs: 180_000,
  enemyKills: 42,
  hitCount: 2,
  bossTimesMs: [10_000, 20_000, 30_000],
  completedAtEpochMs: 1_800_000_000_000,
};

const entry: LeaderboardEntry = {
  resultId: result.resultId,
  outcome: result.outcome,
  normalElapsedMs: result.normalElapsedMs,
  totalActiveMs: result.totalActiveMs,
  enemyKills: result.enemyKills,
  hitCount: result.hitCount,
  bossTimesMs: result.bossTimesMs,
  displayName: "Player One",
  score: 12_345,
  submittedAtMs: 1_800_000_001_000,
};

describe("createLeaderboardApi", () => {
  it("acquires the latest API token for every request", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>((request) => {
      requests.push(request.clone());
      return Promise.resolve(new Response(JSON.stringify({ entries: [entry] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const getToken = vi.fn()
      .mockResolvedValueOnce("api-token-one")
      .mockResolvedValueOnce("api-token-two");
    const api = createLeaderboardApi(getToken);

    await api.list();
    await api.list();

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(requests.map((request) => request.headers.get("Authorization"))).toEqual([
      "Bearer api-token-one",
      "Bearer api-token-two",
    ]);
  });

  it("projects only the shared submission fields", async () => {
    const submittedRequests: Request[] = [];
    vi.stubGlobal("fetch", vi.fn<(request: Request) => Promise<Response>>((request) => {
      submittedRequests.push(request.clone());
      return Promise.resolve(new Response(JSON.stringify({ entry }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }));
    }));
    const api = createLeaderboardApi(() => Promise.resolve("api-token"));

    await expect(api.submit(result)).resolves.toEqual(entry);
    const body = await submittedRequests[0]?.text() ?? "";

    expect(body).toContain(result.resultId);
    expect(body).not.toContain("ownerObjectId");
    expect(body).not.toContain("completedAtEpochMs");
    expect(body).not.toContain("displayName");
    expect(body).not.toContain("email");
    expect(body).not.toContain("score");
  });

  it("rejects a response that does not match the shared schema", async () => {
    vi.stubGlobal("fetch", vi.fn<(request: Request) => Promise<Response>>(() => Promise.resolve(
      new Response(JSON.stringify({ entries: [{ displayName: "Incomplete" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )));
    const api = createLeaderboardApi(() => Promise.resolve("api-token"));

    await expect(api.list()).rejects.toMatchObject({ name: "ZodError" });
  });
});