import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import type { PendingResultStore } from "@/games/dex-survivor/persistence/PendingResultStore";

import { createLeaderboardApi, LeaderboardApiError, type LeaderboardApi } from "./api";
import { isLeaderboardEnabled } from "./queries";
import {
  pendingResultStore,
  setPendingResultStatus,
  subscribePendingResultRetry,
  usePendingResults,
} from "./usePendingResults";

interface PendingResultSyncProps {
  api?: LeaderboardApi;
  store?: PendingResultStore;
  enabled?: boolean;
}

function useOnlineSignal(): { online: boolean; version: number } {
  const [signal, setSignal] = useState(() => ({
    online: typeof navigator !== "undefined" && navigator.onLine,
    version: 0,
  }));

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const update = (): void => {
      setSignal((current) => ({ online: navigator.onLine, version: current.version + 1 }));
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return signal;
}

export function PendingResultSync({ api, store = pendingResultStore, enabled }: PendingResultSyncProps) {
  const { acquireApiToken, status, user } = useAuth();
  const envEnabled = isLeaderboardEnabled();
  const isEnabled = enabled ?? envEnabled;
  const defaultApi = useMemo(() => createLeaderboardApi(acquireApiToken), [acquireApiToken]);
  const leaderboardApi = api ?? defaultApi;
  const ownerObjectId = status === "authenticated" ? user?.objectId ?? null : null;
  const results = usePendingResults(ownerObjectId, store);
  const onlineSignal = useOnlineSignal();
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (ownerObjectId === null) {
      return undefined;
    }
    return subscribePendingResultRetry(ownerObjectId, () => {
      setRetryVersion((current) => current + 1);
    });
  }, [ownerObjectId]);

  useEffect(() => {
    const result = results[0];
    if (!isEnabled || !onlineSignal.online || ownerObjectId === null || result === undefined) {
      return undefined;
    }

    const controller = new AbortController();
    let retryTimer: number | null = null;
    setPendingResultStatus(ownerObjectId, result.resultId, {
      state: "syncing",
      message: null,
      retryAtEpochMs: null,
    });

    const synchronize = async (): Promise<void> => {
      try {
        await leaderboardApi.submit(result, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        store.remove(ownerObjectId, result.resultId);
        setPendingResultStatus(ownerObjectId, result.resultId, null);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          return;
        }

        if (error instanceof LeaderboardApiError) {
          if (error.status === 422 || error.status === 409) {
            setPendingResultStatus(ownerObjectId, result.resultId, {
              state: "action-required",
              message: error.message,
              retryAtEpochMs: null,
            });
            return;
          }
          if (error.status === 429) {
            const retryAfterSeconds = error.retryAfterSeconds;
            setPendingResultStatus(ownerObjectId, result.resultId, {
              state: "waiting",
              message: "요청 제한이 해제될 때까지 기다리는 중입니다.",
              retryAtEpochMs: retryAfterSeconds === null ? null : Date.now() + retryAfterSeconds * 1_000,
            });
            if (retryAfterSeconds !== null) {
              retryTimer = window.setTimeout(() => {
                setRetryVersion((current) => current + 1);
              }, retryAfterSeconds * 1_000);
            }
            return;
          }
          if (error.status === 401 || error.status === 403) {
            setPendingResultStatus(ownerObjectId, result.resultId, {
              state: "waiting",
              message: "인증을 복구한 뒤 다시 시도해주세요.",
              retryAtEpochMs: null,
            });
            return;
          }
        }

        setPendingResultStatus(ownerObjectId, result.resultId, {
          state: "waiting",
          message: "연결이 복구되면 다시 시도할 수 있습니다.",
          retryAtEpochMs: null,
        });
      }
    };
    void synchronize();

    return () => {
      controller.abort();
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [isEnabled, leaderboardApi, onlineSignal, ownerObjectId, results, retryVersion, store]);

  return null;
}