import { GAME_BALANCE } from "./constants";
import type { GamePhase, GameState } from "./types";

const BOSS_PHASES: ReadonlySet<GamePhase> = new Set(["boss1", "boss2", "boss3"]);
const BOSS_PHASE_BY_INDEX = ["boss1", "boss2", "boss3"] as const;

export function advanceTimeline(state: GameState, deltaMs: number): GameState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    throw new RangeError("deltaMs must be a nonnegative finite number");
  }

  if (deltaMs === 0) {
    return state;
  }

  if (BOSS_PHASES.has(state.phase)) {
    return { ...state, currentBossElapsedMs: state.currentBossElapsedMs + deltaMs };
  }

  if (state.phase !== "normal") {
    return state;
  }

  const targetElapsedMs = state.normalElapsedMs + deltaMs;
  for (let bossIndex = 0; bossIndex < GAME_BALANCE.timeline.bossThresholdsMs.length; bossIndex += 1) {
    const thresholdMs = GAME_BALANCE.timeline.bossThresholdsMs[bossIndex];
    const bossPhase = BOSS_PHASE_BY_INDEX[bossIndex];
    if (thresholdMs === undefined || bossPhase === undefined) {
      continue;
    }

    if (state.bossTimesMs[bossIndex] === null && targetElapsedMs >= thresholdMs) {
      return {
        ...state,
        phase: bossPhase,
        normalElapsedMs: thresholdMs,
        currentBossElapsedMs: 0,
      };
    }
  }

  return { ...state, normalElapsedMs: targetElapsedMs };
}