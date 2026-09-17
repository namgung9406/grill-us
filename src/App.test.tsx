import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./auth/AuthProvider", () => ({
  AuthProvider: ({ children }: PropsWithChildren) => children,
  useAuth: () => ({
    status: "anonymous",
    user: null,
    errorMessage: null,
    login: vi.fn(),
    logout: vi.fn(),
    acquireGraphToken: vi.fn(),
    acquireApiToken: vi.fn(),
    retry: vi.fn(),
  }),
}));

import App from "./App";

describe("App", () => {
  it("최소 앱을 렌더한다", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "게임을 준비하고 있습니다" })).toBeVisible();
  });
});