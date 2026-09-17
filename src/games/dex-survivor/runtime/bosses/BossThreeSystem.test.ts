import { describe, expect, it } from "vitest";

import { BOSS_THREE_BALANCE, createBossThreeState } from "../../domain/bosses";
import { BOSS_THREE_TARGET_ID, BossThreeSystem } from "./BossThreeSystem";

describe("BossThreeSystem", () => {
  it("crosses phase two and finale thresholds once, preserving hp while hidden", () => {
    const system = new BossThreeSystem({ boss: createBossThreeState(), seed: 42 });

    const phaseTwo = system.damageTarget(BOSS_THREE_TARGET_ID, BOSS_THREE_BALANCE.hp - BOSS_THREE_BALANCE.phaseTwoHp);
    expect(phaseTwo).toMatchObject({ phaseTwoStarted: true, finaleStarted: false, boss: { phase: 2 } });
    expect(system.damageTarget(BOSS_THREE_TARGET_ID, 0).phaseTwoStarted).toBe(false);

    const finale = system.damageTarget(BOSS_THREE_TARGET_ID, BOSS_THREE_BALANCE.phaseTwoHp - BOSS_THREE_BALANCE.finaleHp);
    expect(finale).toMatchObject({
      finaleStarted: true,
      boss: { phase: "hidden", hp: 800, savedHp: 800, finaleTriggered: true },
    });
    expect(finale.boss.finaleBossOne?.tentacles.every(({ citizenUserId }) => citizenUserId === null)).toBe(true);
    expect(system.damageTarget(BOSS_THREE_TARGET_ID, 1).finaleStarted).toBe(false);
  });

  it("uses a telegraph before deterministic phase patterns and resumes at the next pattern", () => {
    const system = new BossThreeSystem({ boss: createBossThreeState(), seed: 9 });
    const beforeTelegraph = system.step(BOSS_THREE_BALANCE.minimumTelegraphMs - 1, { x: 900, y: 360 });
    expect(beforeTelegraph.projectiles).toHaveLength(0);
    const ring = system.step(1, { x: 900, y: 360 });
    expect(ring.projectiles).toHaveLength(BOSS_THREE_BALANCE.ring.phaseOne.projectileCount);
    expect(ring.boss.patternIndex).toBe(1);

    system.damageTarget(BOSS_THREE_TARGET_ID, BOSS_THREE_BALANCE.hp - BOSS_THREE_BALANCE.finaleHp);
    const hiddenPatternIndex = system.boss.patternIndex;
    const bossOne = system.boss.finaleBossOne;
    const bossTwo = system.boss.finaleBossTwo;
    if (bossOne === null || bossTwo === null) {
      throw new Error("expected finale adds");
    }
    system.beginResumeCountdown({ ...bossOne, hp: 0 }, { ...bossTwo, stage: "defeated" });
    system.setResumeCountdown(0);
    const resumed = system.resumeAfterFinale();
    expect(resumed).toMatchObject({ phase: 2, hp: BOSS_THREE_BALANCE.finaleHp, finaleTriggered: true });
    expect(resumed.patternIndex).toBe(hiddenPatternIndex);
    expect(resumed.patternCooldownMs).toBeGreaterThanOrEqual(BOSS_THREE_BALANCE.minimumTelegraphMs);
  });

  it("cycles phase-two ring plus aimed and edge plus moving-safe-zone combinations", () => {
    const system = new BossThreeSystem({ boss: createBossThreeState(), seed: 91 });
    system.damageTarget(BOSS_THREE_TARGET_ID, BOSS_THREE_BALANCE.hp - BOSS_THREE_BALANCE.phaseTwoHp);

    const ringAndAimed = system.step(BOSS_THREE_BALANCE.minimumTelegraphMs, { x: 1000, y: 360 });
    expect(ringAndAimed.projectiles).toHaveLength(BOSS_THREE_BALANCE.ring.phaseTwo.projectileCount + 1);
    expect(ringAndAimed.boss.patternIndex).toBe(1);

    const edgeAndSafeZone = system.step(BOSS_THREE_BALANCE.ring.phaseTwo.intervalMs, { x: 640, y: 360 });
    expect(edgeAndSafeZone.activeHazards.map(({ kind }) => kind).sort()).toEqual([
      "boss3-edge",
      "boss3-safe-zone",
    ]);
    const edgeVolley = system.step(BOSS_THREE_BALANCE.edgeCompression.telegraphMs, { x: 640, y: 360 });
    expect(edgeVolley.projectiles).toHaveLength(BOSS_THREE_BALANCE.edgeCompression.projectileCount);
    expect(edgeVolley.activeHazards.some(({ kind }) => kind === "boss3-safe-zone")).toBe(true);
  });

  it("emits aimed shots only at their configured interval", () => {
    const system = new BossThreeSystem({
      boss: { ...createBossThreeState(), patternIndex: 1 },
      seed: 17,
    });
    expect(system.step(BOSS_THREE_BALANCE.minimumTelegraphMs, { x: 1000, y: 360 }).projectiles).toHaveLength(1);
    expect(system.step(BOSS_THREE_BALANCE.aimedBurst.phaseOne.projectileIntervalMs - 1, { x: 1000, y: 360 }).projectiles).toHaveLength(0);
    expect(system.step(1, { x: 1000, y: 360 }).projectiles).toHaveLength(1);
  });

  it("restores the remaining aimed burst and exact next-shot timing", () => {
    const original = new BossThreeSystem({
      boss: { ...createBossThreeState(), patternIndex: 1 },
      seed: 17,
    });
    original.step(BOSS_THREE_BALANCE.minimumTelegraphMs, { x: 1000, y: 360 });
    original.step(60, { x: 1000, y: 360 });

    const restored = new BossThreeSystem({ boss: original.boss, seed: 17 });
    expect(restored.step(59, { x: 1000, y: 360 }).projectiles).toHaveLength(0);
    expect(restored.step(1, { x: 1000, y: 360 }).projectiles).toHaveLength(1);
  });

  it("clears directly when lethal damage reaches zero", () => {
    const system = new BossThreeSystem({ boss: createBossThreeState(), seed: 1 });
    const result = system.damageTarget(BOSS_THREE_TARGET_ID, BOSS_THREE_BALANCE.hp);
    expect(result).toMatchObject({ completed: true, finaleStarted: false, boss: { hp: 0 } });
  });
});