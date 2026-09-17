import { describe, expect, it } from "vitest";

import { rescueCitizen, rescueRemainingCitizens } from "./rescue";

const CITIZEN_A = "00000000-0000-4000-8000-00000000000a";
const CITIZEN_B = "00000000-0000-4000-8000-00000000000b";
const CITIZEN_C = "00000000-0000-4000-8000-00000000000c";

describe("citizen rescue", () => {
  it("adds a citizen once and keeps duplicate rescue events idempotent", () => {
    const rescued = rescueCitizen([], CITIZEN_B);
    expect(rescued).toEqual([CITIZEN_B]);
    expect(rescueCitizen(rescued, CITIZEN_B)).toBe(rescued);
  });

  it("appends only remaining citizens in ascending id order", () => {
    expect(rescueRemainingCitizens([CITIZEN_B], [CITIZEN_C, CITIZEN_A, CITIZEN_B, CITIZEN_A])).toEqual([
      CITIZEN_B,
      CITIZEN_A,
      CITIZEN_C,
    ]);
  });
});