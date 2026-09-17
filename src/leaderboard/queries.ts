import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { RunResult } from "@/games/dex-survivor/domain/types";

import type { LeaderboardApi } from "./api";

export const leaderboardTopTenKey = ["leaderboard", "top", 10] as const;

export function isLeaderboardEnabled(): boolean {
  return import.meta.env.VITE_LEADERBOARD_ENABLED === "true";
}

export function leaderboardQueryOptions(api: LeaderboardApi, enabled = true) {
  return queryOptions({
    queryKey: leaderboardTopTenKey,
    queryFn: () => api.list(10),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export interface SubmitResultVariables {
  result: RunResult;
  signal?: AbortSignal;
}

export function useSubmitResult(api: LeaderboardApi) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ result, signal }: SubmitResultVariables) => api.submit(result, signal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leaderboardTopTenKey }),
    retry: false,
  });
}