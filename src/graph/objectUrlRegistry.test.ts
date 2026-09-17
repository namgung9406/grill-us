import { afterEach, describe, expect, it, vi } from "vitest";

import { ObjectUrlRegistry } from "./objectUrlRegistry";

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("ObjectUrlRegistry", () => {
  it("각 URL을 한 번만 revoke한다", () => {
    const createObjectURL = vi.fn().mockReturnValueOnce("blob:one").mockReturnValueOnce("blob:two");
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const registry = new ObjectUrlRegistry();

    registry.create(new Blob());
    const second = registry.create(new Blob());
    registry.revoke(second);
    registry.release();
    registry.release();

    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith("blob:one");
    expect(revoke).toHaveBeenCalledWith("blob:two");
  });
});