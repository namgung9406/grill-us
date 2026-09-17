import { describe, expect, it } from "vitest";

import type { LeaderboardSubmission } from "../../src/shared/leaderboard";
import { ApiError } from "../http/errors";
import { validateSubmission } from "./validateSubmission";

const defeatedSubmission: LeaderboardSubmission = {
  resultId: "00000000-0000-4000-8000-000000000001",
  outcome: "defeated",
  normalElapsedMs: 0,
  totalActiveMs: 5_000,
  enemyKills: 0,
  hitCount: 0,
  bossTimesMs: [null, null, null],
};

function expectImplausible(submission: LeaderboardSubmission): void {
  let capturedError: ApiError | null = null;
  try {
    validateSubmission(submission);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    capturedError = error;
  }
  expect(capturedError?.status).toBe(422);
  expect(capturedError?.code).toBe("IMPLAUSIBLE_RESULT");
}

describe("validateSubmission", () => {
  it("accepts the 5,000 ms defeated boundary and rejects 4,999 ms", () => {
    expect(() => validateSubmission(defeatedSubmission)).not.toThrow();
    expectImplausible({ ...defeatedSubmission, totalActiveMs: 4_999 });
  });

  it("accepts the minimum 965,000 ms clear and bounded maximum values", () => {
    expect(() => validateSubmission({
      ...defeatedSubmission,
      outcome: "cleared",
      normalElapsedMs: 900_000,
      totalActiveMs: 965_000,
      bossTimesMs: [15_000, 20_000, 30_000],
    })).not.toThrow();

    expect(() => validateSubmission({
      ...defeatedSubmission,
      outcome: "cleared",
      normalElapsedMs: 900_000,
      totalActiveMs: 14_400_000,
      enemyKills: 50_000,
      hitCount: 1_000,
      bossTimesMs: [3_600_000, 3_600_000, 3_600_000],
    })).not.toThrow();
  });

  it.each([
    { name: "a skipped first boss", patch: { normalElapsedMs: 600_000, totalActiveMs: 620_000, bossTimesMs: [null, 20_000, null] as const } },
    { name: "a third boss on defeat", patch: { normalElapsedMs: 900_000, totalActiveMs: 965_000, bossTimesMs: [15_000, 20_000, 30_000] as const } },
    { name: "boss two before its unlock", patch: { normalElapsedMs: 599_999, totalActiveMs: 634_999, bossTimesMs: [15_000, 20_000, null] as const } },
    { name: "an impossibly fast boss", patch: { normalElapsedMs: 300_000, totalActiveMs: 314_999, bossTimesMs: [14_999, null, null] as const } },
    { name: "less total time than accounted time", patch: { normalElapsedMs: 300_000, totalActiveMs: 314_999, bossTimesMs: [15_000, null, null] as const } },
    { name: "more than one unfinished boss maximum", patch: { totalActiveMs: 3_605_001 } },
    { name: "too many kills", patch: { enemyKills: 71 } },
    { name: "too many hits", patch: { hitCount: 22 } },
  ])("rejects $name", ({ patch }) => {
    expectImplausible({ ...defeatedSubmission, ...patch });
  });
});