import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { GameLaunchProps } from "../types";
import { GAME_BALANCE } from "./domain/constants";
import { createRunResult } from "./domain/score";
import type { GameSaveV1, GameState, RunOutcome, RunResult } from "./domain/types";
import { AutoSaveController } from "./persistence/AutoSaveController";
import { GameSaveStore } from "./persistence/GameSaveStore";
import { PendingResultStore } from "./persistence/PendingResultStore";
import { createDexSurvivorGame } from "./runtime/createGame";
import { GameBridge, type GameViewState } from "./runtime/GameBridge";
import type { GameScene, GameSceneTestPort } from "./runtime/GameScene";
import { GameHud } from "./ui/GameHud";
import { PauseOverlay } from "./ui/PauseOverlay";
import { RestartDialog } from "./ui/RestartDialog";
import { ResultScreen } from "./ui/ResultScreen";
import { TouchControls } from "./ui/TouchControls";

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createInitialState(ownerObjectId: string, citizenUserIds: readonly string[]): GameState {
  const sessionId = crypto.randomUUID();
  const seed = hashSeed(`${ownerObjectId}:${sessionId}`) || 0x6d2b79f5;
  return {
    version: 1,
    gameId: "dex-survivor",
    ownerObjectId,
    savedAtEpochMs: Date.now(),
    sessionId,
    seed,
    rngState: seed,
    phase: "normal",
    phaseBeforePause: "normal",
    normalElapsedMs: 0,
    currentBossElapsedMs: 0,
    citizenUserIds: [...citizenUserIds],
    rescuedCitizenIds: [],
    enemyKills: 0,
    hitCount: 0,
    bossTimesMs: [null, null, null],
    player: {
      position: { x: GAME_BALANCE.arena.width / 2, y: GAME_BALANCE.arena.height / 2 },
      velocity: { x: 0, y: 0 },
      hp: GAME_BALANCE.player.maxHp,
      maxHp: GAME_BALANCE.player.maxHp,
      facingRadians: 0,
      dashCharges: GAME_BALANCE.player.dash.baseCharges,
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
  };
}

interface ResultPresentation {
  result: RunResult;
  rescuedCount: number;
  pendingSaved: boolean;
}

function totalActiveMs(snapshot: GameSaveV1): number {
  return snapshot.normalElapsedMs + snapshot.currentBossElapsedMs + snapshot.bossTimesMs.reduce<number>(
    (total, bossTimeMs) => total + (bossTimeMs ?? 0),
    0,
  );
}

function createInitialViewState(state: GameState): GameViewState {
  return {
    hp: state.player.hp,
    maxHp: state.player.maxHp,
    dashCharges: state.player.dashCharges,
    dashMax: GAME_BALANCE.player.dash.baseCharges,
    swordStormCooldownMs: state.player.swordStormCooldownMs,
    ultimateCharge: state.player.ultimateCharge,
    normalElapsedMs: state.normalElapsedMs,
    phase: state.phase,
    bossHp: null,
    bossMaxHp: null,
    resumeCountdownMs: null,
  };
}

export default function DexSurvivorGame({ profileAssets, ownerObjectId, onExit }: GameLaunchProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const autoSaveRef = useRef<AutoSaveController | null>(null);
  const completedSessionRef = useRef<string | null>(null);
  const [{ saveStore, pendingResultStore }] = useState(() => ({
    saveStore: new GameSaveStore(),
    pendingResultStore: new PendingResultStore(),
  }));
  const [launch, setLaunch] = useState(() => {
    const savedSnapshot = saveStore.read(ownerObjectId);
    const state = savedSnapshot ?? createInitialState(ownerObjectId, profileAssets.citizens.map(({ userId }) => userId));
    return {
      initialState: state,
      resumeSnapshot: savedSnapshot,
      bridge: new GameBridge(createInitialViewState(state)),
    };
  });
  const [saveWarning, setSaveWarning] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [resultPresentation, setResultPresentation] = useState<ResultPresentation | null>(null);
  const viewState = useSyncExternalStore(
    launch.bridge.subscribe,
    launch.bridge.getSnapshot,
    launch.bridge.getSnapshot,
  );

  useEffect(() => {
    const parent = mountRef.current;
    if (parent === null) {
      return;
    }

    let testPort: GameSceneTestPort | null = null;
    const sceneCapture: { current: GameScene | null } = { current: null };
    const game = createDexSurvivorGame({
      parent,
      initialState: launch.initialState,
      assets: profileAssets,
      bridge: launch.bridge,
      onScene: (scene) => {
        sceneCapture.current = scene;
      },
      onTestPort: (port) => {
        testPort = port;
      },
    });
    const scene = sceneCapture.current ?? game.scene.getScene("DexSurvivorGameScene") as GameScene | null;
    if (scene === null) {
      game.destroy(true);
      return;
    }
    sceneRef.current = scene;
    const autoSave = new AutoSaveController({
      exportSnapshot: () => scene.exportSnapshot(),
      write: (snapshot) => saveStore.write(snapshot),
      onResult: (result) => {
        if (!result.ok) {
          setSaveWarning(true);
        }
      },
    });
    autoSaveRef.current = autoSave;
    let uninstallE2eBridge: (() => void) | null = null;
    if (import.meta.env.MODE === "e2e" && import.meta.env.VITE_E2E_AUTH === "true") {
      void import("@/test-support/E2eGameBridge").then(({ E2eGameBridge }) => {
        if (destroyed || testPort === null) {
          return;
        }
        uninstallE2eBridge = E2eGameBridge.install({
          ...testPort,
          flushSave: () => {
            autoSave.markDirty();
            return autoSave.flush();
          },
        });
      });
    }

    const completeRun = (outcome: RunOutcome): void => {
      const snapshot = scene.exportSnapshot();
      if (completedSessionRef.current === snapshot.sessionId) {
        return;
      }
      completedSessionRef.current = snapshot.sessionId;
      autoSave.dispose(false);
      const result = createRunResult({
        resultId: crypto.randomUUID(),
        ownerObjectId,
        outcome,
        normalElapsedMs: snapshot.normalElapsedMs,
        totalActiveMs: totalActiveMs(snapshot),
        enemyKills: snapshot.enemyKills,
        hitCount: snapshot.hitCount,
        bossTimesMs: snapshot.bossTimesMs,
        completedAtEpochMs: Date.now(),
      });
      const appended = pendingResultStore.append(result);
      if (appended.ok) {
        saveStore.remove(ownerObjectId);
      }
      setResultPresentation({
        result,
        rescuedCount: snapshot.rescuedCitizenIds.length,
        pendingSaved: appended.ok,
      });
    };

    const onSceneState = (): void => {
      const snapshot = launch.bridge.getSnapshot();
      if (snapshot.phase === "defeated" || snapshot.phase === "cleared") {
        completeRun(snapshot.phase);
      } else if (snapshot.phase !== "paused") {
        autoSave.markDirty();
      }
    };
    const unsubscribe = launch.bridge.subscribe(onSceneState);
    if (launch.initialState.phase !== "paused") {
      autoSave.markDirty();
    }

    const pauseAndFlush = (): void => {
      const phase = launch.bridge.getSnapshot().phase;
      if (phase === "defeated" || phase === "cleared") {
        return;
      }
      scene.pauseForPersistence();
      autoSave.markDirty();
      autoSave.flush();
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        pauseAndFlush();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", pauseAndFlush);
    window.addEventListener("beforeunload", pauseAndFlush);

    let destroyed = false;
    return () => {
      uninstallE2eBridge?.();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", pauseAndFlush);
      window.removeEventListener("beforeunload", pauseAndFlush);
      unsubscribe();
      pauseAndFlush();
      autoSave.dispose(false);
      if (autoSaveRef.current === autoSave) {
        autoSaveRef.current = null;
      }
      if (sceneRef.current === scene) {
        sceneRef.current = null;
      }
      if (!destroyed) {
        destroyed = true;
        game.destroy(true);
      }
    };
  }, [launch.bridge, launch.initialState, ownerObjectId, pendingResultStore, profileAssets, saveStore]);

  const continueGame = (): void => {
    if (launch.resumeSnapshot !== null) {
      sceneRef.current?.importSnapshot(launch.resumeSnapshot, true);
      setLaunch((current) => ({ ...current, resumeSnapshot: null }));
      autoSaveRef.current?.markDirty();
      return;
    }
    launch.bridge.dispatch({ type: "resume" });
  };

  const exitGame = (): void => {
    const scene = sceneRef.current;
    const autoSave = autoSaveRef.current;
    if (scene !== null && autoSave !== null && resultPresentation === null) {
      scene.pauseForPersistence();
      autoSave.markDirty();
      autoSave.flush();
    }
    onExit();
  };

  const restartGame = (): void => {
    autoSaveRef.current?.dispose(false);
    saveStore.remove(ownerObjectId);
    completedSessionRef.current = null;
    setSaveWarning(false);
    setResultPresentation(null);
    setRestartOpen(false);
    const state = createInitialState(ownerObjectId, profileAssets.citizens.map(({ userId }) => userId));
    setLaunch({
      initialState: state,
      resumeSnapshot: null,
      bridge: new GameBridge(createInitialViewState(state)),
    });
  };

  const retryResultSave = (): void => {
    if (resultPresentation === null) {
      return;
    }
    const appended = pendingResultStore.append(resultPresentation.result);
    if (appended.ok) {
      saveStore.remove(ownerObjectId);
      setResultPresentation({ ...resultPresentation, pendingSaved: true });
    }
  };

  return (
    <section
      className="relative min-h-[60vh] w-full overflow-hidden border border-[#344452] bg-[#10171d]"
      aria-label="DEX Survivor 게임"
    >
      <div ref={mountRef} className="absolute inset-0" />
      <GameHud bridge={launch.bridge} onExit={exitGame} />
      <TouchControls />
      {saveWarning && viewState.phase !== "paused" && resultPresentation === null ? (
        <p className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 border border-[#ff5d62] bg-[#2a1c20] px-4 py-3 text-sm text-[#ffd8d9]" role="alert">
          진행 상황을 저장하지 못했습니다.
        </p>
      ) : null}
      {viewState.phase === "paused" && resultPresentation === null ? (
        <PauseOverlay
          saveWarning={saveWarning}
          onContinue={continueGame}
          onRestart={() => setRestartOpen(true)}
          onExit={exitGame}
        />
      ) : null}
      {restartOpen ? <RestartDialog onConfirm={restartGame} onCancel={() => setRestartOpen(false)} /> : null}
      {resultPresentation !== null ? (
        <ResultScreen
          result={resultPresentation.result}
          rescuedCount={resultPresentation.rescuedCount}
          pendingSaved={resultPresentation.pendingSaved}
          onRetry={retryResultSave}
          onExit={onExit}
        />
      ) : null}
    </section>
  );
}