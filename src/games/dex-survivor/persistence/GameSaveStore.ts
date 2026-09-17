import { gameSaveV1Schema } from "../domain/schemas";
import type { GameSaveV1 } from "../domain/types";
import { saveKey } from "./keys";

export interface StorageResult {
  ok: boolean;
  reason?: "quota" | "unavailable" | "invalid";
}

function storageFailure(error: object): StorageResult {
  const { name } = error as { name?: string };
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return { ok: false, reason: "quota" };
  }
  return { ok: false, reason: "unavailable" };
}

export class GameSaveStore {
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

  public read(ownerObjectId: string): GameSaveV1 | null {
    if (this.#storage === null) {
      return null;
    }

    const key = saveKey(ownerObjectId);
    try {
      const stored = this.#storage.getItem(key);
      if (stored === null) {
        return null;
      }

      let parsed: ReturnType<typeof gameSaveV1Schema.safeParse>;
      try {
        parsed = gameSaveV1Schema.safeParse(JSON.parse(stored));
      } catch {
        this.remove(ownerObjectId);
        return null;
      }
      if (!parsed.success || parsed.data.ownerObjectId !== ownerObjectId) {
        this.remove(ownerObjectId);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  public write(save: GameSaveV1): StorageResult {
    const parsed = gameSaveV1Schema.safeParse(save);
    if (!parsed.success) {
      return { ok: false, reason: "invalid" };
    }
    if (this.#storage === null) {
      return { ok: false, reason: "unavailable" };
    }

    try {
      this.#storage.setItem(saveKey(parsed.data.ownerObjectId), JSON.stringify(parsed.data));
      return { ok: true };
    } catch (error) {
      return storageFailure(typeof error === "object" && error !== null ? error : new Error("Storage unavailable"));
    }
  }

  public remove(ownerObjectId: string): void {
    try {
      this.#storage?.removeItem(saveKey(ownerObjectId));
    } catch {
      // Storage access can be denied; removal remains best effort.
    }
  }
}