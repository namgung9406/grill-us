import { GAME_BALANCE } from "./constants";
import type { RandomSource } from "./random";
import type { SpawnableEnemyType } from "./enemies";

export interface WaveBudget {
  tier: number;
  spawnIntervalMs: number;
  enemyCap: number;
}

const TYPE_WEIGHTS = {
  early: [
    ["chaser", 80],
    ["ranged", 20],
  ],
  middle: [
    ["chaser", 45],
    ["ranged", 25],
    ["splitter", 20],
    ["tank", 10],
  ],
  late: [
    ["chaser", 30],
    ["ranged", 25],
    ["splitter", 25],
    ["tank", 20],
  ],
} as const satisfies Record<string, readonly (readonly [SpawnableEnemyType, number])[]>;

export function getWaveBudget(normalElapsedMs: number): WaveBudget {
  if (!Number.isFinite(normalElapsedMs) || normalElapsedMs < 0) {
    throw new RangeError("normalElapsedMs must be a nonnegative finite number");
  }

  const tier = Math.floor(normalElapsedMs / GAME_BALANCE.waves.tierDurationMs);
  const baseInterval = Math.max(
    GAME_BALANCE.waves.minimumSpawnIntervalMs,
    GAME_BALANCE.waves.baseSpawnIntervalMs - tier * GAME_BALANCE.waves.spawnIntervalReductionPerTierMs,
  );
  const baseCap = Math.min(
    GAME_BALANCE.waves.preHordeEnemyCap,
    GAME_BALANCE.waves.baseEnemyCap + tier * GAME_BALANCE.waves.enemyCapPerTier,
  );
  const isHorde = normalElapsedMs >= GAME_BALANCE.waves.hordeStartsAtMs;

  return {
    tier,
    spawnIntervalMs: isHorde
      ? Math.floor(baseInterval * GAME_BALANCE.waves.hordeIntervalMultiplier)
      : baseInterval,
    enemyCap: isHorde
      ? Math.min(GAME_BALANCE.limits.enemies, baseCap + GAME_BALANCE.waves.hordeAdditionalCap)
      : baseCap,
  };
}

export function selectEnemyType(tier: number, random: RandomSource | number): SpawnableEnemyType {
  if (!Number.isInteger(tier) || tier < 0) {
    throw new RangeError("tier must be a nonnegative integer");
  }

  const roll = typeof random === "number" ? random : random.next();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError("random roll must be in [0, 1)");
  }

  const weights = tier <= 3 ? TYPE_WEIGHTS.early : tier <= 9 ? TYPE_WEIGHTS.middle : TYPE_WEIGHTS.late;
  const target = roll * 100;
  let cumulativeWeight = 0;
  for (const [type, weight] of weights) {
    cumulativeWeight += weight;
    if (target < cumulativeWeight) {
      return type;
    }
  }

  throw new Error("enemy weights must cover the complete random range");
}