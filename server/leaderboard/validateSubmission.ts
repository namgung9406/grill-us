import type { LeaderboardSubmission } from "../../src/shared/leaderboard";
import { ApiError } from "../http/errors";

const BOSS_MINIMUM_TIMES_MS = [15_000, 20_000, 30_000] as const;
const BOSS_UNLOCK_TIMES_MS = [300_000, 600_000, 900_000] as const;
const MAX_UNFINISHED_BOSS_TIME_MS = 3_600_000;

function rejectImplausibleResult(message: string): never {
  throw new ApiError(422, "IMPLAUSIBLE_RESULT", message);
}

export function validateSubmission(submission: LeaderboardSubmission): void {
  const [boss1Ms, boss2Ms, boss3Ms] = submission.bossTimesMs;
  const bossTimes = [boss1Ms, boss2Ms, boss3Ms] as const;

  if ((boss2Ms !== null && boss1Ms === null) || (boss3Ms !== null && boss2Ms === null)) {
    rejectImplausibleResult("보스 완료 기록은 순서대로 제출해야 합니다.");
  }

  if (submission.outcome === "cleared") {
    if (bossTimes.some((bossTimeMs) => bossTimeMs === null) || submission.normalElapsedMs !== 900_000) {
      rejectImplausibleResult("클리어 결과에는 모든 보스 기록과 완료된 일반 구간이 필요합니다.");
    }
  } else if (boss3Ms !== null) {
    rejectImplausibleResult("패배 결과에는 세 번째 보스 완료 기록을 포함할 수 없습니다.");
  }

  bossTimes.forEach((bossTimeMs, bossIndex) => {
    if (bossTimeMs === null) {
      return;
    }
    const minimumTimeMs = BOSS_MINIMUM_TIMES_MS[bossIndex];
    const unlockTimeMs = BOSS_UNLOCK_TIMES_MS[bossIndex];
    if (minimumTimeMs === undefined || unlockTimeMs === undefined) {
      rejectImplausibleResult("알 수 없는 보스 기록입니다.");
    }
    if (bossTimeMs < minimumTimeMs) {
      rejectImplausibleResult("보스 처치 시간이 허용 범위보다 짧습니다.");
    }
    if (submission.normalElapsedMs < unlockTimeMs) {
      rejectImplausibleResult("일반 구간 진행 시간보다 앞선 보스 기록입니다.");
    }
  });

  if (submission.outcome === "defeated" && submission.totalActiveMs < 5_000) {
    rejectImplausibleResult("패배 결과의 활성 시간이 너무 짧습니다.");
  }

  const completedBossTimeMs = bossTimes.reduce<number>(
    (total, bossTimeMs) => total + (bossTimeMs ?? 0),
    0,
  );
  const accountedTimeMs = submission.normalElapsedMs + completedBossTimeMs;
  const unaccountedTimeMs = submission.totalActiveMs - accountedTimeMs;
  if (unaccountedTimeMs < 0 || unaccountedTimeMs > MAX_UNFINISHED_BOSS_TIME_MS) {
    rejectImplausibleResult("활성 시간과 진행 기록이 일치하지 않습니다.");
  }

  if (submission.enemyKills > Math.floor(submission.totalActiveMs / 100) + 20) {
    rejectImplausibleResult("처치 수가 활성 시간에 비해 지나치게 많습니다.");
  }
  if (submission.hitCount > Math.ceil(submission.totalActiveMs / 250) + 1) {
    rejectImplausibleResult("피격 수가 활성 시간에 비해 지나치게 많습니다.");
  }
}