import type { GameSaveV1 } from "../domain/types";
import type { StorageResult } from "./GameSaveStore";

const SAVE_INTERVAL_MS = 500;

export interface AutoSaveScheduler {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

const browserScheduler: AutoSaveScheduler = {
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export class AutoSaveController {
  readonly #exportSnapshot: () => GameSaveV1;
  readonly #write: (snapshot: GameSaveV1) => StorageResult;
  readonly #onResult: (result: StorageResult) => void;
  readonly #scheduler: AutoSaveScheduler;
  #timer: number | null = null;
  #dirty = false;
  #disposed = false;

  public constructor(options: {
    exportSnapshot: () => GameSaveV1;
    write: (snapshot: GameSaveV1) => StorageResult;
    onResult?: (result: StorageResult) => void;
    scheduler?: AutoSaveScheduler;
  }) {
    this.#exportSnapshot = options.exportSnapshot;
    this.#write = options.write;
    this.#onResult = options.onResult ?? (() => undefined);
    this.#scheduler = options.scheduler ?? browserScheduler;
  }

  public markDirty(): void {
    if (this.#disposed) {
      return;
    }
    this.#dirty = true;
    this.#timer ??= this.#scheduler.setTimeout(() => {
      this.#timer = null;
      this.flush();
    }, SAVE_INTERVAL_MS);
  }

  public flush(): StorageResult | null {
    if (this.#timer !== null) {
      this.#scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (!this.#dirty || this.#disposed) {
      return null;
    }

    this.#dirty = false;
    let result: StorageResult;
    try {
      result = this.#write(this.#exportSnapshot());
    } catch {
      result = { ok: false, reason: "unavailable" };
    }
    if (!result.ok) {
      this.#dirty = true;
    }
    this.#onResult(result);
    return result;
  }

  public dispose(flush = true): void {
    if (flush) {
      this.flush();
    }
    if (this.#timer !== null) {
      this.#scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#disposed = true;
  }
}