import { z } from "zod";

const bossTimeSchema = z.number().int().min(1_000).max(3_600_000).nullable();

export const leaderboardSubmissionSchema = z
  .object({
    resultId: z.uuid(),
    outcome: z.enum(["cleared", "defeated"]),
    normalElapsedMs: z.number().int().min(0).max(900_000),
    totalActiveMs: z.number().int().min(0).max(14_400_000),
    enemyKills: z.number().int().min(0).max(50_000),
    hitCount: z.number().int().min(0).max(1_000),
    bossTimesMs: z.tuple([bossTimeSchema, bossTimeSchema, bossTimeSchema]).readonly(),
  })
  .strict();

export const leaderboardEntrySchema = leaderboardSubmissionSchema.extend({
  displayName: z.string().trim().min(1).max(200),
  score: z.number().int(),
  submittedAtMs: z.number().int().nonnegative(),
});

export const leaderboardSubmissionResponseSchema = z.object({
  entry: leaderboardEntrySchema,
  duplicate: z.literal(true).optional(),
});

export const leaderboardListResponseSchema = z.object({
  entries: z.array(leaderboardEntrySchema).max(10),
});

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    fieldErrors: z.record(z.string(), z.array(z.string()).readonly()).optional(),
  }),
});

export type LeaderboardSubmission = z.infer<typeof leaderboardSubmissionSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardSubmissionResponse = z.infer<typeof leaderboardSubmissionResponseSchema>;
export type LeaderboardListResponse = z.infer<typeof leaderboardListResponseSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;