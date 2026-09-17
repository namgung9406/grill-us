import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContextValue } from "@/auth/types";

const loadGame = vi.fn();
interface MockProfileQuery {
  data: undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

const useGameProfileAssets = vi.fn<(options: unknown) => MockProfileQuery>();
let authValue: AuthContextValue;

vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => authValue }));
vi.mock("@/games/registry", () => ({
  getGameDefinition: (gameId: string) =>
    gameId === "dex-survivor"
      ? {
          id: "dex-survivor",
          title: "DEX Survivor",
          description: "테스트 설명",
          load: loadGame,
        }
      : null,
}));
vi.mock("@/graph/useGameProfileAssets", () => ({
  gameProfileAssetsKey: (objectId: string, ids: readonly string[]) => [
    "game-profile-assets",
    objectId,
    ids,
  ],
  useGameProfileAssets: (options: unknown) => useGameProfileAssets(options),
}));

import { GamePage } from "./GamePage";

function renderPage(path: string, state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path="/games/:gameId" element={<GamePage />} />
          <Route path="/games" element={<p>게임 목록</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("GamePage", () => {
  beforeEach(() => {
    localStorage.clear();
    loadGame.mockReset();
    loadGame.mockResolvedValue({ default: () => <p>게임 실행</p> });
    useGameProfileAssets.mockReset();
    useGameProfileAssets.mockReturnValue({
      data: undefined,
      isError: false,
      isFetching: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    authValue = {
      status: "authenticated",
      user: { objectId: "owner", displayName: "플레이어", email: "player@example.com" },
      errorMessage: null,
      login: vi.fn(),
      logout: vi.fn(),
      acquireGraphToken: vi.fn().mockResolvedValue("token"),
      acquireApiToken: vi.fn(),
      retry: vi.fn(),
    };
  });

  it("직접 접근은 시작 전 Graph와 게임 로드를 실행하지 않는다", () => {
    renderPage("/games/dex-survivor");

    expect(screen.getByRole("button", { name: "게임 시작" })).toBeVisible();
    expect(loadGame).not.toHaveBeenCalled();
    expect(useGameProfileAssets).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("카드 시작 상태는 준비를 한 번만 시작한다", async () => {
    renderPage("/games/dex-survivor", { startRequested: true });

    await waitFor(() => expect(loadGame).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("플레이어 준비 중");
    expect(useGameProfileAssets).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
  });

  it("미등록 ID에는 게임 전용 찾을 수 없음 화면을 표시한다", () => {
    renderPage("/games/not-registered");
    expect(screen.getByRole("heading", { name: "등록되지 않은 게임입니다" })).toBeVisible();
  });

  it("유효한 동일 계정 저장이 있으면 계속하기를 표시한다", async () => {
    localStorage.setItem(
      "grill-us:dex-survivor:save:v1:owner",
      JSON.stringify({
        version: 1,
        gameId: "dex-survivor",
        ownerObjectId: "owner",
        citizenUserIds: ["citizen-2", "citizen-1"],
      }),
    );
    const user = userEvent.setup();
    renderPage("/games/dex-survivor");

    await user.click(screen.getByRole("button", { name: "계속하기" }));
    expect(useGameProfileAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ preferredCitizenIds: ["citizen-2", "citizen-1"], enabled: true }),
    );
  });

  it("준비 취소 후 시작 버튼으로 focus를 복원한다", async () => {
    const user = userEvent.setup();
    renderPage("/games/dex-survivor");

    await user.click(screen.getByRole("button", { name: "게임 시작" }));
    await user.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "게임 시작" })).toHaveFocus());
  });
});