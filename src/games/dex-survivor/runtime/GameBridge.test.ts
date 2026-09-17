import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameBridge, type GameViewState } from "./GameBridge";

function createViewState(overrides: Partial<GameViewState> = {}): GameViewState {
  return {
    hp: 100,
    maxHp: 100,
    dashCharges: 1,
    dashMax: 1,
    swordStormCooldownMs: 0,
    ultimateCharge: 0,
    normalElapsedMs: 0,
    phase: "normal",
    bossHp: null,
    bossMaxHp: null,
    ...overrides,
  };
}

describe("GameBridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces immutable HUD snapshots to at most 20Hz", () => {
    const bridge = new GameBridge(createViewState(), {
      now: () => Date.now(),
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const listener = vi.fn();
    bridge.subscribe(listener);

    bridge.publish(createViewState({ hp: 99 }));
    vi.advanceTimersByTime(49);
    bridge.publish(createViewState({ hp: 98 }));
    expect(listener).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(bridge.getSnapshot().hp).toBe(98);
    expect(Object.isFrozen(bridge.getSnapshot())).toBe(true);

    bridge.publish(createViewState({ hp: 97 }));
    bridge.publish(createViewState({ hp: 96 }));
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(bridge.getSnapshot().hp).toBe(96);
  });

  it("removes snapshot and command listeners and cancels pending publication", () => {
    const bridge = new GameBridge(createViewState(), {
      now: () => Date.now(),
      setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const snapshotListener = vi.fn();
    const commandListener = vi.fn();
    const unsubscribeSnapshot = bridge.subscribe(snapshotListener);
    const unsubscribeCommand = bridge.subscribeCommands(commandListener);
    expect(bridge.listenerCount()).toBe(2);

    bridge.dispatch({ type: "pause" });
    expect(commandListener).toHaveBeenCalledWith({ type: "pause" });
    unsubscribeSnapshot();
    unsubscribeCommand();
    expect(bridge.listenerCount()).toBe(0);

    bridge.subscribe(snapshotListener);
    bridge.subscribeCommands(commandListener);
    bridge.publish(createViewState({ hp: 1 }));
    bridge.destroy();
    vi.runAllTimers();
    expect(bridge.listenerCount()).toBe(0);
    expect(snapshotListener).not.toHaveBeenCalled();
    expect(bridge.getSnapshot().hp).toBe(100);
  });
});