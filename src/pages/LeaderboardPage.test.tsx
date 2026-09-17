import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContextValue } from "@/auth/types";
import { LeaderboardApiError, type LeaderboardApi } from "@/leaderboard/api";
import type { LeaderboardEntry } from "@/shared/leaderboard";

let authValue: AuthContextValue;

vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => authValue }));

import { LeaderboardPage } from "./LeaderboardPage";

const entry: LeaderboardEntry = {
  resultId: "00000000-0000-4000-8000-000000000010",
  outcome: "cleared",
  normalElapsedMs: 120_000,
  totalActiveMs: 180_000,
  enemyKills: 42,
  hitCount: 2,
  bossTimesMs: [10_000, null, 125_600],
  displayName: "Arcade Player",
  score: 12_345,
  submittedAtMs: 1_800_000_001_000,
};

function renderPage(api: LeaderboardApi, enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LeaderboardPage api={api} enabled={enabled} />
    </QueryClientProvider>,
  );
}

function createApi(list: LeaderboardApi["list"]): LeaderboardApi {
  return { list, submit: () => Promise.reject(new Error("not used")) };
}

describe("LeaderboardPage", () => {
  beforeEach(() => {
    localStorage.clear();
    authValue = {
      status: "authenticated",
      user: { objectId: "private-object-id", displayName: "Viewer", email: "private@example.com" },
      errorMessage: null,
      login: vi.fn(),
      logout: vi.fn(),
      acquireGraphToken: vi.fn(),
      acquireApiToken: vi.fn(),
      retry: vi.fn(),
    };
  });

  it("shows a loading skeleton while the request is pending", () => {
    renderPage(createApi(() => new Promise(() => undefined)));
    expect(screen.getByRole("status", { name: "리더보드 불러오는 중" })).toBeVisible();
  });

  it("shows the empty state", async () => {
    renderPage(createApi(() => Promise.resolve([])));
    expect(await screen.findByText("아직 등록된 기록이 없습니다.")).toBeVisible();
  });

  it("distinguishes authentication errors", async () => {
    renderPage(createApi(() => Promise.reject(
      new LeaderboardApiError(401, "UNAUTHORIZED", null, "Unauthorized"),
    )));
    expect(await screen.findByRole("alert")).toHaveTextContent("리더보드 인증이 필요합니다.");
  });

  it("renders ranked data without private account fields", async () => {
    renderPage(createApi(() => Promise.resolve([entry])));

    expect((await screen.findAllByText("Arcade Player")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("12,345").length).toBeGreaterThan(0);
    expect(screen.getAllByText("클리어").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0:10.0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
    expect(screen.queryByText("private-object-id")).not.toBeInTheDocument();
    expect(screen.queryByText("private@example.com")).not.toBeInTheDocument();
  });

  it("renders nothing and performs no query when disabled", () => {
    const list = vi.fn<LeaderboardApi["list"]>();
    const { container } = renderPage(createApi(list), false);
    expect(container).toBeEmptyDOMElement();
    expect(list).not.toHaveBeenCalled();
  });
});