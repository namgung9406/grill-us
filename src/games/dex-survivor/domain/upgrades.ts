import { GAME_BALANCE } from "./constants";
import type { PlayerSnapshot, UpgradeLevels, UpgradeType } from "./types";

export interface DerivedPlayerStats {
  gunDamage: number;
  gunRange: number;
  swordDamage: number;
  swordRange: number;
  dashMaxCharges: number;
  dashRecoveryMs: number;
}

const PERMANENT_UPGRADES = [
  "gun-damage",
  "gun-range",
  "sword-power",
  "dash-capacity",
  "dash-recovery",
] as const satisfies readonly UpgradeType[];

function boundedLevel(level: number, maximum: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.min(maximum, Math.max(0, Math.floor(level)));
}

export function normalizeUpgradeLevels(levels: UpgradeLevels): UpgradeLevels {
  const maximums = GAME_BALANCE.upgrades.maxLevels;
  return {
    gunDamage: boundedLevel(levels.gunDamage, maximums.gunDamage),
    gunRange: boundedLevel(levels.gunRange, maximums.gunRange),
    swordPower: boundedLevel(levels.swordPower, maximums.swordPower),
    dashCapacity: boundedLevel(levels.dashCapacity, maximums.dashCapacity),
    dashRecovery: boundedLevel(levels.dashRecovery, maximums.dashRecovery),
  };
}

export function derivedStats(levels: UpgradeLevels): DerivedPlayerStats {
  const normalized = normalizeUpgradeLevels(levels);
  const { player, upgrades } = GAME_BALANCE;
  return {
    gunDamage: player.gun.damage * (1 + normalized.gunDamage * upgrades.damageMultiplierPerLevel),
    gunRange: player.gun.range + normalized.gunRange * upgrades.gunRangePerLevel,
    swordDamage: player.sword.damage * (1 + normalized.swordPower * upgrades.damageMultiplierPerLevel),
    swordRange: player.sword.range + normalized.swordPower * upgrades.swordRangePerLevel,
    dashMaxCharges: player.dash.baseCharges + normalized.dashCapacity,
    dashRecoveryMs: Math.round(
      Math.max(
        upgrades.minimumDashRecoveryMs,
        player.dash.recoveryMs * upgrades.dashRecoveryMultiplierPerLevel ** normalized.dashRecovery,
      ),
    ),
  };
}

export function eligibleUpgradeTypes(levels: UpgradeLevels): readonly UpgradeType[] {
  const normalized = normalizeUpgradeLevels(levels);
  const maximums = GAME_BALANCE.upgrades.maxLevels;
  const eligible = PERMANENT_UPGRADES.filter((upgrade) => {
    switch (upgrade) {
      case "gun-damage":
        return normalized.gunDamage < maximums.gunDamage;
      case "gun-range":
        return normalized.gunRange < maximums.gunRange;
      case "sword-power":
        return normalized.swordPower < maximums.swordPower;
      case "dash-capacity":
        return normalized.dashCapacity < maximums.dashCapacity;
      case "dash-recovery":
        return normalized.dashRecovery < maximums.dashRecovery;
    }
  });

  return [...eligible, "ultimate-charge"];
}

export function applyUpgrade(player: PlayerSnapshot, upgrade: UpgradeType): PlayerSnapshot {
  if (upgrade === "ultimate-charge") {
    return { ...player, ultimateCharge: GAME_BALANCE.player.ultimate.maxCharge };
  }

  const levels = normalizeUpgradeLevels(player.upgrades);
  const maximums = GAME_BALANCE.upgrades.maxLevels;
  switch (upgrade) {
    case "gun-damage":
      levels.gunDamage = Math.min(levels.gunDamage + 1, maximums.gunDamage);
      break;
    case "gun-range":
      levels.gunRange = Math.min(levels.gunRange + 1, maximums.gunRange);
      break;
    case "sword-power":
      levels.swordPower = Math.min(levels.swordPower + 1, maximums.swordPower);
      break;
    case "dash-capacity":
      levels.dashCapacity = Math.min(levels.dashCapacity + 1, maximums.dashCapacity);
      break;
    case "dash-recovery":
      levels.dashRecovery = Math.min(levels.dashRecovery + 1, maximums.dashRecovery);
      break;
  }

  return { ...player, upgrades: levels };
}