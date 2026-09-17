import { describe, expect, it } from "vitest";

import { selectCitizenCandidates } from "./selectCandidates";
import type { DirectoryUser } from "./types";

const users: DirectoryUser[] = Array.from({ length: 8 }, (_, index) => ({
  id: `user-${index}`,
  displayName: `사용자 ${index}`,
  accountEnabled: true,
  userType: "Member",
}));

describe("selectCitizenCandidates", () => {
  it("preferred 순서를 보존하고 중복을 제거한다", () => {
    const selected = selectCitizenCandidates(users, ["user-3", "user-1", "user-3"], 42);
    expect(selected.slice(0, 2).map((user) => user.id)).toEqual(["user-3", "user-1"]);
    expect(new Set(selected.map((user) => user.id))).toHaveLength(users.length);
  });

  it("같은 seed에서 같은 순서를 반환한다", () => {
    expect(selectCitizenCandidates(users, [], 123)).toEqual(selectCitizenCandidates(users, [], 123));
    expect(selectCitizenCandidates(users, [], 123)).not.toEqual(selectCitizenCandidates(users, [], 456));
  });
});