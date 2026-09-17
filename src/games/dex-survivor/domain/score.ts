import { GAME_BALANCE } from "./constants";
import type { RunOutcome, RunResult } from "./types";

export interface ScoreInput {
  outcome: RunOutcome;
  enemyKills: number;
  hitCount: number;
  bossTimesMs: readonly [number | null, number | null, number | null];
}

export interface CreateRunResultInput extends ScoreInput {
  resultId: string;
  ownerObjectId: string;
  normalElapsedMs: number;
  totalActiveMs: number;
  completedAtEpochMs: number;
}

export function calculateScore(input: ScoreInput): number {
  const bossBonus = input.bossTimesMs.reduce<number>((total, bossTimeMs, bossIndex) => {
    if (bossTimeMs === null) {
      return total;
    }

    const thresholdMs = GAME_BALANCE.score.bossThresholdsMs[bossIndex];
    if (thresholdMs === undefined) {
      return total;
    }

    const bonus = Math.floor(
      Math.max(0, (thresholdMs - bossTimeMs) / 1000) * GAME_BALANCE.score.bossPointsPerSecond,
    );
    return total + bonus;
  }, 0);

  const clearBonus = input.outcome === "cleared" ? GAME_BALANCE.score.clear : 0;
  return Math.floor(
    input.enemyKills * GAME_BALANCE.score.enemyKill +
      input.hitCount * GAME_BALANCE.score.hit +
      bossBonus +
      clearBonus,
  );
}

export function createRunResult(input: CreateRunResultInput): RunResult {
  return {
    resultId: input.resultId,
    ownerObjectId: input.ownerObjectId,
    outcome: input.outcome,
    score: calculateScore(input),
    normalElapsedMs: input.normalElapsedMs,
    totalActiveMs: input.totalActiveMs,
    enemyKills: input.enemyKills,
    hitCount: input.hitCount,
    bossTimesMs: input.bossTimesMs,
    completedAtEpochMs: input.completedAtEpochMs,
  };
}