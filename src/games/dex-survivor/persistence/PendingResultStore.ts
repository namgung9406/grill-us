import { z } from "zod";

import { runResultSchema } from "../domain/schemas";
import type { RunResult } from "../domain/types";
import type { StorageResult } from "./GameSaveStore";
import { pendingResultsKey } from "./keys";

const pendingResultsSchema = z.array(runResultSchema);

function storageFailure(error: object): StorageResult {
  const { name } = error as { name?: string };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED"
    ? { ok: false, reason: "quota" }
    : { ok: false, reason: "unavailable" };
}

export class PendingResultStore {
  readonly #storage: Storage | null;

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
      if (value === null) {
        return { ok: true, results: [] };
      }
      const parsed = pendingResultsSchema.safeParse(JSON.parse(value));
      if (!parsed.success || parsed.data.some((result) => result.ownerObjectId !== ownerObjectId)) {
        return { ok: false };
      }
      return { ok: true, results: parsed.data };
    } catch {
      return { ok: false };
    }
  }
}