import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameBridge } from "./runtime/GameBridge";

let activeGames = 0;
let activeCommandListeners = 0;
const destroyGame = vi.fn();
const createGame = vi.fn((options: { bridge: GameBridge }) => {
  activeGames += 1;
  const unsubscribe = options.bridge.subscribeCommands(() => undefined);
  activeCommandListeners += 1;
  let destroyed = false;
  return {
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      destroyGame();
      activeGames -= 1;
      activeCommandListeners -= 1;
      unsubscribe();
    },
  };
});

vi.mock("./runtime/createGame", () => ({
  createDexSurvivorGame: (options: { bridge: GameBridge }) => createGame(options),
}));

import DexSurvivorGame from "./DexSurvivorGame";

describe("DexSurvivorGame", () => {
  beforeEach(() => {
    activeGames = 0;
    activeCommandListeners = 0;
    createGame.mockClear();
    destroyGame.mockClear();
  });

  it("keeps one Phaser instance through Strict Mode and removes all runtime listeners on unmount", () => {
    const view = render(
      <StrictMode>
        <DexSurvivorGame
          ownerObjectId="11111111-1111-4111-8111-111111111111"
          profileAssets={{
            player: { userId: "11111111-1111-4111-8111-111111111111", displayName: "Player", objectUrl: null, kind: "helmet" },
            citizens: [],
            release: vi.fn(),
          }}
          onExit={vi.fn()}
        />
      </StrictMode>,
    );

    expect(createGame).toHaveBeenCalledTimes(2);
    expect(destroyGame).toHaveBeenCalledOnce();
    expect(activeGames).toBe(1);
    expect(activeCommandListeners).toBe(1);

    view.unmount();
    expect(destroyGame).toHaveBeenCalledTimes(2);
    expect(activeGames).toBe(0);
    expect(activeCommandListeners).toBe(0);
  });
});