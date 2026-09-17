import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { migrate } from "./migrate";
import { openDatabase } from "./openDatabase";

const pragmaValueSchema = z.array(z.object({ user_version: z.number().int() })).length(1);
const tableInfoSchema = z.array(z.object({ name: z.string(), notnull: z.number().int() }));
const indexListSchema = z.array(z.object({ name: z.string(), unique: z.number().int() }));
const indexInfoSchema = z.array(z.object({ name: z.string() }));

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("openDatabase", () => {
  it("enables WAL, foreign keys, and a five-second busy timeout", () => {
    const directory = mkdtempSync(join(tmpdir(), "grill-us-leaderboard-"));
    temporaryDirectories.push(directory);
    const database = openDatabase(join(directory, "nested", "leaderboard.sqlite"));

    try {
      expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(database.pragma("busy_timeout", { simple: true })).toBe(5_000);
    } finally {
      database.close();
    }
  });
});

describe("migrate", () => {
  it("creates version 1 tables and deterministic indexes idempotently", () => {
    const database = new Database(":memory:");
    try {
      migrate(database);
      migrate(database);

      expect(pragmaValueSchema.parse(database.pragma("user_version"))[0]?.user_version).toBe(1);
      const resultColumns = tableInfoSchema.parse(database.pragma("table_info(leaderboard_results)"));
      expect(resultColumns.map((column) => column.name)).toEqual([
        "result_id",
        "user_oid",
        "display_name",
        "outcome",
        "score",
        "normal_elapsed_ms",
        "total_active_ms",
        "enemy_kills",
        "hit_count",
        "boss1_ms",
        "boss2_ms",
        "boss3_ms",
        "boss_time_sort_ms",
        "submitted_at_ms",
      ]);
      expect(resultColumns.filter((column) => ["boss1_ms", "boss2_ms", "boss3_ms"].includes(column.name)).map((column) => column.notnull)).toEqual([0, 0, 0]);

      const resultIndexes = indexListSchema.parse(database.pragma("index_list(leaderboard_results)"));
      expect(resultIndexes.map((index) => index.name)).toContain("idx_leaderboard_results_ranking");
      expect(indexInfoSchema.parse(database.pragma("index_info(idx_leaderboard_results_ranking)")).map((column) => column.name)).toEqual([
        "score",
        "boss_time_sort_ms",
        "submitted_at_ms",
        "result_id",
      ]);
      expect(indexListSchema.parse(database.pragma("index_list(submission_attempts)")).map((index) => index.name)).toContain("idx_submission_attempts_user_time");
    } finally {
      database.close();
    }
  });

  it("rolls back schema creation when a migration statement fails", () => {
    const database = new Database(":memory:");
    try {
      database.exec("CREATE TABLE submission_attempts (id INTEGER PRIMARY KEY)");
      expect(() => migrate(database)).toThrow();
      expect(pragmaValueSchema.parse(database.pragma("user_version"))[0]?.user_version).toBe(0);
      expect(database.prepare<[string], { count: number }>("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?").get("leaderboard_results")?.count).toBe(0);
    } finally {
      database.close();
    }
  });
});