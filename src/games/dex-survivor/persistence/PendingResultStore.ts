import { z } from "zod";

import { runResultSchema } from "../domain/schemas";
import type { RunResult } from "../domain/types";
import type { StorageResult } from "./GameSaveStore";
import { pendingResultsKey } from "./keys";

const pendingResultsSchema = z.array(runResultSchema);

type PendingResultListener = () => void;

const listenersByOwner = new Map<string, Set<PendingResultListener>>();

function notifyOwner(ownerObjectId: string): void {
  listenersByOwner.get(ownerObjectId)?.forEach((listener) => listener());
}

function storageFailure(error: object): StorageResult {
  const { name } = error as { name?: string };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED"
    ? { ok: false, reason: "quota" }
    : { ok: false, reason: "unavailable" };
}

export class PendingResultStore {
  readonly #storage: Storage | null;
  readonly #cache = new Map<
    string,
    { serialized: string | null; value: { ok: true; results: readonly RunResult[] } | { ok: false } }
  >();

  public constructor(storage?: Storage) {
    if (storage !== undefined) {
      this.#storage = storage;
      return;
    }

    try {
      this.#storage = localStorage;
    } catch {
      this.#storage = null;
    }
  }

  public list(ownerObjectId: string): readonly RunResult[] {
    const stored = this.#read(ownerObjectId);
    return stored.ok ? stored.results : [];
  }

  public subscribe(ownerObjectId: string, listener: PendingResultListener): () => void {
    const listeners = listenersByOwner.get(ownerObjectId) ?? new Set<PendingResultListener>();
    listeners.add(listener);
    listenersByOwner.set(ownerObjectId, listeners);

    const handleStorage = (event: StorageEvent): void => {
      if (event.key === pendingResultsKey(ownerObjectId)) {
        listener();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        listenersByOwner.delete(ownerObjectId);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage);
      }
    };
  }

  public append(result: RunResult): StorageResult {
    const parsedResult = runResultSchema.safeParse(result);
    if (!parsedResult.success) {
      return { ok: false, reason: "invalid" };
    }
    if (this.#storage === null) {
      return { ok: false, reason: "unavailable" };
    }

    const stored = this.#read(result.ownerObjectId);
    if (!stored.ok) {
      return { ok: false, reason: "invalid" };
    }
    if (stored.results.some(({ resultId }) => resultId === result.resultId)) {
      return { ok: true };
    }

    try {
      this.#storage.setItem(
        pendingResultsKey(result.ownerObjectId),
        JSON.stringify([...stored.results, parsedResult.data]),
      );
      notifyOwner(result.ownerObjectId);
      return { ok: true };
    } catch (error) {
      return storageFailure(typeof error === "object" && error !== null ? error : new Error("Storage unavailable"));
    }
  }

  public remove(ownerObjectId: string, resultId: string): void {
    if (this.#storage === null) {
      return;
    }

    const stored = this.#read(ownerObjectId);
    if (!stored.ok) {
      return;
    }
    const remaining = stored.results.filter((result) => result.resultId !== resultId);
    if (remaining.length === stored.results.length) {
      return;
    }

    try {
      if (remaining.length === 0) {
        this.#storage.removeItem(pendingResultsKey(ownerObjectId));
      } else {
        this.#storage.setItem(pendingResultsKey(ownerObjectId), JSON.stringify(remaining));
      }
      notifyOwner(ownerObjectId);
    } catch {
      // Queue removal is best effort and must not interrupt the game.
    }
  }

  #read(ownerObjectId: string): { ok: true; results: readonly RunResult[] } | { ok: false } {
    if (this.#storage === null) {
      return { ok: false };
    }

    try {
      const value = this.#storage.getItem(pendingResultsKey(ownerObjectId));
      const cached = this.#cache.get(ownerObjectId);
      if (cached !== undefined && cached.serialized === value) {
        return cached.value;
      }
      if (value === null) {
        const empty = { ok: true as const, results: [] };
        this.#cache.set(ownerObjectId, { serialized: value, value: empty });
        return empty;
      }
      const parsed = pendingResultsSchema.safeParse(JSON.parse(value));
      if (!parsed.success || parsed.data.some((result) => result.ownerObjectId !== ownerObjectId)) {
        const invalid = { ok: false as const };
        this.#cache.set(ownerObjectId, { serialized: value, value: invalid });
        return invalid;
      }
      const stored = { ok: true as const, results: parsed.data };
      this.#cache.set(ownerObjectId, { serialized: value, value: stored });
      return stored;
    } catch {
      return { ok: false };
    }
  }
}