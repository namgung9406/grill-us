import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameSaveV1, GameState } from "./domain/types";
import { pendingResultsKey, saveKey } from "./persistence/keys";
import { GameBridge, type GameViewState } from "./runtime/GameBridge";

let activeGames = 0;
let activeCommandListeners = 0;
const destroyGame = vi.fn();
let activeScene: MockScene;

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

function createSave(overrides: Partial<GameSaveV1> = {}): GameSaveV1 {
  return {
    version: 1,
    gameId: "dex-survivor",
    ownerObjectId: OWNER_ID,
    savedAtEpochMs: 1_800_000_000_000,
    sessionId: "22222222-2222-4222-8222-222222222222",
    seed: 1234,
    rngState: 987_654_321,
    phase: "paused",
    phaseBeforePause: "normal",
    normalElapsedMs: 90_000,
    currentBossElapsedMs: 0,
    citizenUserIds: [],
    rescuedCitizenIds: [],
    enemyKills: 12,
    hitCount: 3,
    bossTimesMs: [null, null, null],
    player: {
      position: { x: 640, y: 360 },
      velocity: { x: 0, y: 0 },
      hp: 75,
      maxHp: 100,
      facingRadians: 0,
      dashCharges: 1,
      dashRecoveryRemainingMs: [],
      dashRemainingMs: 0,
      invulnerableRemainingMs: 0,
      gunCooldownMs: 0,
      swordCooldownMs: 0,
      swordActiveRemainingMs: 0,
      swordStormCooldownMs: 0,
      swordStormActiveRemainingMs: 0,
      ultimateCharge: 0,
      ultimateChargeTickRemainderMs: 0,
      upgrades: { gunDamage: 0, gunRange: 0, swordPower: 0, dashCapacity: 0, dashRecovery: 0 },
    },
    wave: { spawnCooldownMs: 0, tier: 0 },
    activeHazards: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    boss: null,
    ...overrides,
  };
}

function viewState(state: GameState, phase = state.phase): GameViewState {
  return {
    hp: state.player.hp,
    maxHp: state.player.maxHp,
    dashCharges: state.player.dashCharges,
    dashMax: 1,
    swordStormCooldownMs: state.player.swordStormCooldownMs,
    ultimateCharge: state.player.ultimateCharge,
    normalElapsedMs: state.normalElapsedMs,
    phase,
    bossHp: null,
    bossMaxHp: null,
    resumeCountdownMs: null,
  };
}

class MockScene {
  public snapshot: GameState;
  readonly #bridge: GameBridge;

  public constructor(snapshot: GameState, bridge: GameBridge) {
    this.snapshot = structuredClone(snapshot);
    this.#bridge = bridge;
  }

  public readonly exportSnapshot = vi.fn((): GameSaveV1 => ({
    ...structuredClone(this.snapshot),
    savedAtEpochMs: Date.now(),
    phase: "paused",
    phaseBeforePause: this.snapshot.phase === "paused" ? this.snapshot.phaseBeforePause : "normal",
  }));

  public readonly pauseForPersistence = vi.fn((): void => {
    if (this.snapshot.phase !== "defeated" && this.snapshot.phase !== "cleared") {
      this.snapshot = {
        ...this.snapshot,
        phaseBeforePause: this.snapshot.phase === "paused" ? this.snapshot.phaseBeforePause : this.snapshot.phase,
        phase: "paused",
      };
      this.#bridge.publish(viewState(this.snapshot, "paused"));
    }
  });

  public readonly importSnapshot = vi.fn((snapshot: GameSaveV1, startCountdown = true): void => {
    this.snapshot = {
      ...structuredClone(snapshot),
      phase: startCountdown ? snapshot.phaseBeforePause : snapshot.phase,
    };
    this.#bridge.publish({
      ...viewState(this.snapshot),
      resumeCountdownMs: startCountdown ? 3000 : null,
    });
  });
}

interface MockGameOptions {
  bridge: GameBridge;
  initialState: GameState;
}

const createGame = vi.fn((options: MockGameOptions) => {
  activeGames += 1;
  const scene = new MockScene(options.initialState, options.bridge);
  activeScene = scene;
  const unsubscribe = options.bridge.subscribeCommands((command) => {
    if (command.type === "pause") {
      scene.pauseForPersistence();
    } else if (command.type === "resume" && scene.snapshot.phase === "paused") {
      scene.snapshot = { ...scene.snapshot, phase: scene.snapshot.phaseBeforePause };
      options.bridge.publish(viewState(scene.snapshot));
    }
  });
  activeCommandListeners += 1;
  let destroyed = false;
  return {
    scene: { getScene: () => scene },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      destroyGame();
      activeGames -= 1;
      activeCommandListeners -= 1;
      unsubscribe();
    },
  };
});

vi.mock("./runtime/createGame", () => ({
  createDexSurvivorGame: (options: MockGameOptions) => createGame(options),
}));

import DexSurvivorGame from "./DexSurvivorGame";

describe("DexSurvivorGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    vi.stubEnv("VITE_LEADERBOARD_ENABLED", "true");
    localStorage.clear();
    activeGames = 0;
    activeCommandListeners = 0;
    createGame.mockClear();
    destroyGame.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  const profileAssets = {
    player: { userId: OWNER_ID, displayName: "Player", objectUrl: null, kind: "helmet" as const },
    citizens: [],
    release: vi.fn(),
  };

  it("keeps one Phaser instance through Strict Mode and removes all runtime listeners on unmount", () => {
    const view = render(
      <StrictMode>
        <DexSurvivorGame
          ownerObjectId={OWNER_ID}
          profileAssets={profileAssets}
          onExit={vi.fn()}
        />
      </StrictMode>,
    );

    expect(createGame).toHaveBeenCalledTimes(2);
    expect(destroyGame).toHaveBeenCalledOnce();
    expect(activeGames).toBe(1);
    expect(activeCommandListeners).toBe(1);

    view.unmount();
    expect(destroyGame).toHaveBeenCalledTimes(2);
    expect(activeGames).toBe(0);
    expect(activeCommandListeners).toBe(0);
  });

  it("imports a schema-valid account snapshot and starts a three-second resume countdown", async () => {
    const saved = createSave();
    localStorage.setItem(saveKey(OWNER_ID), JSON.stringify(saved));
    render(<DexSurvivorGame ownerObjectId={OWNER_ID} profileAssets={profileAssets} onExit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "계속하기" }));

    expect(activeScene.importSnapshot).toHaveBeenCalledWith(saved, true);
    await act(() => vi.advanceTimersByTime(50));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("confirms restart with exact copy, removes only the active save, and starts a new session and seed", () => {
    const saved = createSave();
    localStorage.setItem(saveKey(OWNER_ID), JSON.stringify(saved));
    render(<DexSurvivorGame ownerObjectId={OWNER_ID} profileAssets={profileAssets} onExit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "재시작" }));
    const dialog = screen.getByRole("dialog", { name: "게임 재시작" });
    expect(within(dialog).getByText("현재 진행 상황이 모두 초기화됩니다. 재시작하시겠습니까?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "재시작" }));

    expect(localStorage.getItem(saveKey(OWNER_ID))).toBeNull();
    const restarted = createGame.mock.calls.at(-1)?.[0].initialState;
    expect(restarted?.sessionId).not.toBe(saved.sessionId);
    expect(restarted?.seed).not.toBe(saved.seed);
  });

  it("keeps the active save when result append fails and removes it after retrying the same result", async () => {
    render(
      <MemoryRouter>
        <DexSurvivorGame ownerObjectId={OWNER_ID} profileAssets={profileAssets} onExit={vi.fn()} />
      </MemoryRouter>,
    );
    await act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    expect(localStorage.getItem(saveKey(OWNER_ID))).not.toBeNull();

    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      if (key === pendingResultsKey(OWNER_ID)) {
        throw new DOMException("full", "QuotaExceededError");
      }
      originalSetItem(key, value);
    });
    activeScene.snapshot = {
      ...activeScene.snapshot,
      phase: "defeated",
      enemyKills: 21,
      hitCount: 5,
      rescuedCitizenIds: ["33333333-3333-4333-8333-333333333333"],
    };
    act(() => {
      createGame.mock.calls.at(-1)?.[0].bridge.publish(viewState(activeScene.snapshot, "defeated"));
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByText("결과를 저장하지 못했습니다. 진행 상황은 유지됩니다.")).toBeInTheDocument();
    expect(localStorage.getItem(saveKey(OWNER_ID))).not.toBeNull();
    setItem.mockRestore();

    fireEvent.click(screen.getByRole("button", { name: "결과 저장 재시도" }));
    expect(localStorage.getItem(saveKey(OWNER_ID))).toBeNull();
    const pending = localStorage.getItem(pendingResultsKey(OWNER_ID));
    expect(pending).not.toBeNull();
    expect(pending).not.toContain("rescuedCount");
    expect(screen.getByText("구조한 시민").nextSibling).toHaveTextContent("1");
  });

  it("appends a cleared result before removing the active save", async () => {
    render(
      <MemoryRouter>
        <DexSurvivorGame ownerObjectId={OWNER_ID} profileAssets={profileAssets} onExit={vi.fn()} />
      </MemoryRouter>,
    );
    await act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    activeScene.snapshot = {
      ...activeScene.snapshot,
      phase: "cleared",
      bossTimesMs: [30_000, 40_000, 50_000],
    };

    act(() => {
      createGame.mock.calls.at(-1)?.[0].bridge.publish(viewState(activeScene.snapshot, "cleared"));
      vi.advanceTimersByTime(50);
    });

    const pendingWrite = setItem.mock.calls.findIndex(([key]) => key === pendingResultsKey(OWNER_ID));
    const activeRemove = removeItem.mock.calls.findIndex(([key]) => key === saveKey(OWNER_ID));
    expect(pendingWrite).toBeGreaterThanOrEqual(0);
    expect(activeRemove).toBeGreaterThanOrEqual(0);
    expect(setItem.mock.invocationCallOrder[pendingWrite]).toBeLessThan(removeItem.mock.invocationCallOrder[activeRemove]!);
    expect(localStorage.getItem(saveKey(OWNER_ID))).toBeNull();
    expect(localStorage.getItem(pendingResultsKey(OWNER_ID))).toContain('"outcome":"cleared"');
  });

  it("flushes a paused save on exit without creating a result and keeps a storage warning visible", () => {
    const onExit = vi.fn();
    render(<DexSurvivorGame ownerObjectId={OWNER_ID} profileAssets={profileAssets} onExit={onExit} />);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    fireEvent.click(screen.getByRole("button", { name: "게임 나가기" }));

    expect(onExit).toHaveBeenCalledOnce();
    expect(activeScene.pauseForPersistence).toHaveBeenCalled();
    expect(localStorage.getItem(pendingResultsKey(OWNER_ID))).toBeNull();
    expect(screen.getByText("진행 상황을 저장하지 못했습니다.")).toBeInTheDocument();
    setItem.mockRestore();
  });
});