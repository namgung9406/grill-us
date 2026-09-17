import { describe, expect, it } from "vitest";

import { applyUpgrade, derivedStats, eligibleUpgradeTypes } from "./upgrades";
import type { PlayerSnapshot, UpgradeLevels, UpgradeType } from "./types";

function createPlayer(upgrades: UpgradeLevels): PlayerSnapshot {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
    facingRadians: 0,
    dashCharges: 1,
    dashRecoveryRemainingMs: [],
    dashRemainingMs: 0,
    invulnerableRemainingMs: 0,
    gunCooldownMs: 0,
    swordCooldownMs: 0,
    swordActiveRemainingMs: 0,
    swordStormCooldownMs: 0,
    swordStormActiveRemainingMs: 0,
    ultimateCharge: 27,
    ultimateChargeTickRemainderMs: 0,
    upgrades,
  };
}

describe("upgrades", () => {
  it("모든 영구 업그레이드를 각 상한에서 멈춘다", () => {
    const upgradeTypes: readonly UpgradeType[] = [
      "gun-damage",
      "gun-range",
      "sword-power",
      "dash-capacity",
      "dash-recovery",
    ];
    let player = createPlayer({ gunDamage: 0, gunRange: 0, swordPower: 0, dashCapacity: 0, dashRecovery: 0 });
    for (const upgrade of upgradeTypes) {
      for (let application = 0; application < 10; application += 1) {
        player = applyUpgrade(player, upgrade);
      }
    }

    expect(player.upgrades).toEqual({ gunDamage: 5, gunRange: 4, swordPower: 5, dashCapacity: 2, dashRecovery: 4 });
  });

  it("최대 단계의 파생 전투 수치를 계산한다", () => {
    expect(derivedStats({ gunDamage: 5, gunRange: 4, swordPower: 5, dashCapacity: 2, dashRecovery: 4 })).toEqual({
      gunDamage: 45,
      gunRange: 940,
      swordDamage: 78.75,
      swordRange: 150,
      dashMaxCharges: 3,
      dashRecoveryMs: 1566,
    });
  });

  it("상한에 도달한 영구 upgrade를 후보에서 제외한다", () => {
    expect(eligibleUpgradeTypes({ gunDamage: 5, gunRange: 0, swordPower: 5, dashCapacity: 2, dashRecovery: 4 })).toEqual([
      "gun-range",
      "ultimate-charge",
    ]);
    expect(eligibleUpgradeTypes({ gunDamage: 5, gunRange: 4, swordPower: 5, dashCapacity: 2, dashRecovery: 4 })).toEqual([
      "ultimate-charge",
    ]);
  });

  it("ultimate pickup은 영구 레벨 대신 charge를 즉시 100으로 만든다", () => {
    const player = createPlayer({ gunDamage: 1, gunRange: 2, swordPower: 3, dashCapacity: 1, dashRecovery: 2 });
    const upgraded = applyUpgrade(player, "ultimate-charge");

    expect(upgraded.ultimateCharge).toBe(100);
    expect(upgraded.upgrades).toEqual(player.upgrades);
  });
});