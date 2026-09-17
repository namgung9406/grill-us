import { describe, expect, it } from "vitest";

import { XorShift32 } from "./random";

describe("XorShift32", () => {
  it("같은 seed에서 같은 난수열을 만든다", () => {
    const first = new XorShift32(20260917);
    const second = new XorShift32(20260917);

    expect(Array.from({ length: 12 }, () => first.next())).toEqual(Array.from({ length: 12 }, () => second.next()));
  });

  it("저장한 state에서 다음 난수열을 이어간다", () => {
    const original = new XorShift32(42);
    original.next();
    original.next();
    const savedState = original.state();
    const expected = [original.next(), original.next(), original.next()];

    const restored = new XorShift32(savedState);
    expect([restored.next(), restored.next(), restored.next()]).toEqual(expected);
  });

  it("0 seed를 고정된 nonzero state로 바꾸고 양 끝을 포함한 정수를 만든다", () => {
    const zeroSeed = new XorShift32(0);
    const anotherZeroSeed = new XorShift32(0);

    expect(zeroSeed.state()).not.toBe(0);
    expect(zeroSeed.next()).toBe(anotherZeroSeed.next());
    const values = Array.from({ length: 100 }, () => zeroSeed.integer(-2, 2));
    expect(values.every((value) => Number.isInteger(value) && value >= -2 && value <= 2)).toBe(true);
  });
});