import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameSaveV1 } from "../domain/types";
import { AutoSaveController } from "./AutoSaveController";

const snapshot = {
  version: 1,
  gameId: "dex-survivor",
  ownerObjectId: "00000000-0000-4000-8000-000000000001",
} as GameSaveV1;

describe("AutoSaveController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("coalesces dirty updates into one write after 500ms", () => {
    const write = vi.fn(() => ({ ok: true } as const));
    const controller = new AutoSaveController({ exportSnapshot: () => snapshot, write });

    controller.markDirty();
    controller.markDirty();
    vi.advanceTimersByTime(499);
    expect(write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(snapshot);
  });

  it("flushes dirty state synchronously and does not duplicate the scheduled write", () => {
    const write = vi.fn(() => ({ ok: true } as const));
    const controller = new AutoSaveController({ exportSnapshot: () => snapshot, write });

    controller.markDirty();
    expect(controller.flush()).toEqual({ ok: true });
    expect(write).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(500);
    expect(write).toHaveBeenCalledOnce();
  });

  it("reports failures without throwing and keeps the snapshot dirty for retry", () => {
    const write = vi
      .fn()
      .mockReturnValueOnce({ ok: false, reason: "quota" } as const)
      .mockReturnValueOnce({ ok: true } as const);
    const onResult = vi.fn();
    const controller = new AutoSaveController({ exportSnapshot: () => snapshot, write, onResult });

    controller.markDirty();
    expect(() => controller.flush()).not.toThrow();
    expect(onResult).toHaveBeenCalledWith({ ok: false, reason: "quota" });
    expect(controller.flush()).toEqual({ ok: true });
  });
});