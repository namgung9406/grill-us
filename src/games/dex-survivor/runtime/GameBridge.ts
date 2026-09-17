import type { GamePhase } from "../domain/types";

export interface GameViewState {
  hp: number;
  maxHp: number;
  dashCharges: number;
  dashMax: number;
  swordStormCooldownMs: number;
  ultimateCharge: number;
  normalElapsedMs: number;
  phase: GamePhase;
  bossHp: number | null;
  bossMaxHp: number | null;
}

export type GameCommand = { type: "pause" } | { type: "resume" } | { type: "restart" };

export interface GameBridgeScheduler {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const HUD_INTERVAL_MS = 50;

const browserScheduler: GameBridgeScheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

function immutableSnapshot(snapshot: GameViewState): GameViewState {
  return Object.freeze({ ...snapshot });
}

export class GameBridge {
  readonly #scheduler: GameBridgeScheduler;
  readonly #listeners = new Set<() => void>();
  readonly #commandListeners = new Set<(command: GameCommand) => void>();
  #snapshot: GameViewState;
  #pendingSnapshot: GameViewState | null = null;
  #lastPublicationMs: number;
  #timer: unknown = null;
  #destroyed = false;

  public constructor(initialSnapshot: GameViewState, scheduler: GameBridgeScheduler = browserScheduler) {
    this.#snapshot = immutableSnapshot(initialSnapshot);
    this.#scheduler = scheduler;
    this.#lastPublicationMs = scheduler.now();
  }

  public readonly getSnapshot = (): GameViewState => this.#snapshot;

  public readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#destroyed) {
      return () => undefined;
    }

    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  public subscribeCommands(listener: (command: GameCommand) => void): () => void {
    if (this.#destroyed) {
      return () => undefined;
    }

    this.#commandListeners.add(listener);
    return () => {
      this.#commandListeners.delete(listener);
    };
  }

  public dispatch(command: GameCommand): void {
    if (this.#destroyed) {
      return;
    }

    for (const listener of this.#commandListeners) {
      listener(command);
    }
  }

  public publish(snapshot: GameViewState): void {
    if (this.#destroyed) {
      return;
    }

    this.#pendingSnapshot = immutableSnapshot(snapshot);
    const elapsedMs = this.#scheduler.now() - this.#lastPublicationMs;
    if (elapsedMs >= HUD_INTERVAL_MS) {
      this.#flush();
      return;
    }

    if (this.#timer === null) {
      this.#timer = this.#scheduler.setTimeout(() => this.#flush(), HUD_INTERVAL_MS - elapsedMs);
    }
  }

  public cancelPendingPublication(): void {
    if (this.#timer !== null) {
      this.#scheduler.clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#pendingSnapshot = null;
  }

  public destroy(): void {
    if (this.#destroyed) {
      return;
    }

    this.#destroyed = true;
    this.cancelPendingPublication();
    this.#listeners.clear();
    this.#commandListeners.clear();
  }

  public listenerCount(): number {
    return this.#listeners.size + this.#commandListeners.size;
  }

  #flush(): void {
    if (this.#destroyed || this.#pendingSnapshot === null) {
      this.#timer = null;
      return;
    }

    if (this.#timer !== null) {
      this.#scheduler.clearTimeout(this.#timer);
    }
    this.#snapshot = this.#pendingSnapshot;
    this.#pendingSnapshot = null;
    this.#lastPublicationMs = this.#scheduler.now();
    this.#timer = null;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}