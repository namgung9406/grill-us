import Phaser from "phaser";

import type { GameProfileAssets } from "@/graph/types";

import { GAME_BALANCE } from "../domain/constants";
import type { GameState } from "../domain/types";
import type { GameBridge } from "./GameBridge";
import { GameScene, type GameSceneTestPort } from "./GameScene";

export interface CreateGameOptions {
  parent: HTMLElement;
  initialState: GameState;
  assets: GameProfileAssets;
  bridge: GameBridge;
  onScene?: (scene: GameScene) => void;
  onTestPort?: (port: GameSceneTestPort) => void;
}

export function createDexSurvivorGame(options: CreateGameOptions): Phaser.Game {
  const scene = new GameScene(options);
  options.onScene?.(scene);
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    width: GAME_BALANCE.arena.width,
    height: GAME_BALANCE.arena.height,
    backgroundColor: "#10171d",
    transparent: false,
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_BALANCE.arena.width,
      height: GAME_BALANCE.arena.height,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    fps: {
      target: GAME_BALANCE.simulation.maximumRenderFps,
    },
    scene,
  });
}