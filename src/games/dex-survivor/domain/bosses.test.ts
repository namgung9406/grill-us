import { describe, expect, it } from "vitest";

import {
  BOSS_TWO_BALANCE,
  activeBossTwoParts,
  advanceBossTwoStage,
  createBossTwoState,
  type BossTwoPartKey,
} from "./bosses";

function destroyPart(part: BossTwoPartKey, boss = createBossTwoState()) {
  return advanceBossTwoStage({
    ...boss,
    parts: { ...boss.parts, [part]: { hp: 0, destroyed: true } },
  });
}

describe("boss two stages", () => {
  it("creates the complete building robot at the shield stage", () => {
    const boss = createBossTwoState();

    expect(boss.stage).toBe("shield");
    expect(boss.parts).toEqual({
      shield: { hp: BOSS_TWO_BALANCE.partHp.shield, destroyed: false },
      maceArm: { hp: BOSS_TWO_BALANCE.partHp.maceArm, destroyed: false },
      leftLeg: { hp: BOSS_TWO_BALANCE.partHp.leftLeg, destroyed: false },
      rightLeg: { hp: BOSS_TWO_BALANCE.partHp.rightLeg, destroyed: false },
      core: { hp: BOSS_TWO_BALANCE.partHp.core, destroyed: false },
    });
    expect(activeBossTwoParts(boss)).toEqual(["shield"]);
  });

  it.each([
    ["leftLeg", "rightLeg"],
    ["rightLeg", "leftLeg"],
  ] as const)("allows either leg order after shield and mace (%s first)", (firstLeg, secondLeg) => {
    const shieldDown = destroyPart("shield");
    expect(shieldDown.stage).toBe("mace-arm");
    const maceDown = destroyPart("maceArm", shieldDown);
    expect(maceDown.stage).toBe("legs");
    expect(activeBossTwoParts(maceDown)).toEqual(["leftLeg", "rightLeg"]);

    const oneLegDown = destroyPart(firstLeg, maceDown);
    expect(oneLegDown.stage).toBe("legs");
    expect(activeBossTwoParts(oneLegDown)).toEqual([secondLeg]);

    const bothLegsDown = destroyPart(secondLeg, oneLegDown);
    expect(bothLegsDown.stage).toBe("core");
    const defeated = destroyPart("core", bothLegsDown);
    expect(defeated.stage).toBe("defeated");
  });
});