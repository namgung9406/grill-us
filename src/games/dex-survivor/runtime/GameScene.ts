import Phaser from "phaser";

import type { GameProfileAssets } from "@/graph/types";

import {
  activeBossTwoParts,
  bossOneCitizenPosition,
  createBossOneState,
  createBossThreeState,
  createBossTwoState,
} from "../domain/bosses";
import { SimulationClock } from "../domain/clock";
import { GAME_BALANCE } from "../domain/constants";
import { ENEMY_ARCHETYPES, enemyRadius } from "../domain/enemies";
import { advanceTimeline } from "../domain/progression";
import { XorShift32 } from "../domain/random";
import type {
  BossSnapshot,
  EnemySnapshot,
  GameSaveV1,
  GameState,
  PickupSnapshot,
  ProjectileSnapshot,
  EnemyType,
  Vector2,
} from "../domain/types";
import { derivedStats } from "../domain/upgrades";
import { getWaveBudget, selectEnemyType } from "../domain/waves";
import { BossOneSystem } from "./bosses/BossOneSystem";
import { BossOneView } from "./bosses/BossOneView";
import { BossTwoSystem } from "./bosses/BossTwoSystem";
import { BossTwoView } from "./bosses/BossTwoView";
import { BossThreeSystem } from "./bosses/BossThreeSystem";
import { BossThreeView } from "./bosses/BossThreeView";
import { FinaleAddsSystem, resumeCountdownRemaining } from "./bosses/FinaleAddsSystem";
import { CitizenView } from "./entities/CitizenView";
import { EnemyView } from "./entities/EnemyView";
import { PlayerView } from "./entities/PlayerView";
import type { GameBridge, GameCommand, GameViewState } from "./GameBridge";
import { DesktopInput } from "./input/DesktopInput";
import { TouchInput, type AimTarget } from "./input/TouchInput";
import type { InputFrame } from "./input/types";
import { EnemySystem } from "./systems/EnemySystem";
import { PickupSystem } from "./systems/PickupSystem";
import { PlayerSystem, type PlayerAction } from "./systems/PlayerSystem";
import {
  createProceduralTextures,
  PROCEDURAL_TEXTURE_KEYS,
  profileTextureKey,
  queueProfileTextures,
} from "./textureFactory";

export interface GameSceneOptions {
  parent: HTMLElement;
  initialState: GameState;
  assets: GameProfileAssets;
  bridge: GameBridge;
  onTestPort?: (port: GameSceneTestPort) => void;
}

export interface GameSceneTestPort {
  getSnapshot: () => GameState;
  advanceNormalTo: (targetElapsedMs: number) => void;
  setBossHp: (hp: number) => void;
  damageActiveBossPart: (amount: number) => void;
  damagePlayer: (amount: number) => void;
  completeCurrentBoss: () => void;
}

export interface GamePerformanceDiagnostics {
  readonly stepDurationsMs: readonly number[];
  readonly droppedCatchUpEvents: number;
  readonly bridgeListenerCount: number;
  readonly snapshotBytes: number;
  readonly entityCounts: {
    readonly enemies: number;
    readonly projectiles: number;
    readonly pickups: number;
  };
}

export interface GamePerformanceApi {
  prepareMaximumEntityFixture: () => void;
  resetMetrics: () => void;
  readMetrics: () => GamePerformanceDiagnostics;
}

declare global {
  var __DEX_PERF__: GamePerformanceApi | undefined;
}

const MAX_PERFORMANCE_SAMPLES = 7_200;
const ENEMY_COLLISION_CELL_SIZE = 64;
const ENEMY_COLLISION_GRID_COLUMNS = Math.ceil(GAME_BALANCE.arena.width / ENEMY_COLLISION_CELL_SIZE) + 1;
const DETAILED_ENEMY_VIEW_LIMIT = 100;
const ENEMY_VISUAL_CELL_SIZE = 32;
const ENEMY_VISUAL_GRID_COLUMNS = Math.ceil(GAME_BALANCE.arena.width / ENEMY_VISUAL_CELL_SIZE) + 1;
const PROJECTILE_VISUAL_CELL_SIZE = 4;
const PROJECTILE_VISUAL_GRID_COLUMNS = Math.ceil(GAME_BALANCE.arena.width / PROJECTILE_VISUAL_CELL_SIZE) + 1;
const ENEMY_COLORS: Readonly<Record<EnemyType, number>> = {
  chaser: 0xe85d75,
  ranged: 0xf2c14e,
  splitter: 0x8f6ad8,
  "splitter-small": 0xc89cff,
  tank: 0x5d7a8c,
};

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function combineInput(desktop: InputFrame, touch: InputFrame): InputFrame {
  const touchMoving = touch.move.x !== 0 || touch.move.y !== 0;
  return {
    move: touchMoving ? touch.move : desktop.move,
    aimWorld: desktop.aimWorld ?? touch.aimWorld,
    shoot: desktop.shoot || touch.shoot,
    sword: desktop.sword || touch.sword,
    dashPressed: desktop.dashPressed || touch.dashPressed,
    swordStormPressed: desktop.swordStormPressed || touch.swordStormPressed,
    ultimatePressed: desktop.ultimatePressed || touch.ultimatePressed,
  };
}

function bossHealth(boss: BossSnapshot | null): { hp: number | null; maxHp: number | null } {
  if (boss === null) {
    return { hp: null, maxHp: null };
  }
  if (boss.kind === "boss1") {
    return { hp: boss.hp, maxHp: GAME_BALANCE.bosses.bossOne.hp };
  }
  if (boss.kind === "boss2") {
    const activeParts = activeBossTwoParts(boss);
    return {
      hp: activeParts.reduce((total, part) => total + boss.parts[part].hp, 0),
      maxHp: activeParts.reduce((total, part) => total + GAME_BALANCE.bosses.bossTwo.partHp[part], 0),
    };
  }
  return { hp: boss.hp, maxHp: GAME_BALANCE.bosses.bossThree.hp };
}

export class GameScene extends Phaser.Scene {
  readonly #options: GameSceneOptions;
  readonly #clock = new SimulationClock();
  #state: GameState;
  #playerSystem: PlayerSystem;
  #random: XorShift32;
  #enemySystem: EnemySystem;
  #pickupSystem: PickupSystem;
  #bossOneSystem: BossOneSystem | null = null;
  #bossTwoSystem: BossTwoSystem | null = null;
  #bossThreeSystem: BossThreeSystem | null = null;
  #finaleAddsSystem: FinaleAddsSystem | null = null;
  #desktopInput: DesktopInput | null = null;
  #touchInput: TouchInput | null = null;
  #playerView: PlayerView | null = null;
  readonly #enemyViews = new Map<string, EnemyView>();
  #enemyBatch: Phaser.GameObjects.Graphics | null = null;
  #projectileBatch: Phaser.GameObjects.Graphics | null = null;
  #pickupBatch: Phaser.GameObjects.Graphics | null = null;
  readonly #renderedPickupIds = new Set<string>();
  #bossOneView: BossOneView | null = null;
  #bossTwoView: BossTwoView | null = null;
  #bossThreeView: BossThreeView | null = null;
  readonly #citizenViews = new Map<string, CitizenView>();
  #unsubscribeCommands: (() => void) | null = null;
  #ownedTextureKeys: string[] = [];
  #nextEntityId = 1;
  #visibilityResetRequested = false;
  #resumeCountdownDeadlineMs: number | null = null;
  #restoreCountdownRemainingMs: number | null = null;
  #restoreCountdownDeadlineMs: number | null = null;
  #performanceApi: GamePerformanceApi | null = null;
  #performanceSamples: number[] | null = import.meta.env.MODE === "e2e" ? [] : null;
  #droppedCatchUpEvents = 0;
  #cleanedUp = false;

  public constructor(options: GameSceneOptions) {
    super({ key: "DexSurvivorGameScene" });
    this.#options = options;
    this.#state = cloneState(options.initialState);
    this.#playerSystem = new PlayerSystem(this.#state.player, this.#state.hitCount);
    this.#random = new XorShift32(this.#state.rngState);
    this.#enemySystem = this.#createEnemySystem();
    this.#pickupSystem = this.#createPickupSystem();
    this.#ensureBossOneBattle();
    this.#ensureBossTwoBattle();
    this.#ensureBossThreeBattle();
    this.#ensureFinaleAddsBattle();
    options.onTestPort?.({
      getSnapshot: () => this.#testSnapshot(),
      advanceNormalTo: (targetElapsedMs) => this.#testAdvanceNormalTo(targetElapsedMs),
      setBossHp: (hp) => this.#testSetBossHp(hp),
      damageActiveBossPart: (amount) => this.#testDamageActiveBossPart(amount),
      damagePlayer: (amount) => this.#testDamagePlayer(amount),
      completeCurrentBoss: () => this.#testCompleteCurrentBoss(),
    });
  }

  public preload(): void {
    this.#ownedTextureKeys.push(...queueProfileTextures(this, this.#options.assets));
  }

  public create(): void {
    this.#ownedTextureKeys.push(...createProceduralTextures(this));
    this.add
      .tileSprite(0, 0, GAME_BALANCE.arena.width, GAME_BALANCE.arena.height, PROCEDURAL_TEXTURE_KEYS.arena)
      .setOrigin(0);

    this.#createPlayerView();
    this.#syncViews();

    this.#desktopInput = new DesktopInput(this.game.canvas);
    this.#touchInput = new TouchInput(this.#options.parent.parentElement ?? this.#options.parent);
    this.#unsubscribeCommands = this.#options.bridge.subscribeCommands(this.#onCommand);
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.#cleanup, this);
    this.#publishViewState();
    this.#installPerformanceApi();
  }

  public override update(_time: number, deltaMs: number): void {
    if (this.#restoreCountdownRemainingMs !== null && this.#state.phase !== "paused") {
      this.#clock.reset();
      this.#updateRestoreCountdown(performance.now());
      return;
    }
    if (this.#isResumeCountdownActive()) {
      this.#clock.reset();
      this.#updateResumeCountdown(performance.now());
      return;
    }
    if (this.#state.phase === "paused" || this.#state.phase === "defeated" || this.#state.phase === "cleared") {
      this.#clock.reset();
      return;
    }

    if (this.#visibilityResetRequested || deltaMs > GAME_BALANCE.simulation.resetFrameDeltaMs) {
      this.#visibilityResetRequested = false;
      this.#clock.reset();
      return;
    }

    let simulated = false;
    this.#clock.advance(deltaMs, (stepMs) => {
      simulated = true;
      if (this.#performanceSamples === null) {
        this.#simulate(stepMs);
        return;
      }
      const startedAt = performance.now();
      this.#simulate(stepMs);
      const durationMs = performance.now() - startedAt;
      this.#performanceSamples.push(durationMs);
      if (durationMs > GAME_BALANCE.simulation.stepMs * GAME_BALANCE.simulation.maxCatchUpSteps) {
        this.#droppedCatchUpEvents += 1;
      }
      if (this.#performanceSamples.length > MAX_PERFORMANCE_SAMPLES) {
        this.#performanceSamples.splice(0, this.#performanceSamples.length - MAX_PERFORMANCE_SAMPLES);
      }
    });
    if (simulated) {
      this.#syncViews();
      this.#publishViewState();
    }
  }

  readonly #onCommand = (command: GameCommand): void => {
    if (command.type === "pause" && this.#state.phase !== "paused" && !this.#isResumeCountdownActive()) {
      this.pauseForPersistence();
    } else if (command.type === "resume" && this.#state.phase === "paused") {
      this.#state = { ...this.#state, phase: this.#state.phaseBeforePause };
      this.#clock.reset();
      this.#publishViewState();
    } else if (command.type === "restart") {
      this.importSnapshot(this.#options.initialState, false);
    }
  };

  public pauseForPersistence(): void {
    if (
      this.#state.phase !== "paused" &&
      this.#state.phase !== "defeated" &&
      this.#state.phase !== "cleared"
    ) {
      this.#state = { ...this.#state, phaseBeforePause: this.#state.phase, phase: "paused" };
    }
    this.#clock.reset();
    this.#restoreCountdownDeadlineMs = null;
    this.#desktopInput?.reset();
    this.#touchInput?.reset();
    this.#publishViewState();
  }

  public exportSnapshot(): GameSaveV1 {
    const phaseBeforePause = this.#state.phase === "paused"
      ? this.#state.phaseBeforePause
      : this.#state.phase === "defeated" || this.#state.phase === "cleared"
        ? this.#state.phaseBeforePause
        : this.#state.phase;
    return cloneState({
      ...this.#state,
      savedAtEpochMs: Date.now(),
      rngState: this.#random.state(),
      phase: "paused",
      phaseBeforePause,
    });
  }

  public importSnapshot(snapshot: GameSaveV1, startCountdown = true): void {
    if (snapshot.ownerObjectId !== this.#options.initialState.ownerObjectId) {
      return;
    }

    const imported = cloneState(snapshot);
    this.#state = startCountdown
      ? { ...imported, phase: imported.phaseBeforePause }
      : imported;
    this.#playerSystem.reset(this.#state.player, this.#state.hitCount);
    this.#random = new XorShift32(this.#state.rngState);
    this.#nextEntityId = 1;
    this.#enemySystem = this.#createEnemySystem();
    this.#pickupSystem = this.#createPickupSystem();
    this.#bossOneSystem = null;
    this.#bossTwoSystem = null;
    this.#bossThreeSystem = null;
    this.#finaleAddsSystem = null;
    this.#resumeCountdownDeadlineMs = null;
    this.#restoreCountdownRemainingMs = startCountdown ? 3000 : null;
    this.#restoreCountdownDeadlineMs = null;
    this.#ensureBossOneBattle();
    this.#ensureBossTwoBattle();
    this.#ensureBossThreeBattle();
    this.#ensureFinaleAddsBattle();
    this.#destroyRuntimeViews();
    this.#playerView?.destroy();
    this.#playerView = null;
    this.#createPlayerView();
    this.#clock.reset();
    this.#desktopInput?.reset();
    this.#touchInput?.reset();
    this.#syncViews();
    this.#publishViewState();
  }

  #testSnapshot(): GameState {
    return cloneState({ ...this.#state, rngState: this.#random.state() });
  }

  #testAdvanceNormalTo(targetElapsedMs: number): void {
    if (this.#state.phase !== "normal") {
      throw new Error("normal phase에서만 시간을 전진할 수 있습니다.");
    }
    if (targetElapsedMs < this.#state.normalElapsedMs) {
      throw new RangeError("목표 시간은 현재 시간보다 작을 수 없습니다.");
    }

    this.#state = advanceTimeline(this.#state, targetElapsedMs - this.#state.normalElapsedMs);
    this.#ensureBossOneBattle();
    this.#ensureBossTwoBattle();
    this.#ensureBossThreeBattle();
    this.#afterTestMutation();
  }

  #testSetBossHp(hp: number): void {
    if (this.#bossOneSystem !== null) {
      const target = this.#bossOneSystem.damageTargets.find(({ kind }) => kind === "body");
      if (target === undefined || hp > this.#bossOneSystem.boss.hp) {
        throw new RangeError("보스 체력은 현재 값보다 높일 수 없습니다.");
      }
      this.#damageBossOne(target.id, this.#bossOneSystem.boss.hp - hp);
    } else if (this.#bossThreeSystem !== null && this.#state.phase === "boss3") {
      const target = this.#bossThreeSystem.damageTargets[0];
      if (target === undefined || hp > this.#bossThreeSystem.boss.hp) {
        throw new RangeError("보스 체력은 현재 값보다 높일 수 없습니다.");
      }
      this.#damageBossThree(target.id, this.#bossThreeSystem.boss.hp - hp);
    } else {
      throw new Error("현재 phase는 단일 보스 체력을 지원하지 않습니다.");
    }
    this.#afterTestMutation();
  }

  #testDamageActiveBossPart(amount: number): void {
    if (this.#bossOneSystem !== null) {
      const target = this.#bossOneSystem.damageTargets.find(({ kind }) => kind === "tentacle")
        ?? this.#bossOneSystem.damageTargets.find(({ kind }) => kind === "body");
      if (target !== undefined) {
        this.#damageBossOne(target.id, amount);
      }
    } else if (this.#bossTwoSystem !== null) {
      const target = this.#bossTwoSystem.damageTargets.find(({ active }) => active);
      if (target !== undefined) {
        this.#damageBossTwo(target.id, amount);
      }
    } else if (this.#finaleAddsSystem !== null) {
      const target = this.#finaleAddsSystem.damageTargets.find(({ active }) => active);
      if (target !== undefined) {
        this.#damageFinaleAdd(target.id, amount);
      }
    } else if (this.#bossThreeSystem !== null) {
      const target = this.#bossThreeSystem.damageTargets[0];
      if (target !== undefined) {
        this.#damageBossThree(target.id, amount);
      }
    } else {
      throw new Error("피해를 줄 활성 보스가 없습니다.");
    }
    this.#afterTestMutation();
  }

  #testDamagePlayer(amount: number): void {
    if (this.#state.player.invulnerableRemainingMs > 0) {
      const player = { ...this.#state.player, invulnerableRemainingMs: 0 };
      this.#playerSystem.reset(player, this.#state.hitCount);
      this.#state = { ...this.#state, player };
    }
    this.#applyPlayerDamage(amount);
    if (this.#state.player.hp === 0) {
      this.#state = { ...this.#state, phase: "defeated" };
    }
    this.#afterTestMutation();
  }

  #testCompleteCurrentBoss(): void {
    if (this.#bossOneSystem !== null && this.#state.phase === "boss1") {
      const target = this.#bossOneSystem.damageTargets.find(({ kind }) => kind === "body");
      if (target !== undefined) {
        this.#damageBossOne(target.id, Number.MAX_SAFE_INTEGER);
      }
    } else if (this.#bossTwoSystem !== null && this.#state.phase === "boss2") {
      for (let index = 0; index < 8 && this.#bossTwoSystem !== null; index += 1) {
        const target = this.#bossTwoSystem.damageTargets.find(({ active }) => active);
        if (target === undefined) {
          break;
        }
        this.#damageBossTwo(target.id, Number.MAX_SAFE_INTEGER);
      }
    } else if (this.#finaleAddsSystem !== null && this.#state.phase === "finale-adds") {
      for (let index = 0; index < 16 && this.#finaleAddsSystem !== null; index += 1) {
        const target = this.#finaleAddsSystem.damageTargets.find(({ active }) => active);
        if (target === undefined) {
          break;
        }
        this.#damageFinaleAdd(target.id, Number.MAX_SAFE_INTEGER);
      }
    } else if (this.#bossThreeSystem !== null && this.#state.phase === "boss3") {
      const target = this.#bossThreeSystem.damageTargets[0];
      if (target !== undefined) {
        this.#damageBossThree(target.id, Number.MAX_SAFE_INTEGER);
      }
    } else {
      throw new Error("완료할 활성 보스가 없습니다.");
    }
    this.#afterTestMutation();
  }

  #afterTestMutation(): void {
    this.#state = { ...this.#state, rngState: this.#random.state() };
    this.#syncViews();
    this.#publishViewState();
  }

  #installPerformanceApi(): void {
    if (this.#performanceSamples === null) {
      return;
    }
    const api: GamePerformanceApi = Object.freeze({
      prepareMaximumEntityFixture: () => this.#prepareMaximumEntityFixture(),
      resetMetrics: () => {
        this.#performanceSamples?.splice(0);
        this.#droppedCatchUpEvents = 0;
      },
      readMetrics: () => ({
        stepDurationsMs: [...(this.#performanceSamples ?? [])],
        droppedCatchUpEvents: this.#droppedCatchUpEvents,
        bridgeListenerCount: this.#options.bridge.listenerCount(),
        snapshotBytes: new Blob([JSON.stringify(this.#testSnapshot())]).size,
        entityCounts: {
          enemies: this.#state.enemies.length,
          projectiles: this.#state.projectiles.length,
          pickups: this.#state.pickups.length,
        },
      }),
    });
    this.#performanceApi = api;
    globalThis.__DEX_PERF__ = api;
  }

  #prepareMaximumEntityFixture(): void {
    const entityId = (index: number): string =>
      `30000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
    const enemies: EnemySnapshot[] = Array.from({ length: GAME_BALANCE.limits.enemies }, (_, index) => ({
      id: entityId(index + 1),
      type: "tank",
      position: { x: index % 2 === 0 ? 24 : GAME_BALANCE.arena.width - 24, y: (index * 37) % GAME_BALANCE.arena.height },
      velocity: { x: 0, y: 0 },
      hp: ENEMY_ARCHETYPES.tank.hp,
      attackCooldownMs: 0,
      contactCooldownMs: 0,
    }));
    const projectiles: ProjectileSnapshot[] = Array.from(
      { length: GAME_BALANCE.limits.projectiles },
      (_, index) => ({
        id: entityId(GAME_BALANCE.limits.enemies + index + 1),
        owner: "player",
        position: { x: GAME_BALANCE.arena.width / 2, y: GAME_BALANCE.arena.height / 2 },
        velocity: { x: 0, y: 0 },
        damage: 0,
        remainingRange: 1_000_000,
        radius: 1,
      }),
    );
    const pickupTypes: readonly PickupSnapshot["type"][] = [
      "gun-damage",
      "gun-range",
      "sword-power",
      "dash-capacity",
      "dash-recovery",
      "ultimate-charge",
    ];
    const pickups: PickupSnapshot[] = Array.from({ length: GAME_BALANCE.limits.pickups }, (_, index) => ({
      id: entityId(GAME_BALANCE.limits.enemies + GAME_BALANCE.limits.projectiles + index + 1),
      type: pickupTypes[index % pickupTypes.length] ?? "gun-damage",
      position: { x: index % 2 === 0 ? 12 : GAME_BALANCE.arena.width - 12, y: (index * 53) % GAME_BALANCE.arena.height },
      ttlMs: 120_000,
    }));
    const player = { ...this.#state.player, invulnerableRemainingMs: 120_000 };
    this.#state = {
      ...this.#state,
      phase: "normal",
      phaseBeforePause: "normal",
      normalElapsedMs: 600_000,
      bossTimesMs: [60_000, 60_000, null],
      player,
      enemies,
      projectiles,
      pickups,
      boss: null,
      activeHazards: [],
    };
    this.#playerSystem.reset(player, this.#state.hitCount);
    this.#enemySystem = this.#createEnemySystem();
    this.#pickupSystem = this.#createPickupSystem();
    this.#performanceSamples?.splice(0);
    this.#droppedCatchUpEvents = 0;
    this.#syncViews();
    this.#publishViewState();
  }

  readonly #onVisibilityChange = (): void => {
    this.#desktopInput?.reset();
    this.#touchInput?.reset();
    this.#visibilityResetRequested = true;
    this.#clock.reset();
  };

  #simulate(deltaMs: number): void {
    if (!this.#desktopInput || !this.#touchInput) {
      return;
    }

    const targets: AimTarget[] = this.#state.enemies.map(({ id, position }) => ({ id, position }));
    if (this.#bossOneSystem !== null) {
      targets.push(...this.#bossOneSystem.damageTargets.map(({ id, position }) => ({ id, position })));
    } else if (this.#bossTwoSystem !== null) {
      targets.push(
        ...this.#bossTwoSystem.damageTargets
          .filter(({ active }) => active)
          .map(({ id, position }) => ({ id, position })),
      );
    } else if (this.#finaleAddsSystem !== null) {
      targets.push(
        ...this.#finaleAddsSystem.damageTargets
          .filter(({ active }) => active)
          .map(({ id, position }) => ({ id, position })),
      );
    } else if (this.#bossThreeSystem !== null) {
      targets.push(...this.#bossThreeSystem.damageTargets.map(({ id, position }) => ({ id, position })));
    }
    const input = combineInput(
      this.#desktopInput.readFrame(),
      this.#touchInput.readFrame(this.#state.player.position, targets),
    );
    const result = this.#playerSystem.step(deltaMs, input);
    const phaseBeforeAdvance = this.#state.phase;
    this.#state = advanceTimeline(
      { ...this.#state, player: result.player, hitCount: this.#playerSystem.hitCount },
      deltaMs,
    );
    if (phaseBeforeAdvance === "finale-adds") {
      this.#state = { ...this.#state, currentBossElapsedMs: this.#state.currentBossElapsedMs + deltaMs };
    }
    this.#ensureBossOneBattle();
    this.#ensureBossTwoBattle();
    this.#ensureBossThreeBattle();
    this.#ensureFinaleAddsBattle();
    this.#handlePlayerActions(result.actions);
    if (this.#isResumeCountdownActive() || this.#state.phase === "cleared") {
      return;
    }

    const enemyResult = this.#enemySystem.step(deltaMs, {
      phase: this.#state.phase,
      normalElapsedMs: this.#state.normalElapsedMs,
      playerPosition: this.#state.player.position,
    });
    this.#state = {
      ...this.#state,
      enemies: enemyResult.enemies,
      projectiles: [...this.#state.projectiles, ...enemyResult.projectiles].slice(
        0,
        GAME_BALANCE.limits.projectiles,
      ),
      wave: enemyResult.wave,
      enemyKills: enemyResult.enemyKills,
    };
    for (const contact of enemyResult.contacts) {
      this.#applyPlayerDamage(contact.damage);
    }

    this.#stepBossOne(deltaMs);
    this.#stepBossTwo(deltaMs);
    this.#stepBossThree(deltaMs);
    this.#stepFinaleAdds(deltaMs);

    this.#stepProjectiles(deltaMs);
    if (this.#isResumeCountdownActive()) {
      return;
    }
    const pickupResult = this.#pickupSystem.step(deltaMs, this.#state.player);
    this.#state = { ...this.#state, pickups: pickupResult.pickups, player: pickupResult.player };
    if (pickupResult.collected.length > 0) {
      this.#playerSystem.reset(pickupResult.player, this.#state.hitCount);
    }
    if (this.#state.player.hp === 0) {
      this.#state = { ...this.#state, phase: "defeated" };
    }
    this.#state = {
      ...this.#state,
      enemies: this.#enemySystem.enemies,
      enemyKills: this.#enemySystem.enemyKills,
      rngState: this.#random.state(),
    };
  }

  #createEnemySystem(): EnemySystem {
    return new EnemySystem({
      random: this.#random,
      enemies: this.#state.enemies,
      wave: this.#state.wave,
      enemyKills: this.#state.enemyKills,
      createId: () => this.#createEntityId(),
    });
  }

  #createPickupSystem(): PickupSystem {
    return new PickupSystem(this.#random, this.#state.pickups, () => this.#createEntityId());
  }

  #ensureBossOneBattle(): void {
    if (this.#state.phase !== "boss1" || this.#bossOneSystem !== null) {
      return;
    }
    const unrescuedCitizenIds = this.#state.citizenUserIds.filter(
      (citizenUserId) => !this.#state.rescuedCitizenIds.includes(citizenUserId),
    );
    const boss = this.#state.boss?.kind === "boss1" ? this.#state.boss : createBossOneState(unrescuedCitizenIds);
    this.#bossOneSystem = new BossOneSystem({
      boss,
      activeHazards: this.#state.activeHazards,
      rescuedCitizenIds: this.#state.rescuedCitizenIds,
      createId: () => this.#createEntityId(),
    });
    this.#state = { ...this.#state, boss };
  }

  #ensureBossTwoBattle(): void {
    if (this.#state.phase !== "boss2" || this.#bossTwoSystem !== null) {
      return;
    }
    const boss = this.#state.boss?.kind === "boss2" ? this.#state.boss : createBossTwoState();
    this.#bossTwoSystem = new BossTwoSystem({
      boss,
      activeHazards: this.#state.activeHazards,
      createId: () => this.#createEntityId(),
    });
    this.#state = { ...this.#state, boss };
  }

  #ensureBossThreeBattle(): void {
    if (
      (this.#state.phase !== "boss3" && this.#state.phase !== "finale-adds") ||
      this.#bossThreeSystem !== null
    ) {
      return;
    }
    const boss = this.#state.boss?.kind === "boss3" ? this.#state.boss : createBossThreeState();
    this.#bossThreeSystem = new BossThreeSystem({
      boss,
      seed: this.#state.seed,
      activeHazards: this.#state.activeHazards,
      createId: () => this.#createEntityId(),
    });
    this.#state = { ...this.#state, boss };
  }

  #ensureFinaleAddsBattle(): void {
    if (
      this.#state.phase !== "finale-adds" ||
      this.#finaleAddsSystem !== null ||
      this.#state.boss?.kind !== "boss3" ||
      this.#state.boss.resumeCountdownMs > 0 ||
      this.#state.boss.finaleBossOne === null ||
      this.#state.boss.finaleBossTwo === null
    ) {
      return;
    }
    this.#finaleAddsSystem = new FinaleAddsSystem({
      bossOne: this.#state.boss.finaleBossOne,
      bossTwo: this.#state.boss.finaleBossTwo,
      activeHazards: this.#state.activeHazards,
      createId: () => this.#createEntityId(),
    });
  }

  #createPlayerView(): void {
    const profileKey = profileTextureKey(this.#options.assets.player.userId);
    const playerTexture = this.textures.exists(profileKey) ? profileKey : PROCEDURAL_TEXTURE_KEYS.player;
    this.#playerView = new PlayerView(this, playerTexture, this.#state.player);
    this.#playerView.object.setDepth(10);
  }

  #createEntityId(): string {
    let candidate: string;
    do {
      candidate = `20000000-0000-4000-8000-${this.#nextEntityId.toString(16).padStart(12, "0")}`;
      this.#nextEntityId += 1;
    } while (
      this.#state.enemies.some(({ id }) => id === candidate) ||
      this.#state.projectiles.some(({ id }) => id === candidate) ||
      this.#state.pickups.some(({ id }) => id === candidate)
    );
    return candidate;
  }

  #handlePlayerActions(actions: readonly PlayerAction[]): void {
    for (const action of actions) {
      if (action.type === "gun") {
        if (this.#state.projectiles.length < GAME_BALANCE.limits.projectiles) {
          const projectile: ProjectileSnapshot = {
            id: this.#createEntityId(),
            owner: "player",
            position: { ...action.origin },
            velocity: { x: action.direction.x * action.speed, y: action.direction.y * action.speed },
            damage: action.damage,
            remainingRange: action.range,
            radius: 5,
          };
          this.#state = { ...this.#state, projectiles: [...this.#state.projectiles, projectile] };
        }
      } else if (action.type === "sword") {
        const targets = this.#enemySystem.enemies.filter((enemy) => this.#isInSwordArc(enemy, action));
        for (const enemy of targets) {
          this.#damageEnemy(enemy.id, action.damage);
        }
        const bossTargets = this.#bossOneSystem?.damageTargets.filter((target) =>
          this.#isPositionInSwordArc(target.position, target.radius, action),
        );
        for (const target of bossTargets ?? []) {
          this.#damageBossOne(target.id, action.damage);
        }
        const bossTwoTargets = this.#bossTwoSystem?.damageTargets.filter(
          (target) =>
            target.active && this.#isPositionInSwordArc(target.position, target.radius, action),
        );
        for (const target of bossTwoTargets ?? []) {
          this.#damageBossTwo(target.id, action.damage);
        }
        const finaleTargets = this.#finaleAddsSystem?.damageTargets.filter(
          (target) => target.active && this.#isPositionInSwordArc(target.position, target.radius, action),
        );
        for (const target of finaleTargets ?? []) {
          this.#damageFinaleAdd(target.id, action.damage);
        }
        const bossThreeTargets = this.#bossThreeSystem?.damageTargets.filter((target) =>
          this.#isPositionInSwordArc(target.position, target.radius, action),
        );
        for (const target of bossThreeTargets ?? []) {
          this.#damageBossThree(target.id, action.damage);
        }
        this.#showAttackRing(action.origin, action.range);
      } else if (action.type === "sword-storm") {
        const targets = this.#enemySystem.enemies.filter(
          (enemy) => this.#distance(enemy.position, action.origin) <= action.radius + enemyRadius(enemy.type),
        );
        for (const enemy of targets) {
          this.#damageEnemy(enemy.id, action.damage);
        }
        const bossTargets = this.#bossOneSystem?.damageTargets.filter(
          (target) => this.#distance(target.position, action.origin) <= action.radius + target.radius,
        );
        for (const target of bossTargets ?? []) {
          this.#damageBossOne(target.id, action.damage);
        }
        const bossTwoTargets = this.#bossTwoSystem?.damageTargets.filter(
          (target) =>
            target.active && this.#distance(target.position, action.origin) <= action.radius + target.radius,
        );
        for (const target of bossTwoTargets ?? []) {
          this.#damageBossTwo(target.id, action.damage);
        }
        const finaleTargets = this.#finaleAddsSystem?.damageTargets.filter(
          (target) => target.active && this.#distance(target.position, action.origin) <= action.radius + target.radius,
        );
        for (const target of finaleTargets ?? []) {
          this.#damageFinaleAdd(target.id, action.damage);
        }
        const bossThreeTargets = this.#bossThreeSystem?.damageTargets.filter(
          (target) => this.#distance(target.position, action.origin) <= action.radius + target.radius,
        );
        for (const target of bossThreeTargets ?? []) {
          this.#damageBossThree(target.id, action.damage);
        }
        this.#showAttackRing(action.origin, action.radius);
      } else if (action.type === "ultimate") {
        for (const enemy of this.#enemySystem.enemies) {
          this.#damageEnemy(enemy.id, action.damage);
        }
        const bossTargetIds = this.#bossOneSystem?.damageTargets.map(({ id }) => id) ?? [];
        for (const targetId of bossTargetIds) {
          this.#damageBossOne(targetId, action.damage);
        }
        const bossTwoTargetIds =
          this.#bossTwoSystem?.damageTargets.filter(({ active }) => active).map(({ id }) => id) ?? [];
        for (const targetId of bossTwoTargetIds) {
          this.#damageBossTwo(targetId, action.damage);
        }
        const finaleTargetIds = this.#finaleAddsSystem?.damageTargets
          .filter(({ active }) => active)
          .map(({ id }) => id) ?? [];
        for (const targetId of finaleTargetIds) {
          this.#damageFinaleAdd(targetId, action.damage);
        }
        for (const target of this.#bossThreeSystem?.damageTargets ?? []) {
          this.#damageBossThree(target.id, action.damage);
        }
        this.#showAttackRing(this.#state.player.position, Math.max(GAME_BALANCE.arena.width, GAME_BALANCE.arena.height));
      }
    }
  }

  #showAttackRing(origin: Vector2, radius: number): void {
    const ring = this.add.circle(origin.x, origin.y, radius, 0x4dd5b8, 0.15);
    ring.setStrokeStyle(3, 0xffffff, 0.8).setDepth(9);
    this.tweens.add({ targets: ring, alpha: 0, duration: 120, onComplete: () => ring.destroy() });
  }

  #isInSwordArc(enemy: EnemySnapshot, action: Extract<PlayerAction, { type: "sword" }>): boolean {
    return this.#isPositionInSwordArc(enemy.position, enemyRadius(enemy.type), action);
  }

  #isPositionInSwordArc(
    position: Vector2,
    radius: number,
    action: Extract<PlayerAction, { type: "sword" }>,
  ): boolean {
    const offset = { x: position.x - action.origin.x, y: position.y - action.origin.y };
    const distance = Math.hypot(offset.x, offset.y);
    if (distance > action.range + radius) {
      return false;
    }
    if (distance === 0) {
      return true;
    }
    const alignment = (offset.x * action.direction.x + offset.y * action.direction.y) / distance;
    return alignment >= Math.cos(action.arcRadians / 2);
  }

  #stepProjectiles(deltaMs: number): void {
    const enemyCells = new Map<number, EnemySnapshot[]>();
    const activeEnemyIds = new Set<string>();
    for (const enemy of this.#enemySystem.enemies) {
      const cellX = Math.floor(enemy.position.x / ENEMY_COLLISION_CELL_SIZE);
      const cellY = Math.floor(enemy.position.y / ENEMY_COLLISION_CELL_SIZE);
      const key = cellY * ENEMY_COLLISION_GRID_COLUMNS + cellX;
      const cell = enemyCells.get(key);
      if (cell === undefined) {
        enemyCells.set(key, [enemy]);
      } else {
        cell.push(enemy);
      }
      activeEnemyIds.add(enemy.id);
    }
    const remaining: ProjectileSnapshot[] = [];
    for (const projectile of this.#state.projectiles) {
      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y);
      const travelDistance = Math.min(projectile.remainingRange, (speed * deltaMs) / 1000);
      const scale = speed === 0 ? 0 : travelDistance / speed;
      const next: ProjectileSnapshot = {
        ...projectile,
        position: {
          x: projectile.position.x + projectile.velocity.x * scale,
          y: projectile.position.y + projectile.velocity.y * scale,
        },
        remainingRange: Math.max(0, projectile.remainingRange - travelDistance),
      };

      if (next.owner === "player") {
        const cellX = Math.floor(next.position.x / ENEMY_COLLISION_CELL_SIZE);
        const cellY = Math.floor(next.position.y / ENEMY_COLLISION_CELL_SIZE);
        let hit: EnemySnapshot | undefined;
        for (let offsetY = -1; offsetY <= 1 && hit === undefined; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1 && hit === undefined; offsetX += 1) {
            const key = (cellY + offsetY) * ENEMY_COLLISION_GRID_COLUMNS + cellX + offsetX;
            hit = enemyCells.get(key)?.find((enemy) => {
              if (!activeEnemyIds.has(enemy.id)) {
                return false;
              }
              const collisionRadius = next.radius + enemyRadius(enemy.type);
              const offsetX = next.position.x - enemy.position.x;
              const offsetY = next.position.y - enemy.position.y;
              return offsetX * offsetX + offsetY * offsetY <= collisionRadius * collisionRadius;
            });
          }
        }
        if (hit) {
          if (this.#damageEnemy(hit.id, next.damage)) {
            activeEnemyIds.delete(hit.id);
          }
          continue;
        }
        const bossTarget = this.#bossOneSystem?.damageTargets.find(
          (target) => this.#distance(next.position, target.position) <= next.radius + target.radius,
        );
        if (bossTarget) {
          this.#damageBossOne(bossTarget.id, next.damage);
          continue;
        }
        const bossTwoTarget = this.#bossTwoSystem?.projectileTarget(next.position, next.radius);
        if (bossTwoTarget) {
          this.#damageBossTwo(bossTwoTarget.id, next.damage);
          continue;
        }
        const finaleTarget = this.#finaleAddsSystem?.projectileTarget(next.position, next.radius);
        if (finaleTarget) {
          this.#damageFinaleAdd(finaleTarget.id, next.damage);
          if (this.#isResumeCountdownActive()) {
            return;
          }
          continue;
        }
        const bossThreeTarget = this.#bossThreeSystem?.damageTargets.find(
          (target) => this.#distance(next.position, target.position) <= next.radius + target.radius,
        );
        if (bossThreeTarget) {
          this.#damageBossThree(bossThreeTarget.id, next.damage);
          if (this.#state.phase === "finale-adds" || this.#state.phase === "cleared") {
            return;
          }
          continue;
        }
      } else if (this.#distance(next.position, this.#state.player.position) <= next.radius + 20) {
        this.#applyPlayerDamage(next.damage);
        continue;
      }

      if (next.remainingRange > 0) {
        remaining.push(next);
      }
    }
    this.#state = { ...this.#state, projectiles: remaining };
  }

  #damageEnemy(enemyId: string, damage: number): boolean {
    const result = this.#enemySystem.damageEnemy(enemyId, damage);
    if (result.killed !== null) {
      this.#pickupSystem.tryDrop(result.killed.position, this.#state.player.upgrades);
    }
    this.#state = {
      ...this.#state,
      enemies: result.enemies,
      enemyKills: result.enemyKills,
      pickups: this.#pickupSystem.pickups,
    };
    return result.killed !== null;
  }

  #damageBossOne(targetId: string, damage: number): void {
    if (this.#bossOneSystem === null) {
      return;
    }
    const result = this.#bossOneSystem.damageTarget(targetId, damage);
    this.#state = {
      ...this.#state,
      boss: result.boss,
      activeHazards: this.#bossOneSystem.activeHazards,
      rescuedCitizenIds: result.rescuedCitizenIds,
    };
    if (result.rescuedCitizenId !== null) {
      this.#rescueCitizenView(result.rescuedCitizenId);
    }
    if (result.completed) {
      this.#completeBossOneBattle();
    }
  }

  #damageBossTwo(targetId: string, damage: number): void {
    if (this.#bossTwoSystem === null) {
      return;
    }
    const result = this.#bossTwoSystem.damageTarget(targetId, damage);
    this.#state = {
      ...this.#state,
      boss: result.boss,
      activeHazards: this.#bossTwoSystem.activeHazards,
    };
    if (result.blocked && result.targetPart !== null) {
      this.#bossTwoView?.showBlocked(result.targetPart);
    }
    if (result.completed) {
      this.#completeBossTwoBattle();
    }
  }

  #damageBossThree(targetId: string, damage: number): void {
    if (this.#bossThreeSystem === null) {
      return;
    }
    const result = this.#bossThreeSystem.damageTarget(targetId, damage);
    this.#state = { ...this.#state, boss: result.boss, activeHazards: this.#bossThreeSystem.activeHazards };
    if (result.completed) {
      this.#completeBossThreeBattle();
      return;
    }
    if (result.finaleStarted) {
      this.#state = {
        ...this.#state,
        phase: "finale-adds",
        phaseBeforePause: "finale-adds",
        projectiles: [],
        activeHazards: [],
      };
      this.#bossThreeView?.destroy();
      this.#bossThreeView = null;
      this.#ensureFinaleAddsBattle();
    }
  }

  #damageFinaleAdd(targetId: string, damage: number): void {
    if (this.#finaleAddsSystem === null || this.#bossThreeSystem === null) {
      return;
    }
    const result = this.#finaleAddsSystem.damageTarget(targetId, damage);
    const boss = this.#bossThreeSystem.syncFinaleAdds(result.bossOne, result.bossTwo);
    this.#state = { ...this.#state, boss, activeHazards: result.activeHazards };
    if (result.completedNow) {
      this.#beginResumeCountdown(result.bossOne, result.bossTwo);
    }
  }

  #stepBossOne(deltaMs: number): void {
    if (this.#bossOneSystem === null || this.#state.phase !== "boss1") {
      return;
    }
    const result = this.#bossOneSystem.step(deltaMs, this.#state.player.position);
    this.#state = {
      ...this.#state,
      boss: result.boss,
      activeHazards: result.activeHazards,
      rescuedCitizenIds: result.rescuedCitizenIds,
    };
    for (const contact of result.contacts) {
      this.#applyPlayerDamage(contact.damage);
    }
  }

  #stepBossTwo(deltaMs: number): void {
    if (this.#bossTwoSystem === null || this.#state.phase !== "boss2") {
      return;
    }
    const result = this.#bossTwoSystem.step(deltaMs, this.#state.player.position);
    const waveTier = getWaveBudget(this.#state.normalElapsedMs).tier;
    for (const summon of result.summons) {
      this.#enemySystem.spawnSummoned(
        selectEnemyType(waveTier, this.#random),
        summon.position,
        this.#state.normalElapsedMs,
      );
    }
    this.#state = {
      ...this.#state,
      boss: result.boss,
      activeHazards: result.activeHazards,
      enemies: this.#enemySystem.enemies,
    };
    for (const contact of result.contacts) {
      this.#applyPlayerDamage(contact.damage);
    }
  }

  #stepBossThree(deltaMs: number): void {
    if (this.#bossThreeSystem === null || this.#state.phase !== "boss3") {
      return;
    }
    const result = this.#bossThreeSystem.step(deltaMs, this.#state.player.position);
    this.#state = {
      ...this.#state,
      boss: result.boss,
      activeHazards: result.activeHazards,
      projectiles: [...this.#state.projectiles, ...result.projectiles].slice(0, GAME_BALANCE.limits.projectiles),
    };
    for (const contact of result.contacts) {
      this.#applyPlayerDamage(contact.damage);
    }
  }

  #stepFinaleAdds(deltaMs: number): void {
    if (this.#finaleAddsSystem === null || this.#bossThreeSystem === null || this.#state.phase !== "finale-adds") {
      return;
    }
    const result = this.#finaleAddsSystem.step(deltaMs, this.#state.player.position);
    const boss = this.#bossThreeSystem.syncFinaleAdds(result.bossOne, result.bossTwo);
    this.#state = { ...this.#state, boss, activeHazards: result.activeHazards };
    for (const contact of result.contacts) {
      this.#applyPlayerDamage(contact.damage);
    }
  }

  #completeBossOneBattle(): void {
    if (this.#bossOneSystem === null) {
      return;
    }
    const rescuedCitizenIds = this.#bossOneSystem.rescuedCitizenIds;
    for (const citizenUserId of rescuedCitizenIds) {
      this.#rescueCitizenView(citizenUserId);
    }
    this.#state = {
      ...this.#state,
      phase: "normal",
      currentBossElapsedMs: 0,
      bossTimesMs: [this.#state.currentBossElapsedMs, this.#state.bossTimesMs[1], this.#state.bossTimesMs[2]],
      boss: null,
      activeHazards: this.#state.activeHazards.filter(({ kind }) => kind !== "boss1-sweep"),
      rescuedCitizenIds,
    };
    this.#bossOneSystem = null;
    this.#bossOneView?.destroy();
    this.#bossOneView = null;
  }

  #completeBossTwoBattle(): void {
    if (this.#bossTwoSystem === null) {
      return;
    }
    this.#state = {
      ...this.#state,
      phase: "normal",
      currentBossElapsedMs: 0,
      bossTimesMs: [this.#state.bossTimesMs[0], this.#state.currentBossElapsedMs, this.#state.bossTimesMs[2]],
      boss: null,
      activeHazards: this.#state.activeHazards.filter(
        ({ kind }) => kind !== "boss2-mace" && kind !== "boss2-shockwave",
      ),
    };
    this.#bossTwoSystem = null;
    this.#bossTwoView?.destroy();
    this.#bossTwoView = null;
  }

  #beginResumeCountdown(bossOne: BossSnapshot & { kind: "boss1" }, bossTwo: BossSnapshot & { kind: "boss2" }): void {
    if (this.#bossThreeSystem === null) {
      return;
    }
    const boss = this.#bossThreeSystem.beginResumeCountdown(bossOne, bossTwo);
    this.#state = { ...this.#state, boss, activeHazards: [], projectiles: [] };
    this.#finaleAddsSystem = null;
    this.#resumeCountdownDeadlineMs = null;
    this.#bossOneView?.destroy();
    this.#bossOneView = null;
    this.#bossTwoView?.destroy();
    this.#bossTwoView = null;
    this.#clock.reset();
  }

  #isResumeCountdownActive(): boolean {
    return (
      this.#state.phase === "finale-adds" &&
      this.#state.boss?.kind === "boss3" &&
      this.#state.boss.resumeCountdownMs > 0
    );
  }

  #updateResumeCountdown(nowMs: number): void {
    if (this.#state.boss?.kind !== "boss3" || this.#bossThreeSystem === null) {
      return;
    }
    this.#resumeCountdownDeadlineMs ??= nowMs + this.#state.boss.resumeCountdownMs;
    const remainingMs = resumeCountdownRemaining(this.#resumeCountdownDeadlineMs, nowMs);
    const boss = this.#bossThreeSystem.setResumeCountdown(remainingMs);
    this.#state = { ...this.#state, boss };
    if (remainingMs === 0) {
      const resumedBoss = this.#bossThreeSystem.resumeAfterFinale();
      this.#state = {
        ...this.#state,
        phase: "boss3",
        phaseBeforePause: "boss3",
        boss: resumedBoss,
        activeHazards: [],
        projectiles: [],
      };
      this.#resumeCountdownDeadlineMs = null;
      this.#clock.reset();
    }
    this.#syncViews();
    this.#publishViewState();
  }

  #updateRestoreCountdown(nowMs: number): void {
    if (this.#restoreCountdownRemainingMs === null) {
      return;
    }
    this.#restoreCountdownDeadlineMs ??= nowMs + this.#restoreCountdownRemainingMs;
    this.#restoreCountdownRemainingMs = resumeCountdownRemaining(this.#restoreCountdownDeadlineMs, nowMs);
    if (this.#restoreCountdownRemainingMs === 0) {
      this.#restoreCountdownRemainingMs = null;
      this.#restoreCountdownDeadlineMs = null;
      this.#desktopInput?.reset();
      this.#touchInput?.reset();
      this.#clock.reset();
    }
    this.#publishViewState();
  }

  #completeBossThreeBattle(): void {
    this.#state = {
      ...this.#state,
      phase: "cleared",
      currentBossElapsedMs: 0,
      bossTimesMs: [this.#state.bossTimesMs[0], this.#state.bossTimesMs[1], this.#state.currentBossElapsedMs],
      boss: null,
      activeHazards: this.#state.activeHazards.filter(
        ({ kind }) => kind !== "boss3-edge" && kind !== "boss3-safe-zone",
      ),
      projectiles: [],
    };
    this.#bossThreeSystem = null;
    this.#bossThreeView?.destroy();
    this.#bossThreeView = null;
  }

  #applyPlayerDamage(damage: number): void {
    const result = this.#playerSystem.takeDamage(damage);
    this.#state = { ...this.#state, player: result.player, hitCount: result.hitCount };
  }

  #distance(left: Vector2, right: Vector2): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  #syncViews(): void {
    this.#playerView?.sync(this.#state.player);
    this.#syncEnemyViews();
    this.#syncProjectileViews();
    this.#syncPickupViews();
    this.#syncBossOneViews();
    this.#syncBossTwoViews();
    this.#syncBossThreeViews();
    this.#syncFinaleAddsViews();
  }

  #syncEnemyViews(): void {
    if (this.#state.enemies.length > DETAILED_ENEMY_VIEW_LIMIT) {
      for (const view of this.#enemyViews.values()) {
        view.destroy();
      }
      this.#enemyViews.clear();
      this.#enemyBatch ??= this.add.graphics().setDepth(5);
      this.#enemyBatch.clear();
      for (const type of Object.keys(ENEMY_COLORS) as EnemyType[]) {
        this.#enemyBatch.fillStyle(ENEMY_COLORS[type]);
        const renderedCells = new Set<number>();
        for (const enemy of this.#state.enemies) {
          if (enemy.type === type) {
            const cellX = Math.floor(enemy.position.x / ENEMY_VISUAL_CELL_SIZE);
            const cellY = Math.floor(enemy.position.y / ENEMY_VISUAL_CELL_SIZE);
            const cell = cellY * ENEMY_VISUAL_GRID_COLUMNS + cellX;
            if (renderedCells.has(cell)) {
              continue;
            }
            renderedCells.add(cell);
            this.#enemyBatch.fillCircle(enemy.position.x, enemy.position.y, enemyRadius(type));
          }
        }
      }
      return;
    }
    this.#enemyBatch?.destroy();
    this.#enemyBatch = null;
    const activeIds = new Set(this.#state.enemies.map(({ id }) => id));
    for (const [id, view] of this.#enemyViews) {
      if (!activeIds.has(id)) {
        view.destroy();
        this.#enemyViews.delete(id);
      }
    }
    for (const enemy of this.#state.enemies) {
      const existing = this.#enemyViews.get(enemy.id);
      if (existing) {
        existing.sync(enemy);
      } else {
        const view = new EnemyView(this, enemy);
        view.object.setDepth(5);
        this.#enemyViews.set(enemy.id, view);
      }
    }
  }

  #syncProjectileViews(): void {
    this.#projectileBatch ??= this.add.graphics().setDepth(8);
    this.#projectileBatch.clear();
    this.#projectileBatch.fillStyle(0x8ad8ff);
    const renderedPlayerCells = new Set<number>();
    for (const projectile of this.#state.projectiles) {
      if (projectile.owner === "player") {
        const cellX = Math.floor(projectile.position.x / PROJECTILE_VISUAL_CELL_SIZE);
        const cellY = Math.floor(projectile.position.y / PROJECTILE_VISUAL_CELL_SIZE);
        const cell = cellY * PROJECTILE_VISUAL_GRID_COLUMNS + cellX;
        if (renderedPlayerCells.has(cell)) {
          continue;
        }
        renderedPlayerCells.add(cell);
        this.#projectileBatch.fillCircle(projectile.position.x, projectile.position.y, projectile.radius);
      }
    }
    this.#projectileBatch.fillStyle(0xf26d6d);
    for (const projectile of this.#state.projectiles) {
      if (projectile.owner === "enemy") {
        this.#projectileBatch.fillCircle(projectile.position.x, projectile.position.y, projectile.radius);
      }
    }
  }

  #syncPickupViews(): void {
    this.#pickupBatch ??= this.add.graphics().setDepth(4);
    if (
      this.#renderedPickupIds.size === this.#state.pickups.length &&
      this.#state.pickups.every(({ id }) => this.#renderedPickupIds.has(id))
    ) {
      return;
    }
    this.#pickupBatch.clear().fillStyle(0xffd166).lineStyle(2, 0xffffff, 0.85);
    this.#renderedPickupIds.clear();
    for (const pickup of this.#state.pickups) {
      this.#renderedPickupIds.add(pickup.id);
      this.#pickupBatch.fillCircle(pickup.position.x, pickup.position.y, 10);
      this.#pickupBatch.strokeCircle(pickup.position.x, pickup.position.y, 10);
    }
  }

  #syncBossOneViews(): void {
    if (this.#bossOneSystem === null || this.#state.boss?.kind !== "boss1") {
      return;
    }
    if (this.#bossOneView === null) {
      this.#bossOneView = new BossOneView(this, this.#state.boss, this.#state.seed);
    }
    this.#bossOneView.sync(this.#state.boss, this.#state.activeHazards);

    for (const tentacle of this.#state.boss.tentacles) {
      const citizenUserId = tentacle.citizenUserId;
      if (citizenUserId === null) {
        continue;
      }
      if (tentacle.destroyed || this.#state.rescuedCitizenIds.includes(citizenUserId)) {
        this.#rescueCitizenView(citizenUserId);
        continue;
      }
      const position = bossOneCitizenPosition(this.#state.boss, tentacle.angleRadians);
      const existing = this.#citizenViews.get(citizenUserId);
      if (existing) {
        existing.sync(position);
        continue;
      }
      const textureKey = profileTextureKey(citizenUserId);
      const view = new CitizenView(this, this.textures.exists(textureKey) ? textureKey : null, position);
      this.#citizenViews.set(citizenUserId, view);
    }
  }

  #syncBossTwoViews(): void {
    if (this.#bossTwoSystem === null || this.#state.boss?.kind !== "boss2") {
      return;
    }
    if (this.#bossTwoView === null) {
      this.#bossTwoView = new BossTwoView(this, this.#state.boss);
    }
    this.#bossTwoView.sync(this.#state.boss, this.#state.activeHazards);
  }

  #syncBossThreeViews(): void {
    if (this.#bossThreeSystem === null || this.#state.boss?.kind !== "boss3" || this.#state.phase !== "boss3") {
      return;
    }
    if (this.#bossThreeView === null) {
      this.#bossThreeView = new BossThreeView(this, this.#state.boss, this.#state.seed);
    }
    this.#bossThreeView.sync(this.#state.boss, this.#state.activeHazards, this.#state.player.position);
  }

  #syncFinaleAddsViews(): void {
    if (this.#finaleAddsSystem === null) {
      return;
    }
    if (this.#bossOneView === null) {
      this.#bossOneView = new BossOneView(this, this.#finaleAddsSystem.bossOne, this.#state.seed);
    }
    if (this.#bossTwoView === null) {
      this.#bossTwoView = new BossTwoView(this, this.#finaleAddsSystem.bossTwo);
    }
    this.#bossOneView.sync(this.#finaleAddsSystem.bossOne, this.#state.activeHazards);
    this.#bossTwoView.sync(this.#finaleAddsSystem.bossTwo, this.#state.activeHazards);
    this.#bossOneView.object.setVisible(this.#finaleAddsSystem.bossOne.hp > 0);
    this.#bossTwoView.object.setVisible(this.#finaleAddsSystem.bossTwo.stage !== "defeated");
  }

  #rescueCitizenView(citizenUserId: string): void {
    const view = this.#citizenViews.get(citizenUserId);
    if (!view) {
      return;
    }
    view.rescue(this, () => this.#citizenViews.delete(citizenUserId));
  }

  #destroyRuntimeViews(): void {
    for (const view of this.#enemyViews.values()) {
      view.destroy();
    }
    this.#enemyViews.clear();
    this.#enemyBatch?.destroy();
    this.#enemyBatch = null;
    this.#projectileBatch?.destroy();
    this.#projectileBatch = null;
    this.#pickupBatch?.destroy();
    this.#pickupBatch = null;
    this.#renderedPickupIds.clear();
    this.#bossOneView?.destroy();
    this.#bossOneView = null;
    this.#bossTwoView?.destroy();
    this.#bossTwoView = null;
    this.#bossThreeView?.destroy();
    this.#bossThreeView = null;
    for (const view of this.#citizenViews.values()) {
      view.destroy();
    }
    this.#citizenViews.clear();
  }

  #publishViewState(): void {
    const health = bossHealth(this.#state.boss);
    const stats = derivedStats(this.#state.player.upgrades);
    const viewState: GameViewState = {
      hp: this.#state.player.hp,
      maxHp: this.#state.player.maxHp,
      dashCharges: this.#state.player.dashCharges,
      dashMax: stats.dashMaxCharges,
      swordStormCooldownMs: this.#state.player.swordStormCooldownMs,
      ultimateCharge: this.#state.player.ultimateCharge,
      normalElapsedMs: this.#state.normalElapsedMs,
      phase: this.#state.phase,
      bossHp: health.hp,
      bossMaxHp: health.maxHp,
      resumeCountdownMs: this.#restoreCountdownRemainingMs ?? (
        this.#isResumeCountdownActive() && this.#state.boss?.kind === "boss3"
          ? this.#state.boss.resumeCountdownMs
          : null
      ),
    };
    this.#options.bridge.publish(viewState);
  }

  #cleanup(): void {
    if (this.#cleanedUp) {
      return;
    }
    this.#cleanedUp = true;
    if (globalThis.__DEX_PERF__ === this.#performanceApi) {
      Reflect.deleteProperty(globalThis, "__DEX_PERF__");
    }
    this.#performanceApi = null;
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
    this.#unsubscribeCommands?.();
    this.#unsubscribeCommands = null;
    this.#options.bridge.cancelPendingPublication();
    this.#desktopInput?.destroy();
    this.#desktopInput = null;
    this.#touchInput?.destroy();
    this.#touchInput = null;
    this.#destroyRuntimeViews();
    this.#playerView?.destroy();
    this.#playerView = null;
    for (const key of this.#ownedTextureKeys) {
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }
    this.#ownedTextureKeys = [];
  }
}