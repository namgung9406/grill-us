import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContextValue } from "./types";

const login = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
let authValue: AuthContextValue;

vi.mock("./AuthProvider", () => ({
  useAuth: () => authValue,
}));

import { ProtectedRoute, RETURN_TO_KEY, sanitizeReturnTo } from "./ProtectedRoute";

function renderProtected(path = "/games/dex-survivor?mode=continue#hud") {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="games/:gameId" element={<p>보호된 게임</p>} />
          </Route>
          <Route path="/" element={<p>홈</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    login.mockClear();
    sessionStorage.clear();
    authValue = {
      status: "anonymous",
      user: null,
      errorMessage: null,
      login,
      logout: vi.fn(),
      acquireGraphToken: vi.fn(),
      acquireApiToken: vi.fn(),
      retry: vi.fn(),
    };
  });

  it("반환 경로를 저장하고 Strict Mode에서도 로그인을 한 번만 시작한다", async () => {
    renderProtected();

    await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/games/dex-survivor?mode=continue#hud");
  });

  it("인증 중에는 전체 화면 상태를 표시한다", () => {
    authValue = { ...authValue, status: "loading" };
    renderProtected();
    expect(screen.getByRole("status")).toHaveTextContent("로그인 페이지로 이동하고 있습니다");
  });

  it("내부 상대 경로만 허용한다", () => {
    expect(sanitizeReturnTo("/games?id=1#top")).toBe("/games?id=1#top");
    expect(sanitizeReturnTo("//evil.example/path")).toBe("/games");
    expect(sanitizeReturnTo("https://evil.example/path")).toBe("/games");
  });
});