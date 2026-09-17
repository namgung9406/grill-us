import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContextValue } from "@/auth/types";

let authValue: AuthContextValue;

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => authValue,
}));

import { AppShell } from "./AppShell";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  beforeEach(() => {
    authValue = {
      status: "anonymous",
      user: null,
      errorMessage: null,
      login: vi.fn(),
      logout: vi.fn(),
      acquireGraphToken: vi.fn(),
      acquireApiToken: vi.fn(),
      retry: vi.fn(),
    };
  });

  it("비로그인 사용자에게 잠긴 게임과 로그인 명령을 제공한다", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar mobileOpen onClose={vi.fn()} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "게임 - 로그인 필요" }));
    expect(authValue.login).toHaveBeenCalledWith("/games");
    expect(screen.getByRole("button", { name: "로그인" })).toBeVisible();
  });

  it("로그인 사용자의 이름과 이메일을 text로 표시한다", () => {
    authValue = {
      ...authValue,
      status: "authenticated",
      user: { objectId: "oid", displayName: "홍길동", email: "user@example.com" },
    };
    render(
      <MemoryRouter>
        <Sidebar mobileOpen onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText("홍길동")).toBeVisible();
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
  });

  it("Escape로 모바일 메뉴를 닫고 toggle로 focus를 복원한다", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: "메뉴 열기" });
    await user.click(toggle);
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "메뉴 열기" })).toHaveFocus();
  });
});