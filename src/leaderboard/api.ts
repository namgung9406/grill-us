import ky, { HTTPError, type KyInstance } from "ky";
import type { ZodType } from "zod";

import type { RunResult } from "@/games/dex-survivor/domain/types";
import {
  apiErrorBodySchema,
  leaderboardListResponseSchema,
  leaderboardSubmissionResponseSchema,
  type LeaderboardEntry,
  type LeaderboardSubmission,
} from "@/shared/leaderboard";

export class LeaderboardApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly retryAfterSeconds: number | null,
    message: string,
  ) {
    super(message);
    this.name = "LeaderboardApiError";
  }
}

export interface LeaderboardApi {
  list(limit?: number): Promise<readonly LeaderboardEntry[]>;
  submit(result: RunResult, signal?: AbortSignal): Promise<LeaderboardEntry>;
}

function toSubmission(result: RunResult): LeaderboardSubmission {
  return {
    resultId: result.resultId,
    outcome: result.outcome,
    normalElapsedMs: result.normalElapsedMs,
    totalActiveMs: result.totalActiveMs,
    enemyKills: result.enemyKills,
    hitCount: result.hitCount,
    bossTimesMs: result.bossTimesMs,
  };
}

async function toApiError(error: HTTPError): Promise<LeaderboardApiError> {
  const parsedBody = apiErrorBodySchema.safeParse(await error.response.clone().json().catch(() => null));
  const retryAfterValue = Number(error.response.headers.get("Retry-After"));
  return new LeaderboardApiError(
    error.response.status,
    parsedBody.success ? parsedBody.data.error.code : "HTTP_ERROR",
    Number.isInteger(retryAfterValue) && retryAfterValue > 0 ? retryAfterValue : null,
    parsedBody.success ? parsedBody.data.error.message : "리더보드 요청을 처리하지 못했습니다.",
  );
}

async function requestJson<Result>(request: Promise<Response>, schema: ZodType<Result>): Promise<Result> {
  try {
    return schema.parse(await (await request).json());
  } catch (error) {
    if (error instanceof HTTPError) {
      throw await toApiError(error);
    }
    throw error;
  }
}

export function createLeaderboardApi(getToken: () => Promise<string>): LeaderboardApi {
  const client: KyInstance = ky.create({
    prefixUrl: new URL("/api/", window.location.origin).href,
    retry: 0,
    hooks: {
      beforeRequest: [async (request) => {
        request.headers.set("Authorization", `Bearer ${await getToken()}`);
      }],
    },
  });

  return {
    async list(limit = 10) {
      return (await requestJson(client.get("leaderboard", { searchParams: { limit } }), leaderboardListResponseSchema)).entries;
    },
    async submit(result, signal) {
      return (await requestJson(
        client.post("leaderboard/results", {
          json: toSubmission(result),
          ...(signal === undefined ? {} : { signal }),
        }),
        leaderboardSubmissionResponseSchema,
      )).entry;
    },
  };
}