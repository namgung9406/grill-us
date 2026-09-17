import { describe, expect, it } from "vitest";

import { calculateScore, createRunResult } from "./score";

describe("calculateScore", () => {
  it("처치, 피격, 세 보스 시간과 클리어 보너스를 모두 계산한다", () => {
    expect(
      calculateScore({
        outcome: "cleared",
        enemyKills: 10,
        hitCount: 2,
        bossTimesMs: [60_000, 120_000, 240_000],
      }),
    ).toBe(14_500);
  });

  it("null 보스 시간은 점수를 주지 않고 음수 총점을 허용한다", () => {
    expect(
      calculateScore({ outcome: "defeated", enemyKills: 0, hitCount: 3, bossTimesMs: [null, null, null] }),
    ).toBe(-150);
  });

  it("보스 보너스를 0 아래로 내리지 않고 소수 결과를 floor한다", () => {
    expect(
      calculateScore({ outcome: "defeated", enemyKills: 0, hitCount: 0, bossTimesMs: [119_975, 200_000, null] }),
    ).toBe(0);
  });

  it("createRunResult가 같은 공식으로 완결 결과를 만든다", () => {
    const result = createRunResult({
      resultId: "00000000-0000-4000-8000-000000000010",
      ownerObjectId: "00000000-0000-4000-8000-000000000001",
      outcome: "cleared",
      normalElapsedMs: 900_000,
      totalActiveMs: 1_200_000,
      enemyKills: 1,
      hitCount: 0,
      bossTimesMs: [120_000, 180_000, 300_000],
      completedAtEpochMs: 1_800_000_000_000,
    });

    expect(result.score).toBe(10_100);
    expect(result.outcome).toBe("cleared");
  });
});