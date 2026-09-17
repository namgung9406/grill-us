import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrate } from "./migrate";
import { LeaderboardRepository } from "./LeaderboardRepository";
import type { LeaderboardRow } from "./types";

function createRow(overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
  return {
    result_id: "00000000-0000-4000-8000-000000000001",
    user_oid: "user-1",
    display_name: "Player One",
    outcome: "defeated",
    score: 1_000,
    normal_elapsed_ms: 0,
    total_active_ms: 5_000,
    enemy_kills: 10,
    hit_count: 0,
    boss1_ms: null,
    boss2_ms: null,
    boss3_ms: null,
    boss_time_sort_ms: 600_000,
    submitted_at_ms: 1_000,
    ...overrides,
  };
}

describe("LeaderboardRepository", () => {
  let database: Database.Database;
  let repository: LeaderboardRepository;

  beforeEach(() => {
    database = new Database(":memory:");
    migrate(database);
    repository = new LeaderboardRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  it("returns the existing row without creating a duplicate result", () => {
    const original = createRow();
    expect(repository.insertOrGet(original)).toEqual({ row: original, inserted: true });

    const duplicate = repository.insertOrGet({ ...original, display_name: "Renamed Player" });
    expect(duplicate).toEqual({ row: original, inserted: false });
    expect(database.prepare("SELECT COUNT(*) AS count FROM leaderboard_results").get()).toEqual({ count: 1 });
  });

  it("sorts ties by boss penalty, boss time, submission time, and result ID", () => {
    const rows = [
      createRow({ result_id: "00000000-0000-4000-8000-000000000005", boss1_ms: null, boss_time_sort_ms: 600_000 }),
      createRow({ result_id: "00000000-0000-4000-8000-000000000004", boss1_ms: 100_000, boss_time_sort_ms: 580_000 }),
      createRow({ result_id: "00000000-0000-4000-8000-000000000003", boss1_ms: 90_000, boss_time_sort_ms: 570_000, submitted_at_ms: 2_000 }),
      createRow({ result_id: "00000000-0000-4000-8000-000000000002", boss1_ms: 90_000, boss_time_sort_ms: 570_000 }),
      createRow({ result_id: "00000000-0000-4000-8000-000000000001", boss1_ms: 90_000, boss_time_sort_ms: 570_000 }),
    ];
    rows.forEach((row) => repository.insertOrGet(row));

    expect(repository.listTop(10).map((row) => row.result_id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
    ]);
  });

  it("keeps persisted attempts visible to a new repository instance", () => {
    repository.recordAttempt("user-1", 1_000);
    repository = new LeaderboardRepository(database);
    expect(repository.countAttempts("user-1", 0)).toBe(1);
  });
});