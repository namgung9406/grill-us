import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunResult } from "../domain/types";
import { PendingResultStore } from "./PendingResultStore";
import { pendingResultsKey } from "./keys";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";

function createResult(resultId = "00000000-0000-4000-8000-000000000010"): RunResult {
  return {
    resultId,
    ownerObjectId: OWNER_ID,
    outcome: "cleared",
    score: 15_000,
    normalElapsedMs: 900_000,
    totalActiveMs: 1_100_000,
    enemyKills: 50,
    hitCount: 2,
    bossTimesMs: [100_000, 150_000, 250_000],
    completedAtEpochMs: 1_800_000_000_000,
  };
}

describe("PendingResultStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("retains results and ignores duplicate result IDs idempotently", () => {
    const store = new PendingResultStore(localStorage);
    const result = createResult();

    expect(store.append(result)).toEqual({ ok: true });
    expect(store.append(result)).toEqual({ ok: true });
    expect(store.list(OWNER_ID)).toEqual([result]);

    const reloaded = new PendingResultStore(localStorage);
    expect(reloaded.list(OWNER_ID)).toEqual([result]);
  });

  it("removes only the selected result after explicit acknowledgement", () => {
    const store = new PendingResultStore(localStorage);
    const first = createResult();
    const second = createResult("00000000-0000-4000-8000-000000000011");
    store.append(first);
    store.append(second);

    store.remove(OWNER_ID, first.resultId);
    expect(store.list(OWNER_ID)).toEqual([second]);
  });

  it("rejects invalid persisted queues without silently replacing them", () => {
    const store = new PendingResultStore(localStorage);
    localStorage.setItem(pendingResultsKey(OWNER_ID), JSON.stringify([{ ...createResult(), rescuedCount: 1 }]));

    expect(store.list(OWNER_ID)).toEqual([]);
    expect(store.append(createResult())).toEqual({ ok: false, reason: "invalid" });
    expect(localStorage.getItem(pendingResultsKey(OWNER_ID))).toContain("rescuedCount");
  });
});