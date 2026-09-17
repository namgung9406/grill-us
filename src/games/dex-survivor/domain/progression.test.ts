import { describe, expect, it, vi } from "vitest";

import { SimulationClock } from "./clock";
import { GAME_BALANCE } from "./constants";
import { advanceTimeline } from "./progression";
import type { GameState } from "./types";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000002";

function createState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    gameId: "dex-survivor",
    ownerObjectId: OWNER_ID,
    savedAtEpochMs: 0,
    sessionId: SESSION_ID,
    seed: 1,
    rngState: 1,
    phase: "normal",
    phaseBeforePause: "normal",
    normalElapsedMs: 0,
    currentBossElapsedMs: 0,
    citizenUserIds: [],
    rescuedCitizenIds: [],
    enemyKills: 0,
    hitCount: 0,
    bossTimesMs: [null, null, null],
    player: {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      hp: 100,
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

describe("advanceTimeline", () => {
  it("5분, 10분, 15분 경계에서 아직 처치하지 않은 보스로 전환한다", () => {
    const bossOne = advanceTimeline(createState({ normalElapsedMs: 299_999 }), 1);
    expect(bossOne).toMatchObject({ phase: "boss1", normalElapsedMs: 300_000, currentBossElapsedMs: 0 });

    const bossTwo = advanceTimeline(
      createState({ normalElapsedMs: 599_999, bossTimesMs: [80_000, null, null], currentBossElapsedMs: 80_000 }),
      1,
    );
    expect(bossTwo).toMatchObject({ phase: "boss2", normalElapsedMs: 600_000, currentBossElapsedMs: 0 });

    const bossThree = advanceTimeline(
      createState({ normalElapsedMs: 899_999, bossTimesMs: [80_000, 120_000, null] }),
      1,
    );
    expect(bossThree).toMatchObject({ phase: "boss3", normalElapsedMs: 900_000, currentBossElapsedMs: 0 });
  });

  it("큰 delta가 보스 경계를 넘으면 일반 시간을 경계에 고정한다", () => {
    const state = advanceTimeline(createState({ normalElapsedMs: 299_900 }), 1000);
    expect(state.phase).toBe("boss1");
    expect(state.normalElapsedMs).toBe(300_000);
  });

  it("보스 중에는 보스 시간만, pause와 hidden finale 중에는 어떤 시간도 늘리지 않는다", () => {
    const fightingBoss = createState({ phase: "boss2", normalElapsedMs: 600_000, currentBossElapsedMs: 500 });
    expect(advanceTimeline(fightingBoss, 25)).toMatchObject({ normalElapsedMs: 600_000, currentBossElapsedMs: 525 });

    const paused = createState({ phase: "paused", normalElapsedMs: 12_000, currentBossElapsedMs: 900 });
    expect(advanceTimeline(paused, 1000)).toBe(paused);

    const hidden = createState({ phase: "finale-adds", normalElapsedMs: 900_000, currentBossElapsedMs: 12_000 });
    expect(advanceTimeline(hidden, 1000)).toBe(hidden);
  });
});

describe("SimulationClock", () => {
  it("정확한 60Hz step만 전달하고 한 frame에서 최대 다섯 번 실행한다", () => {
    const clock = new SimulationClock();
    const simulate = vi.fn<(deltaMs: number) => void>();
    const stepMs = GAME_BALANCE.simulation.stepMs;

    expect(clock.advance(stepMs / 2, simulate)).toBe(0);
    expect(clock.advance(stepMs / 2, simulate)).toBe(1);
    expect(simulate).toHaveBeenLastCalledWith(stepMs);

    expect(clock.advance(stepMs * 8, simulate)).toBe(5);
    expect(clock.remainderMs()).toBe(0);
    expect(simulate).toHaveBeenCalledTimes(6);
  });
});