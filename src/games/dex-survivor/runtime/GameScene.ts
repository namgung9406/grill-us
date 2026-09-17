import Phaser from "phaser";

import type { GameProfileAssets } from "@/graph/types";

import { SimulationClock } from "../domain/clock";
import { GAME_BALANCE } from "../domain/constants";
import { advanceTimeline } from "../domain/progression";
import type { BossSnapshot, GameState, Vector2 } from "../domain/types";
import { derivedStats } from "../domain/upgrades";
import type { GameBridge, GameCommand, GameViewState } from "./GameBridge";
import { DesktopInput } from "./input/DesktopInput";
import { TouchInput, type AimTarget } from "./input/TouchInput";
import type { InputFrame } from "./input/types";
import { PlayerSystem } from "./systems/PlayerSystem";
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
  #desktopInput: DesktopInput | null = null;
  #touchInput: TouchInput | null = null;
  #playerSprite: Phaser.GameObjects.Image | null = null;
  #unsubscribeCommands: (() => void) | null = null;
  #ownedTextureKeys: string[] = [];
  #visibilityResetRequested = false;
  #cleanedUp = false;

  public constructor(options: GameSceneOptions) {
    super({ key: "DexSurvivorGameScene" });
    this.#options = options;
    this.#state = cloneState(options.initialState);
    this.#playerSystem = new PlayerSystem(this.#state.player, this.#state.hitCount);
  }

  public preload(): void {
    this.#ownedTextureKeys.push(...queueProfileTextures(this, this.#options.assets));
  }

  public create(): void {
    this.#ownedTextureKeys.push(...createProceduralTextures(this));
    this.add
      .tileSprite(0, 0, GAME_BALANCE.arena.width, GAME_BALANCE.arena.height, PROCEDURAL_TEXTURE_KEYS.arena)
      .setOrigin(0);

    const profileKey = profileTextureKey(this.#options.assets.player.userId);
    const playerTexture = this.textures.exists(profileKey) ? profileKey : PROCEDURAL_TEXTURE_KEYS.player;
    this.#playerSprite = this.add.image(this.#state.player.position.x, this.#state.player.position.y, playerTexture);
    this.#playerSprite.setDisplaySize(44, 44).setDepth(10);

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
      this.#clock.reset();
      this.#desktopInput?.reset();
      this.#touchInput?.reset();
      this.#renderPlayer();
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
    if (this.#state.boss !== null) {
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
    this.#renderPlayer();
    this.#renderActions(result.actions);
    this.#publishViewState();
  }

  #renderPlayer(): void {
    this.#playerSprite?.setPosition(this.#state.player.position.x, this.#state.player.position.y);
    this.#playerSprite?.setRotation(this.#state.player.facingRadians + Math.PI / 2);
    this.#playerSprite?.setAlpha(this.#state.player.invulnerableRemainingMs > 0 ? 0.68 : 1);
  }

  #renderActions(actions: readonly { type: string; origin?: Vector2; direction?: Vector2; range?: number; radius?: number }[]): void {
    for (const action of actions) {
      if (action.type === "gun" && action.origin && action.direction) {
        const flash = this.add.image(
          action.origin.x + action.direction.x * 28,
          action.origin.y + action.direction.y * 28,
          PROCEDURAL_TEXTURE_KEYS.projectile,
        );
        this.tweens.add({
          targets: flash,
          x: action.origin.x + action.direction.x * Math.min(action.range ?? 80, 80),
          y: action.origin.y + action.direction.y * Math.min(action.range ?? 80, 80),
          alpha: 0,
          duration: 80,
          onComplete: () => flash.destroy(),
        });
      } else if ((action.type === "sword" || action.type === "sword-storm") && action.origin) {
        const ring = this.add.circle(action.origin.x, action.origin.y, action.radius ?? action.range ?? 90, 0x4dd5b8, 0.15);
        ring.setStrokeStyle(3, 0xffffff, 0.8).setDepth(9);
        this.tweens.add({ targets: ring, alpha: 0, duration: 120, onComplete: () => ring.destroy() });
      }
    }
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
    for (const key of this.#ownedTextureKeys) {
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }
    this.#ownedTextureKeys = [];
  }
}