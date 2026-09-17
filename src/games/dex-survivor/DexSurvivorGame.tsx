import { useEffect, useRef, useState } from "react";

import type { GameLaunchProps } from "../types";
import { GAME_BALANCE } from "./domain/constants";
import type { GameState } from "./domain/types";
import { createDexSurvivorGame } from "./runtime/createGame";
import { GameBridge, type GameViewState } from "./runtime/GameBridge";
import { GameHud } from "./ui/GameHud";
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
  const seed = hashSeed(`${ownerObjectId}:${Date.now()}`) || 0x6d2b79f5;
  return {
    version: 1,
    gameId: "dex-survivor",
    ownerObjectId,
    savedAtEpochMs: Date.now(),
    sessionId: crypto.randomUUID(),
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
  const [{ initialState, bridge }] = useState(() => {
    const state = createInitialState(ownerObjectId, profileAssets.citizens.map(({ userId }) => userId));
    return { initialState: state, bridge: new GameBridge(createInitialViewState(state)) };
  });

  useEffect(() => {
    const parent = mountRef.current;
    if (parent === null) {
      return;
    }

    const game = createDexSurvivorGame({ parent, initialState, assets: profileAssets, bridge });
    let destroyed = false;
    return () => {
      if (!destroyed) {
        destroyed = true;
        game.destroy(true);
      }
    };
  }, [bridge, initialState, profileAssets]);

  return (
    <section
      className="relative min-h-[60vh] w-full overflow-hidden border border-[#344452] bg-[#10171d]"
      aria-label="DEX Survivor 게임"
    >
      <div ref={mountRef} className="absolute inset-0" />
      <GameHud bridge={bridge} onExit={onExit} />
      <TouchControls />
    </section>
  );
}