import { useCallback, useSyncExternalStore } from "react";

import type { RunResult } from "@/games/dex-survivor/domain/types";
import { PendingResultStore } from "@/games/dex-survivor/persistence/PendingResultStore";

export type PendingSyncState = "pending" | "syncing" | "waiting" | "action-required";

export interface PendingResultStatus {
  state: PendingSyncState;
  message: string | null;
  retryAtEpochMs: number | null;
}

type Listener = () => void;

export const pendingResultStore = new PendingResultStore();

const emptyResults: readonly RunResult[] = [];
const emptyStatuses: ReadonlyMap<string, PendingResultStatus> = new Map();

const statusesByOwner = new Map<string, ReadonlyMap<string, PendingResultStatus>>();
const statusListenersByOwner = new Map<string, Set<Listener>>();
const retryListenersByOwner = new Map<string, Set<Listener>>();

function subscribeToOwner(
  listenersByOwner: Map<string, Set<Listener>>,
  ownerObjectId: string,
  listener: Listener,
): () => void {
  const listeners = listenersByOwner.get(ownerObjectId) ?? new Set<Listener>();
  listeners.add(listener);
  listenersByOwner.set(ownerObjectId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      listenersByOwner.delete(ownerObjectId);
    }
  };
}

function notify(listenersByOwner: Map<string, Set<Listener>>, ownerObjectId: string): void {
  listenersByOwner.get(ownerObjectId)?.forEach((listener) => listener());
}

export function setPendingResultStatus(
  ownerObjectId: string,
  resultId: string,
  status: PendingResultStatus | null,
): void {
  const nextStatuses = new Map(statusesByOwner.get(ownerObjectId) ?? []);
  if (status === null) {
    nextStatuses.delete(resultId);
  } else {
    nextStatuses.set(resultId, status);
  }
  statusesByOwner.set(ownerObjectId, nextStatuses);
  notify(statusListenersByOwner, ownerObjectId);
}

export function requestPendingResultRetry(ownerObjectId: string): void {
  notify(retryListenersByOwner, ownerObjectId);
}

export function subscribePendingResultRetry(ownerObjectId: string, listener: Listener): () => void {
  return subscribeToOwner(retryListenersByOwner, ownerObjectId, listener);
}

export function usePendingResults(
  ownerObjectId: string | null,
  store: PendingResultStore = pendingResultStore,
): readonly RunResult[] {
  const subscribe = useCallback(
    (listener: Listener) => ownerObjectId === null ? () => undefined : store.subscribe(ownerObjectId, listener),
    [ownerObjectId, store],
  );
  const getSnapshot = useCallback(
    () => ownerObjectId === null ? emptyResults : store.list(ownerObjectId),
    [ownerObjectId, store],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => emptyResults);
}

export function usePendingResultStatuses(ownerObjectId: string | null): ReadonlyMap<string, PendingResultStatus> {
  const subscribe = useCallback(
    (listener: Listener) => ownerObjectId === null
      ? () => undefined
      : subscribeToOwner(statusListenersByOwner, ownerObjectId, listener),
    [ownerObjectId],
  );
  const getSnapshot = useCallback(
    () => ownerObjectId === null ? emptyStatuses : statusesByOwner.get(ownerObjectId) ?? emptyStatuses,
    [ownerObjectId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => emptyStatuses);
}