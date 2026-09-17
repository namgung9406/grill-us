import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthContextValue } from "@/auth/types";
import type { RunResult } from "@/games/dex-survivor/domain/types";
import { PendingResultStore } from "@/games/dex-survivor/persistence/PendingResultStore";
import type { LeaderboardEntry } from "@/shared/leaderboard";

import { LeaderboardApiError, type LeaderboardApi } from "./api";

const OWNER_ONE = "00000000-0000-4000-8000-000000000001";
const OWNER_TWO = "00000000-0000-4000-8000-000000000002";
let authValue: AuthContextValue;

vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => authValue }));

import { PendingResultSync } from "./PendingResultSync";
import { PendingResultsPanel } from "./PendingResultsPanel";

function createResult(ownerObjectId: string, suffix: string): RunResult {
  return {
    resultId: `00000000-0000-4000-8000-0000000000${suffix}`,
    ownerObjectId,
    outcome: "cleared",
    score: 15_000,
    normalElapsedMs: 90_000,
    totalActiveMs: 120_000,
    enemyKills: 30,
    hitCount: 1,
    bossTimesMs: [10_000, 20_000, 30_000],
    completedAtEpochMs: 1_800_000_000_000,
  };
}

function toEntry(result: RunResult): LeaderboardEntry {
  return {
    resultId: result.resultId,
    outcome: result.outcome,
    normalElapsedMs: result.normalElapsedMs,
    totalActiveMs: result.totalActiveMs,
    enemyKills: result.enemyKills,
    hitCount: result.hitCount,
    bossTimesMs: result.bossTimesMs,
    displayName: "Player",
    score: result.score,
    submittedAtMs: result.completedAtEpochMs,
  };
}

function createApi(submit: LeaderboardApi["submit"]): LeaderboardApi {
  return { list: () => Promise.resolve([]), submit };
}

describe("PendingResultSync", () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    authValue = {
      status: "authenticated",
      user: { objectId: OWNER_ONE, displayName: "Player", email: "private@example.com" },
      errorMessage: null,
      login: vi.fn(),
      logout: vi.fn(),
      acquireGraphToken: vi.fn(),
      acquireApiToken: vi.fn(),
      retry: vi.fn(),
    };
  });

  it("submits only the current account in FIFO order and removes successes", async () => {
    const store = new PendingResultStore(localStorage);
    const first = createResult(OWNER_ONE, "10");
    const second = createResult(OWNER_ONE, "11");
    const otherAccount = createResult(OWNER_TWO, "12");
    store.append(first);
    store.append(second);
    store.append(otherAccount);
    const submit = vi.fn<LeaderboardApi["submit"]>((item) => Promise.resolve(toEntry(item)));

    render(<PendingResultSync api={createApi(submit)} store={store} enabled />);

    await waitFor(() => expect(store.list(OWNER_ONE)).toEqual([]));
    expect(submit.mock.calls.map(([item]) => item.resultId)).toEqual([first.resultId, second.resultId]);
    expect(store.list(OWNER_TWO)).toEqual([otherAccount]);
  });

  it("aborts an in-flight request on account change without removing either account", async () => {
    const store = new PendingResultStore(localStorage);
    const first = createResult(OWNER_ONE, "20");
    const second = createResult(OWNER_TWO, "21");
    store.append(first);
    store.append(second);
    const requestSignals: AbortSignal[] = [];
    const submit = vi.fn<LeaderboardApi["submit"]>((_item, signal) => {
      if (signal !== undefined) {
        requestSignals.push(signal);
      }
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    const view = render(<PendingResultSync api={createApi(submit)} store={store} enabled />);
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());

    authValue = { ...authValue, user: { objectId: OWNER_TWO, displayName: "Other", email: null } };
    view.rerender(<PendingResultSync api={createApi(submit)} store={store} enabled />);

    await waitFor(() => expect(requestSignals[0]?.aborted).toBe(true));
    expect(store.list(OWNER_ONE)).toEqual([first]);
    expect(store.list(OWNER_TWO)).toEqual([second]);
  });

  it("retains validation failures and exposes an action-required state", async () => {
    const store = new PendingResultStore(localStorage);
    const result = createResult(OWNER_ONE, "30");
    store.append(result);
    const submit = vi.fn<LeaderboardApi["submit"]>(() => Promise.reject(
      new LeaderboardApiError(422, "VALIDATION_ERROR", null, "기록을 확인해주세요."),
    ));

    render(
      <>
        <PendingResultSync api={createApi(submit)} store={store} enabled />
        <PendingResultsPanel store={store} />
      </>,
    );

    expect(await screen.findByText(/조치 필요/)).toBeVisible();
    expect(screen.getByText("기록을 확인해주세요.")).toBeVisible();
    expect(store.list(OWNER_ONE)).toEqual([result]);
    expect(submit).toHaveBeenCalledOnce();
  });

  it("does not retry a rate-limited result before Retry-After", async () => {
    vi.useFakeTimers();
    const store = new PendingResultStore(localStorage);
    store.append(createResult(OWNER_ONE, "40"));
    const submit = vi.fn<LeaderboardApi["submit"]>(() => Promise.reject(
      new LeaderboardApiError(429, "RATE_LIMITED", 2, "잠시 기다려주세요."),
    ));
    render(<PendingResultSync api={createApi(submit)} store={store} enabled />);
    await act(async () => Promise.resolve());
    expect(submit).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTimeAsync(1_999));
    expect(submit).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(submit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("retries a retained network failure only after a manual request", async () => {
    const user = userEvent.setup();
    const store = new PendingResultStore(localStorage);
    const result = createResult(OWNER_ONE, "45");
    store.append(result);
    const submit = vi.fn<LeaderboardApi["submit"]>()
      .mockRejectedValueOnce(new TypeError("Network unavailable"))
      .mockResolvedValueOnce(toEntry(result));

    render(
      <>
        <PendingResultSync api={createApi(submit)} store={store} enabled />
        <PendingResultsPanel store={store} />
      </>,
    );

    expect(await screen.findByText("연결이 복구되면 다시 시도할 수 있습니다.")).toBeVisible();
    expect(store.list(OWNER_ONE)).toEqual([result]);
    expect(submit).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(store.list(OWNER_ONE)).toEqual([]));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("notifies a hook when another store instance appends for the same account", async () => {
    const observingStore = new PendingResultStore(localStorage);
    const writingStore = new PendingResultStore(localStorage);
    render(<PendingResultsPanel store={observingStore} />);
    expect(screen.queryByRole("heading", { name: "제출 대기 결과" })).not.toBeInTheDocument();

    act(() => {
      writingStore.append(createResult(OWNER_ONE, "46"));
    });

    expect(await screen.findByRole("heading", { name: "제출 대기 결과" })).toBeVisible();
  });

  it("makes no request while disabled", async () => {
    const store = new PendingResultStore(localStorage);
    store.append(createResult(OWNER_ONE, "50"));
    const submit = vi.fn<LeaderboardApi["submit"]>();

    render(<PendingResultSync api={createApi(submit)} store={store} enabled={false} />);
    await act(async () => Promise.resolve());

    expect(submit).not.toHaveBeenCalled();
    expect(store.list(OWNER_ONE)).toHaveLength(1);
  });
});