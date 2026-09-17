import Phaser from "phaser";

import type { GameProfileAssets } from "@/graph/types";

import { bossOneCitizenPosition, createBossOneState } from "../domain/bosses";
import { SimulationClock } from "../domain/clock";
import { GAME_BALANCE } from "../domain/constants";
import { enemyRadius } from "../domain/enemies";
import { advanceTimeline } from "../domain/progression";
import { XorShift32 } from "../domain/random";
import type { BossSnapshot, EnemySnapshot, GameState, ProjectileSnapshot, Vector2 } from "../domain/types";
import { derivedStats } from "../domain/upgrades";
import { BossOneSystem } from "./bosses/BossOneSystem";
import { BossOneView } from "./bosses/BossOneView";
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
}

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
    return { hp: boss.parts.core.hp, maxHp: GAME_BALANCE.bosses.bossTwo.partHp.core };
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
  #desktopInput: DesktopInput | null = null;
  #touchInput: TouchInput | null = null;
  #playerView: PlayerView | null = null;
  readonly #enemyViews = new Map<string, EnemyView>();
  readonly #projectileViews = new Map<string, Phaser.GameObjects.Arc>();
  readonly #pickupViews = new Map<string, Phaser.GameObjects.Arc>();
  #bossOneView: BossOneView | null = null;
  readonly #citizenViews = new Map<string, CitizenView>();
  #unsubscribeCommands: (() => void) | null = null;
  #ownedTextureKeys: string[] = [];
  #nextEntityId = 1;
  #visibilityResetRequested = false;
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
  }

  public override update(_time: number, deltaMs: number): void {
    if (this.#state.phase === "paused" || this.#state.phase === "defeated" || this.#state.phase === "cleared") {
      this.#clock.reset();
      return;
    }

    if (this.#visibilityResetRequested || deltaMs > GAME_BALANCE.simulation.resetFrameDeltaMs) {
      this.#visibilityResetRequested = false;
      this.#clock.reset();
      return;
    }

    this.#clock.advance(deltaMs, (stepMs) => this.#simulate(stepMs));
  }

  readonly #onCommand = (command: GameCommand): void => {
    if (command.type === "pause" && this.#state.phase !== "paused") {
      if (this.#state.phase === "defeated" || this.#state.phase === "cleared") {
        return;
      }
      this.#state = { ...this.#state, phaseBeforePause: this.#state.phase, phase: "paused" };
      this.#clock.reset();
      this.#desktopInput?.reset();
      this.#touchInput?.reset();
      this.#publishViewState();
    } else if (command.type === "resume" && this.#state.phase === "paused") {
      this.#state = { ...this.#state, phase: this.#state.phaseBeforePause };
      this.#clock.reset();
      this.#publishViewState();
    } else if (command.type === "restart") {
      this.#state = cloneState(this.#options.initialState);
      this.#playerSystem.reset(this.#state.player, this.#state.hitCount);
      this.#random = new XorShift32(this.#state.rngState);
      this.#nextEntityId = 1;
      this.#enemySystem = this.#createEnemySystem();
      this.#pickupSystem = this.#createPickupSystem();
      this.#bossOneSystem = null;
      this.#ensureBossOneBattle();
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
  };

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
    } else if (this.#state.boss !== null) {
      targets.push({ id: `boss-${this.#state.boss.kind}`, position: this.#state.boss.position });
    }
    const input = combineInput(
      this.#desktopInput.readFrame(),
      this.#touchInput.readFrame(this.#state.player.position, targets),
    );
    const result = this.#playerSystem.step(deltaMs, input);
    this.#state = advanceTimeline(
      { ...this.#state, player: result.player, hitCount: this.#playerSystem.hitCount },
      deltaMs,
    );
    this.#ensureBossOneBattle();
    this.#handlePlayerActions(result.actions);

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

    this.#stepProjectiles(deltaMs);
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
    this.#syncViews();
    this.#publishViewState();
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
        this.#showAttackRing(action.origin, action.radius);
      } else if (action.type === "ultimate") {
        for (const enemy of this.#enemySystem.enemies) {
          this.#damageEnemy(enemy.id, action.damage);
        }
        const bossTargetIds = this.#bossOneSystem?.damageTargets.map(({ id }) => id) ?? [];
        for (const targetId of bossTargetIds) {
          this.#damageBossOne(targetId, action.damage);
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
        const hit = this.#enemySystem.enemies.find(
          (enemy) => this.#distance(next.position, enemy.position) <= next.radius + enemyRadius(enemy.type),
        );
        if (hit) {
          this.#damageEnemy(hit.id, next.damage);
          continue;
        }
        const bossTarget = this.#bossOneSystem?.damageTargets.find(
          (target) => this.#distance(next.position, target.position) <= next.radius + target.radius,
        );
        if (bossTarget) {
          this.#damageBossOne(bossTarget.id, next.damage);
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

  #damageEnemy(enemyId: string, damage: number): void {
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
  }

  #syncEnemyViews(): void {
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
    const activeIds = new Set(this.#state.projectiles.map(({ id }) => id));
    for (const [id, view] of this.#projectileViews) {
      if (!activeIds.has(id)) {
        view.destroy();
        this.#projectileViews.delete(id);
      }
    }
    for (const projectile of this.#state.projectiles) {
      let view = this.#projectileViews.get(projectile.id);
      if (!view) {
        view = this.add
          .circle(
            projectile.position.x,
            projectile.position.y,
            projectile.radius,
            projectile.owner === "player" ? 0x8ad8ff : 0xf26d6d,
          )
          .setDepth(8);
        this.#projectileViews.set(projectile.id, view);
      }
      view.setPosition(projectile.position.x, projectile.position.y);
    }
  }

  #syncPickupViews(): void {
    const activeIds = new Set(this.#state.pickups.map(({ id }) => id));
    for (const [id, view] of this.#pickupViews) {
      if (!activeIds.has(id)) {
        view.destroy();
        this.#pickupViews.delete(id);
      }
    }
    for (const pickup of this.#state.pickups) {
      let view = this.#pickupViews.get(pickup.id);
      if (!view) {
        view = this.add.circle(pickup.position.x, pickup.position.y, 10, 0xffd166).setDepth(4);
        view.setStrokeStyle(2, 0xffffff, 0.85);
        this.#pickupViews.set(pickup.id, view);
      }
      view.setPosition(pickup.position.x, pickup.position.y);
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
    for (const view of this.#projectileViews.values()) {
      view.destroy();
    }
    this.#projectileViews.clear();
    for (const view of this.#pickupViews.values()) {
      view.destroy();
    }
    this.#pickupViews.clear();
    this.#bossOneView?.destroy();
    this.#bossOneView = null;
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
    };
    this.#options.bridge.publish(viewState);
  }

  #cleanup(): void {
    if (this.#cleanedUp) {
      return;
    }
    this.#cleanedUp = true;
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