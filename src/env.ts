import { z } from "zod";

const requiredText = z.string().trim().min(1);
const optionalApiScope = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().trim().startsWith("api://").endsWith("/Leaderboard.Access").nullable(),
);
const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const clientEnvSchema = z
  .object({
    VITE_ENTRA_CLIENT_ID: requiredText,
    VITE_ENTRA_TENANT_ID: requiredText,
    VITE_ENTRA_REDIRECT_URI: z.url(),
    VITE_ENTRA_API_SCOPE: optionalApiScope,
    VITE_LEADERBOARD_ENABLED: booleanString,
    VITE_E2E_AUTH: booleanString,
  })
  .superRefine((value, context) => {
    if (value.VITE_LEADERBOARD_ENABLED && value.VITE_ENTRA_API_SCOPE === null) {
      context.addIssue({
        code: "custom",
        path: ["VITE_ENTRA_API_SCOPE"],
        message: "리더보드를 사용하려면 API scope가 필요합니다.",
      });
    }
  });

export interface ClientEnv {
  VITE_ENTRA_CLIENT_ID: string;
  VITE_ENTRA_TENANT_ID: string;
  VITE_ENTRA_REDIRECT_URI: string;
  VITE_ENTRA_API_SCOPE: string | null;
  VITE_LEADERBOARD_ENABLED: boolean;
  VITE_E2E_AUTH: boolean;
}

export function parseClientEnv(env: ImportMetaEnv, mode: string): ClientEnv {
  const parsed = clientEnvSchema.parse(env);

  if (mode === "production" && (parsed.VITE_E2E_AUTH || parsed.VITE_LEADERBOARD_ENABLED)) {
    throw new Error("운영 모드에서는 E2E 인증과 개발 리더보드를 활성화할 수 없습니다.");
  }

  return parsed;
}