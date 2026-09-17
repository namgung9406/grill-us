import { z } from "zod";

import type { GameState } from "@/games/dex-survivor/domain/types";
import type { StorageResult } from "@/games/dex-survivor/persistence/GameSaveStore";
import type { GameSceneTestPort } from "@/games/dex-survivor/runtime/GameScene";

const timeSchema = z.number().int().nonnegative().finite();
const damageSchema = z.number().positive().finite();
const hpSchema = z.number().int().nonnegative().finite();

interface E2eGamePort extends GameSceneTestPort {
  flushSave: () => StorageResult | null;
}

export interface E2eGameApi {
  getSnapshot: () => GameState;
  advanceNormalTo: (targetElapsedMs: number) => void;
  setBossHp: (hp: number) => void;
  damageActiveBossPart: (amount: number) => void;
  damagePlayer: (amount: number) => void;
  completeCurrentBoss: () => void;
  flushSave: () => StorageResult | null;
}

declare global {
  var __DEX_E2E__: E2eGameApi | undefined;
}

export class E2eGameBridge {
  public static install(port: E2eGamePort): () => void {
    if (import.meta.env.MODE !== "e2e" || import.meta.env.VITE_E2E_AUTH !== "true") {
      throw new Error("E2E game bridge는 Playwright 전용 e2e mode에서만 설치할 수 있습니다.");
    }

    const api: E2eGameApi = Object.freeze({
      getSnapshot: () => port.getSnapshot(),
      advanceNormalTo: (targetElapsedMs: number) => port.advanceNormalTo(timeSchema.parse(targetElapsedMs)),
      setBossHp: (hp: number) => port.setBossHp(hpSchema.parse(hp)),
      damageActiveBossPart: (amount: number) => port.damageActiveBossPart(damageSchema.parse(amount)),
      damagePlayer: (amount: number) => port.damagePlayer(damageSchema.parse(amount)),
      completeCurrentBoss: () => port.completeCurrentBoss(),
      flushSave: () => port.flushSave(),
    });
    globalThis.__DEX_E2E__ = api;

    return () => {
      if (globalThis.__DEX_E2E__ === api) {
        Reflect.deleteProperty(globalThis, "__DEX_E2E__");
      }
    };
  }
}