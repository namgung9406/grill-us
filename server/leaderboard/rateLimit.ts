import { LeaderboardRepository } from "../db/LeaderboardRepository";
import { ApiError } from "../http/errors";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1_000;

export function consumeSubmissionAttempt(
  repository: LeaderboardRepository,
  userOid: string,
  attemptedAtMs: number,
  maximumAttempts: number,
): void {
  const attempt = repository.runInTransaction(() => {
    repository.deleteAttemptsBefore(attemptedAtMs - ATTEMPT_RETENTION_MS);
    repository.recordAttempt(userOid, attemptedAtMs);
    return {
      count: repository.countAttempts(userOid, attemptedAtMs - RATE_LIMIT_WINDOW_MS),
      oldestAttemptMs: repository.findOldestAttempt(userOid, attemptedAtMs - RATE_LIMIT_WINDOW_MS),
    };
  });

  if (attempt.count <= maximumAttempts) {
    return;
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(((attempt.oldestAttemptMs ?? attemptedAtMs) + RATE_LIMIT_WINDOW_MS - attemptedAtMs) / 1_000),
  );
  throw new ApiError(
    429,
    "RATE_LIMITED",
    "리더보드 제출 횟수를 초과했습니다.",
    undefined,
    { "Retry-After": String(retryAfterSeconds) },
  );
}