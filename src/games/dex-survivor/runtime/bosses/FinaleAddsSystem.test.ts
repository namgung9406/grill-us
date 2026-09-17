import { describe, expect, it } from "vitest";

import {
  BOSS_ONE_BALANCE,
  BOSS_THREE_BALANCE,
  BOSS_TWO_BALANCE,
  createFinaleBossOneState,
  createFinaleBossTwoState,
} from "../../domain/bosses";
import { bossTwoTargetId } from "./BossTwoSystem";
import { FinaleAddsSystem, resumeCountdownRemaining } from "./FinaleAddsSystem";

describe("FinaleAddsSystem", () => {
  it("creates left/right adds with 60% hp, null citizens, and 70% damage", () => {
    const bossOne = createFinaleBossOneState({ x: 320, y: 360 });
    const bossTwo = createFinaleBossTwoState({ x: 960, y: 360 });
    const system = new FinaleAddsSystem({ bossOne, bossTwo });

    expect(bossOne.hp).toBe(BOSS_ONE_BALANCE.hp * 0.6);
    expect(bossOne.tentacles).toHaveLength(3);
    expect(bossOne.tentacles.every(({ citizenUserId, hp }) => citizenUserId === null && hp === BOSS_ONE_BALANCE.tentacleHp * 0.6)).toBe(true);
    expect(bossTwo.parts.shield.hp).toBe(BOSS_TWO_BALANCE.partHp.shield * 0.6);
    const contact = system.step(0, bossOne.position).contacts.find(({ sourceId }) => sourceId === "boss1-body");
    expect(contact?.damage).toBe(Math.round(BOSS_ONE_BALANCE.contactDamage * BOSS_THREE_BALANCE.weakenedDamageMultiplier));
    expect(Number.isInteger(contact?.damage)).toBe(true);
  });

  it("keeps boss two part order and requires both bosses to be defeated", () => {
    const system = new FinaleAddsSystem({
      bossOne: createFinaleBossOneState({ x: 320, y: 360 }),
      bossTwo: createFinaleBossTwoState({ x: 960, y: 360 }),
    });
    expect(system.damageTarget(bossTwoTargetId("core"), 100)).toMatchObject({ blocked: true, completed: false });

    const body = system.damageTargets.find(({ boss, id }) => boss === "boss1" && id === "boss1-body");
    if (body === undefined) {
      throw new Error("expected boss one body target");
    }
    system.damageTarget(body.id, BOSS_ONE_BALANCE.hp);
    expect(system.completed).toBe(false);

    system.damageTarget(bossTwoTargetId("shield"), BOSS_TWO_BALANCE.partHp.shield);
    system.damageTarget(bossTwoTargetId("maceArm"), BOSS_TWO_BALANCE.partHp.maceArm);
    system.damageTarget(bossTwoTargetId("leftLeg"), BOSS_TWO_BALANCE.partHp.leftLeg);
    system.damageTarget(bossTwoTargetId("rightLeg"), BOSS_TWO_BALANCE.partHp.rightLeg);
    const completion = system.damageTarget(bossTwoTargetId("core"), BOSS_TWO_BALANCE.partHp.core);
    expect(completion).toMatchObject({ completed: true, completedNow: true });
    expect(system.bossOne.tentacles.every(({ citizenUserId }) => citizenUserId === null)).toBe(true);
  });

  it("computes the resume countdown from wall-clock timestamps", () => {
    expect(resumeCountdownRemaining(13_000, 10_000)).toBe(3000);
    expect(resumeCountdownRemaining(13_000, 12_250)).toBe(750);
    expect(resumeCountdownRemaining(13_000, 14_000)).toBe(0);
  });
});