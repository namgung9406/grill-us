import type { GameDefinition } from "./types";

export const GAME_REGISTRY: readonly GameDefinition[] = [
  {
    id: "dex-survivor",
    title: "DEX Survivor",
    description: "조직의 동료들을 구출하며 몰려오는 위협과 세 보스를 돌파하는 생존 액션 게임입니다.",
    load: () => import("./dex-survivor/DexSurvivorGame"),
  },
];

export function getGameDefinition(gameId: string): GameDefinition | null {
  return GAME_REGISTRY.find((game) => game.id === gameId) ?? null;
}