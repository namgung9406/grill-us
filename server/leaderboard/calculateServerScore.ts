import type { LeaderboardSubmission } from "../../src/shared/leaderboard";
import { calculateScore } from "../../src/games/dex-survivor/domain/score";

export function calculateServerScore(submission: LeaderboardSubmission): number {
  return calculateScore({
    outcome: submission.outcome,
    enemyKills: submission.enemyKills,
    hitCount: submission.hitCount,
    bossTimesMs: submission.bossTimesMs,
  });
}