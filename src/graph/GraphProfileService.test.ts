import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GraphProfileService } from "./GraphProfileService";
import type { GraphAdapter } from "./types";

const player = { objectId: "player", displayName: "플레이어", email: "player@example.com" };
const createObjectUrl = vi.fn<(blob: Blob) => string>();
const revokeObjectUrl = vi.fn<(objectUrl: string) => void>();

function graphUser(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `사용자 ${id}`,
    accountEnabled: true,
    userType: "Member",
    ...overrides,
  };
}

function statusError(statusCode: number, retryAfter?: string): Error {
  const headers = new Headers();
  if (retryAfter !== undefined) {
    headers.set("Retry-After", retryAfter);
  }
  return Object.assign(new Error(`Graph ${statusCode}`), { statusCode, headers });
}

beforeEach(() => {
  let sequence = 0;
  createObjectUrl.mockReset();
  createObjectUrl.mockImplementation(() => `blob:test-${sequence++}`);
  revokeObjectUrl.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
  vi.restoreAllMocks();
});

describe("GraphProfileService", () => {
  it("페이지를 순회해 활성 Member 사진만 최대 9명 준비하고 release한다", async () => {
    const users = Array.from({ length: 12 }, (_, index) => graphUser(`member-${index}`));
    const getJson = vi.fn((path: string): Promise<unknown> => {
      if (path === "/users?$select=id,displayName,accountEnabled,userType&$top=100") {
        return Promise.resolve({
          value: [
            graphUser("player"),
            graphUser("disabled", { accountEnabled: false }),
            graphUser("guest", { userType: "Guest" }),
            ...users.slice(0, 6),
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?page=2",
        });
      }
      return Promise.resolve({ value: users.slice(6) });
    });
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const getBlob = vi.fn(async () => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      return new Blob(["photo"]);
    });
    const service = new GraphProfileService({ getJson, getBlob }, { seedFactory: () => 7 });

    const assets = await service.prepare({ player, signal: new AbortController().signal });

    expect(assets.player.kind).toBe("photo");
    expect(assets.citizens).toHaveLength(9);
    expect(assets.citizens.some((asset) => asset.userId === "player")).toBe(false);
    expect(maxActiveRequests).toBeLessThanOrEqual(4);
    assets.release();
    assets.release();
    const createdCount = createObjectUrl.mock.calls.length;
    const revokedUrls = revokeObjectUrl.mock.calls.map(([objectUrl]) => objectUrl);
    expect(revokedUrls).toHaveLength(createdCount);
    expect(new Set(revokedUrls)).toHaveLength(createdCount);
  });

  it("preferred 순서를 우선하고 본인 사진 실패는 helmet으로 대체한다", async () => {
    const getJson = vi.fn((path: string): Promise<unknown> => {
      if (path.startsWith("/users/preferred")) {
        return Promise.resolve(graphUser("preferred"));
      }
      return Promise.resolve({ value: [graphUser("other")] });
    });
    const getBlob = vi.fn((path: string): Promise<Blob> => {
      if (path.startsWith("/me/")) {
        return Promise.reject(statusError(404));
      }
      return Promise.resolve(new Blob(["photo"]));
    });
    const service = new GraphProfileService({ getJson, getBlob }, { seedFactory: () => 1 });

    const assets = await service.prepare({
      player,
      preferredCitizenIds: ["preferred"],
      signal: new AbortController().signal,
    });

    expect(assets.player).toMatchObject({ kind: "helmet", objectUrl: null });
    expect(assets.citizens[0]?.userId).toBe("preferred");
  });

  it("사진 없는 시민을 제외하고 후보 확인을 200명으로 제한한다", async () => {
    const getJson = vi.fn().mockResolvedValue({
      value: Array.from({ length: 250 }, (_, index) => graphUser(`member-${index}`)),
    });
    const getBlob = vi.fn((path: string): Promise<Blob> => {
      if (path.startsWith("/me/")) {
        return Promise.resolve(new Blob(["player"]));
      }
      return Promise.reject(statusError(404));
    });
    const service = new GraphProfileService({ getJson, getBlob });

    const assets = await service.prepare({ player, signal: new AbortController().signal });

    expect(assets.citizens).toEqual([]);
    expect(getBlob).toHaveBeenCalledTimes(201);
  });

  it("5xx 사진 요청은 최대 두 번 재시도하고 403은 즉시 제외한다", async () => {
    const getJson = vi.fn().mockResolvedValue({ value: [graphUser("retry"), graphUser("forbidden")] });
    const attempts = new Map<string, number>();
    const getBlob = vi.fn((path: string): Promise<Blob> => {
      if (path.startsWith("/me/")) {
        return Promise.resolve(new Blob(["player"]));
      }
      const attempt = (attempts.get(path) ?? 0) + 1;
      attempts.set(path, attempt);
      if (path.includes("forbidden")) {
        return Promise.reject(statusError(403));
      }
      if (attempt < 3) {
        return Promise.reject(statusError(500));
      }
      return Promise.resolve(new Blob(["citizen"]));
    });
    const sleeper = vi.fn().mockResolvedValue(undefined);
    const service = new GraphProfileService({ getJson, getBlob }, { sleeper, seedFactory: () => 0 });

    const assets = await service.prepare({ player, signal: new AbortController().signal });

    expect(assets.citizens).toHaveLength(1);
    expect([...attempts.values()].sort()).toEqual([1, 3]);
    expect(sleeper).toHaveBeenCalledTimes(2);
  });

  it("취소되면 이미 생성한 object URL을 회수한다", async () => {
    const controller = new AbortController();
    const adapter: GraphAdapter = {
      getJson: vi.fn().mockResolvedValue({ value: [graphUser("citizen")] }),
      getBlob: vi.fn((path: string): Promise<Blob> => {
        if (path.startsWith("/me/")) {
          return Promise.resolve(new Blob(["player"]));
        }
        const abortError = new DOMException("요청이 취소되었습니다.", "AbortError");
        controller.abort(abortError);
        return Promise.reject(abortError);
      }),
    };
    const service = new GraphProfileService(adapter);

    await expect(service.prepare({ player, signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });
});