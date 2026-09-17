import { describe, expect, it } from "vitest";

import { BOSS_ONE_BALANCE, createBossOneState } from "../../domain/bosses";
import { BossOneSystem } from "./BossOneSystem";

const citizenId = (index: number): string =>
  `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`;

describe("BossOneSystem", () => {
  it.each([0, 1, 9])("creates one evenly-spaced tentacle per citizen for %i citizens", (citizenCount) => {
    const boss = createBossOneState(Array.from({ length: citizenCount }, (_, index) => citizenId(index)));
    expect(boss.tentacles).toHaveLength(citizenCount);
    boss.tentacles.forEach((tentacle, index) => {
      expect(tentacle.angleRadians).toBeCloseTo((index * Math.PI * 2) / citizenCount);
    });
  });

  it("sweeps only the player contact channel and never gives citizens damage state", () => {
    const boss = createBossOneState([citizenId(0)]);
    const system = new BossOneSystem({ boss });

    const telegraph = system.step(0, { x: boss.position.x + 180, y: boss.position.y });
    expect(telegraph.contacts).toHaveLength(0);
    const active = system.step(BOSS_ONE_BALANCE.sweepTelegraphMs, {
      x: boss.position.x + 180,
      y: boss.position.y,
    });

    expect(active.contacts).toEqual([{ sourceId: boss.tentacles[0]?.id, damage: BOSS_ONE_BALANCE.sweepDamage }]);
    expect(active.boss.tentacles[0]).not.toHaveProperty("damage");
    expect(active.rescuedCitizenIds).toEqual([]);
  });

  it("rescues once on tentacle destruction and rescues sorted survivors on body death", () => {
    const citizens = [citizenId(2), citizenId(0), citizenId(1)];
    const boss = createBossOneState(citizens);
    const system = new BossOneSystem({ boss });
    const firstTentacle = boss.tentacles[0];
    if (firstTentacle === undefined) {
      throw new Error("expected a tentacle");
    }

    const tentacleDeath = system.damageTarget(firstTentacle.id, BOSS_ONE_BALANCE.tentacleHp);
    expect(tentacleDeath.rescuedCitizenIds).toEqual([citizens[0]]);
    expect(system.damageTarget(firstTentacle.id, BOSS_ONE_BALANCE.tentacleHp).rescuedCitizenIds).toEqual([
      citizens[0],
    ]);

    const bodyDeath = system.damageTarget("boss1-body", BOSS_ONE_BALANCE.hp);
    expect(bodyDeath.completed).toBe(true);
    expect(bodyDeath.rescuedCitizenIds).toEqual([citizens[0], citizens[1], citizens[2]]);
    expect(system.damageTarget("boss1-body", 1).rescuedCitizenIds).toEqual(bodyDeath.rescuedCitizenIds);
  });
});