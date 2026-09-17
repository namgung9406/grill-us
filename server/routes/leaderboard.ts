import express, { Router, type RequestHandler } from "express";
import { z } from "zod";

import {
  leaderboardSubmissionSchema,
  type LeaderboardEntry,
  type LeaderboardSubmission,
} from "../../src/shared/leaderboard";
import type { AuthenticatedRequest } from "../auth/types";
import { LeaderboardRepository } from "../db/LeaderboardRepository";
import type { LeaderboardRow } from "../db/types";
import { ApiError } from "../http/errors";
import { calculateServerScore } from "../leaderboard/calculateServerScore";
import { consumeSubmissionAttempt } from "../leaderboard/rateLimit";
import { validateSubmission } from "../leaderboard/validateSubmission";

const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(10).default(10),
  })
  .strict();

export interface LeaderboardRouterDependencies {
  repository: LeaderboardRepository;
  authenticate: RequestHandler;
  rateLimitMaximum: number;
  now?: () => number;
}

function validationError(error: z.ZodError): ApiError {
  return new ApiError(
    422,
    "VALIDATION_ERROR",
    "요청 값이 올바르지 않습니다.",
    error.flatten().fieldErrors,
  );
}

function toEntry(row: LeaderboardRow): LeaderboardEntry {
  return {
    resultId: row.result_id,
    outcome: row.outcome,
    normalElapsedMs: row.normal_elapsed_ms,
    totalActiveMs: row.total_active_ms,
    enemyKills: row.enemy_kills,
    hitCount: row.hit_count,
    bossTimesMs: [row.boss1_ms, row.boss2_ms, row.boss3_ms],
    displayName: row.display_name,
    score: row.score,
    submittedAtMs: row.submitted_at_ms,
  };
}

function createRow(
  submission: LeaderboardSubmission,
  request: AuthenticatedRequest,
  submittedAtMs: number,
): LeaderboardRow {
  const [boss1Ms, boss2Ms, boss3Ms] = submission.bossTimesMs;
  return {
    result_id: submission.resultId,
    user_oid: request.principal.objectId,
    display_name: request.principal.displayName,
    outcome: submission.outcome,
    score: calculateServerScore(submission),
    normal_elapsed_ms: submission.normalElapsedMs,
    total_active_ms: submission.totalActiveMs,
    enemy_kills: submission.enemyKills,
    hit_count: submission.hitCount,
    boss1_ms: boss1Ms,
    boss2_ms: boss2Ms,
    boss3_ms: boss3Ms,
    boss_time_sort_ms: (boss1Ms ?? 120_000) + (boss2Ms ?? 180_000) + (boss3Ms ?? 300_000),
    submitted_at_ms: submittedAtMs,
  };
}

function hasSameImmutableSubmission(stored: LeaderboardRow, candidate: LeaderboardRow): boolean {
  return stored.result_id === candidate.result_id &&
    stored.user_oid === candidate.user_oid &&
    stored.outcome === candidate.outcome &&
    stored.score === candidate.score &&
    stored.normal_elapsed_ms === candidate.normal_elapsed_ms &&
    stored.total_active_ms === candidate.total_active_ms &&
    stored.enemy_kills === candidate.enemy_kills &&
    stored.hit_count === candidate.hit_count &&
    stored.boss1_ms === candidate.boss1_ms &&
    stored.boss2_ms === candidate.boss2_ms &&
    stored.boss3_ms === candidate.boss3_ms &&
    stored.boss_time_sort_ms === candidate.boss_time_sort_ms;
}

export function createLeaderboardRouter(dependencies: LeaderboardRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;

  router.get("/", dependencies.authenticate, (request, response) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw validationError(query.error);
    }
    response.json({ entries: dependencies.repository.listTop(query.data.limit).map(toEntry) });
  });

  router.post(
    "/results",
    dependencies.authenticate,
    (request, _response, next) => {
      const authenticatedRequest = request as AuthenticatedRequest;
      consumeSubmissionAttempt(
        dependencies.repository,
        authenticatedRequest.principal.objectId,
        now(),
        dependencies.rateLimitMaximum,
      );
      next();
    },
    express.json({ limit: "16kb" }),
    (request, response) => {
      const submission = leaderboardSubmissionSchema.safeParse(request.body);
      if (!submission.success) {
        throw validationError(submission.error);
      }
      validateSubmission(submission.data);

      const candidate = createRow(submission.data, request as AuthenticatedRequest, now());
      const result = dependencies.repository.insertOrGet(candidate);
      if (!result.inserted && !hasSameImmutableSubmission(result.row, candidate)) {
        throw new ApiError(409, "RESULT_ID_CONFLICT", "이미 다른 결과에 사용된 resultId입니다.");
      }

      response.status(result.inserted ? 201 : 200).json({
        entry: toEntry(result.row),
        ...(!result.inserted ? { duplicate: true as const } : {}),
      });
    },
  );

  return router;
}