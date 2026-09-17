import { describe, expect, it } from "vitest";

import { getWaveBudget, selectEnemyType } from "./waves";

describe("waves", () => {
  it("increments density at exact 30 second boundaries", () => {
    expect(getWaveBudget(29_999)).toEqual({ tier: 0, spawnIntervalMs: 1200, enemyCap: 25 });
    expect(getWaveBudget(30_000)).toEqual({ tier: 1, spawnIntervalMs: 1150, enemyCap: 30 });
    expect(getWaveBudget(599_999)).toEqual({ tier: 19, spawnIntervalMs: 250, enemyCap: 120 });
  });

  it("applies the horde multiplier and never exceeds the global cap", () => {
    expect(getWaveBudget(600_000)).toEqual({ tier: 20, spawnIntervalMs: 162, enemyCap: 165 });
    expect(getWaveBudget(2_000_000)).toMatchObject({ spawnIntervalMs: 162, enemyCap: 220 });
  });

  it("selects enemy types at exact weight boundaries", () => {
    expect([selectEnemyType(0, 0), selectEnemyType(0, 0.7999), selectEnemyType(0, 0.8)]).toEqual([
      "chaser",
      "chaser",
      "ranged",
    ]);
    expect([selectEnemyType(4, 0.4499), selectEnemyType(4, 0.45), selectEnemyType(4, 0.7), selectEnemyType(4, 0.9)]).toEqual([
      "chaser",
      "ranged",
      "splitter",
      "tank",
    ]);
    expect([selectEnemyType(10, 0.2999), selectEnemyType(10, 0.3), selectEnemyType(10, 0.55), selectEnemyType(10, 0.8)]).toEqual([
      "chaser",
      "ranged",
      "splitter",
      "tank",
    ]);
  });
});