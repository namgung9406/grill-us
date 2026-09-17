import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameSaveV1 } from "../domain/types";
import { XorShift32 } from "../domain/random";
import { GameSaveStore } from "./GameSaveStore";
import { saveKey } from "./keys";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_OWNER_ID = "00000000-0000-4000-8000-000000000002";

function createSave(ownerObjectId = OWNER_ID): GameSaveV1 {
  return {
    version: 1,
    gameId: "dex-survivor",
    ownerObjectId,
    savedAtEpochMs: 1_800_000_000_000,
    sessionId: "00000000-0000-4000-8000-000000000003",
    seed: 1234,
    rngState: 987_654_321,
    phase: "paused",
    phaseBeforePause: "boss3",
    normalElapsedMs: 900_000,
    currentBossElapsedMs: 45_000,
    citizenUserIds: [],
    rescuedCitizenIds: [],
    enemyKills: 82,
    hitCount: 4,
    bossTimesMs: [100_000, 160_000, null],
    player: {
      position: { x: 10, y: 20 },
      velocity: { x: 1, y: -1 },
      hp: 73,
      maxHp: 100,
      facingRadians: 0.75,
      dashCharges: 1,
      dashRecoveryRemainingMs: [],
      dashRemainingMs: 0,
      invulnerableRemainingMs: 0,
      gunCooldownMs: 120,
      swordCooldownMs: 300,
      swordActiveRemainingMs: 0,
      swordStormCooldownMs: 5000,
      swordStormActiveRemainingMs: 0,
      ultimateCharge: 44,
      ultimateChargeTickRemainderMs: 455,
      upgrades: { gunDamage: 2, gunRange: 1, swordPower: 3, dashCapacity: 0, dashRecovery: 2 },
    },
    wave: { spawnCooldownMs: 777, tier: 30 },
    activeHazards: [],
    enemies: [],
    projectiles: [],
    pickups: [],
    boss: {
      kind: "boss3",
      position: { x: 0, y: -120 },
      hp: 3200,
      phase: 2,
      patternIndex: 3,
      patternCooldownMs: 650,
      savedHp: 3200,
      finaleTriggered: false,
      resumeCountdownMs: 0,
      finaleBossOne: null,
      finaleBossTwo: null,
    },
  };
}

describe("GameSaveStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("roundtrips the complete snapshot and preserves the next PRNG value", () => {
    const store = new GameSaveStore(localStorage);
    const save = createSave();

    expect(store.write(save)).toEqual({ ok: true });
    const restored = store.read(OWNER_ID);

    expect(restored).toEqual(save);
    expect(new XorShift32(restored!.rngState).next()).toBe(new XorShift32(save.rngState).next());
  });

  it("removes only the requested active key when JSON, version, or owner validation fails", () => {
    const store = new GameSaveStore(localStorage);
    const otherSave = createSave(OTHER_OWNER_ID);
    expect(store.write(otherSave).ok).toBe(true);

    localStorage.setItem(saveKey(OWNER_ID), "not-json");
    expect(store.read(OWNER_ID)).toBeNull();
    expect(localStorage.getItem(saveKey(OWNER_ID))).toBeNull();
    expect(store.read(OTHER_OWNER_ID)).toEqual(otherSave);

    localStorage.setItem(saveKey(OWNER_ID), JSON.stringify({ ...createSave(), version: 2 }));
    expect(store.read(OWNER_ID)).toBeNull();
    expect(localStorage.getItem(saveKey(OWNER_ID))).toBeNull();

    localStorage.setItem(saveKey(OWNER_ID), JSON.stringify(otherSave));
    expect(store.read(OWNER_ID)).toBeNull();
    expect(localStorage.getItem(saveKey(OTHER_OWNER_ID))).not.toBeNull();
  });

  it("reports quota failures without throwing", () => {
    const store = new GameSaveStore(localStorage);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(store.write(createSave())).toEqual({ ok: false, reason: "quota" });
  });
});