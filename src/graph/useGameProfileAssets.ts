import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { AuthenticatedUser } from "@/auth/types";

import type { GraphProfileService } from "./GraphProfileService";
import type { GameProfileAssets } from "./types";

interface UseGameProfileAssetsOptions {
  service: GraphProfileService;
  player: AuthenticatedUser | null;
  preferredCitizenIds?: readonly string[];
  enabled: boolean;
}

export function useGameProfileAssets({
  service,
  player,
  preferredCitizenIds = [],
  enabled,
}: UseGameProfileAssetsOptions) {
  const activeAssets = useRef<GameProfileAssets | null>(null);
  const pendingRelease = useRef<number | null>(null);
  const query = useQuery({
    queryKey: ["game-profile-assets", player?.objectId ?? null, preferredCitizenIds],
    enabled: enabled && player !== null,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => {
      if (player === null) {
        throw new Error("프로필 자산을 준비하려면 로그인 사용자가 필요합니다.");
      }
      return service.prepare({ player, preferredCitizenIds, signal });
    },
  });

  useEffect(() => {
    if (pendingRelease.current !== null) {
      window.clearTimeout(pendingRelease.current);
      pendingRelease.current = null;
    }

    const previous = activeAssets.current;
    if (previous !== query.data) {
      previous?.release();
      activeAssets.current = query.data ?? null;
    }

    return () => {
      const assetsAtCleanup = activeAssets.current;
      if (assetsAtCleanup !== null) {
        pendingRelease.current = window.setTimeout(() => {
          if (activeAssets.current === assetsAtCleanup) {
            assetsAtCleanup.release();
            activeAssets.current = null;
          }
        }, 0);
      }
    };
  }, [query.data]);

  return query;
}