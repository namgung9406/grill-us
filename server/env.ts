import { z } from "zod";

const nullableText = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().trim().min(1).nullable(),
);
const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const positiveIntegerString = (defaultValue: number, maximum: number) =>
  z.coerce.number().int().min(1).max(maximum).default(defaultValue);

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: positiveIntegerString(3001, 65_535),
    LEADERBOARD_ENABLED: booleanString,
    ENTRA_TENANT_ID: nullableText,
    ENTRA_API_AUDIENCE: nullableText,
    ENTRA_REQUIRED_SCOPE: z.literal("Leaderboard.Access").default("Leaderboard.Access"),
    LEADERBOARD_DEV_AUTH_BYPASS: booleanString,
    LEADERBOARD_DEV_USER_ID: nullableText,
    LEADERBOARD_DEV_DISPLAY_NAME: nullableText,
    LEADERBOARD_RATE_LIMIT_MAX: positiveIntegerString(5, 1_000),
    LEADERBOARD_DB_PATH: z.string().trim().min(1).default("server/data/leaderboard.sqlite"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.LEADERBOARD_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["LEADERBOARD_ENABLED"],
        message: "운영 환경에서는 리더보드를 활성화할 수 없습니다.",
      });
    }

    if (value.NODE_ENV === "production" && value.LEADERBOARD_DEV_AUTH_BYPASS) {
      context.addIssue({
        code: "custom",
        path: ["LEADERBOARD_DEV_AUTH_BYPASS"],
        message: "운영 환경에서는 개발 인증 우회를 활성화할 수 없습니다.",
      });
    }

    if (value.NODE_ENV !== "test" && value.LEADERBOARD_RATE_LIMIT_MAX !== 5) {
      context.addIssue({
        code: "custom",
        path: ["LEADERBOARD_RATE_LIMIT_MAX"],
        message: "테스트 환경 외에서는 rate limit을 변경할 수 없습니다.",
      });
    }

    if (value.LEADERBOARD_DEV_AUTH_BYPASS) {
      if (value.LEADERBOARD_DEV_USER_ID === null) {
        context.addIssue({
          code: "custom",
          path: ["LEADERBOARD_DEV_USER_ID"],
          message: "개발 인증 우회 사용자 ID가 필요합니다.",
        });
      }
      if (value.LEADERBOARD_DEV_DISPLAY_NAME === null) {
        context.addIssue({
          code: "custom",
          path: ["LEADERBOARD_DEV_DISPLAY_NAME"],
          message: "개발 인증 우회 사용자 이름이 필요합니다.",
        });
      }
      return;
    }

    if (value.LEADERBOARD_ENABLED) {
      if (value.ENTRA_TENANT_ID === null) {
        context.addIssue({
          code: "custom",
          path: ["ENTRA_TENANT_ID"],
          message: "리더보드 인증 tenant ID가 필요합니다.",
        });
      }
      if (value.ENTRA_API_AUDIENCE === null) {
        context.addIssue({
          code: "custom",
          path: ["ENTRA_API_AUDIENCE"],
          message: "리더보드 API audience가 필요합니다.",
        });
      }
    }
  });

export interface ServerEnv {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  LEADERBOARD_ENABLED: boolean;
  ENTRA_TENANT_ID: string | null;
  ENTRA_API_AUDIENCE: string | null;
  ENTRA_REQUIRED_SCOPE: "Leaderboard.Access";
  LEADERBOARD_DEV_AUTH_BYPASS: boolean;
  LEADERBOARD_DEV_USER_ID: string | null;
  LEADERBOARD_DEV_DISPLAY_NAME: string | null;
  LEADERBOARD_RATE_LIMIT_MAX: number;
  LEADERBOARD_DB_PATH: string;
}

export function parseServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(env);
}