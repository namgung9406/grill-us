import type Database from "better-sqlite3";

const CURRENT_SCHEMA_VERSION = 1;

function readSchemaVersion(database: Database.Database): number {
  const version = database.pragma("user_version", { simple: true });
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error("SQLite returned an invalid user_version.");
  }
  return version;
}

export function migrate(database: Database.Database): void {
  const currentVersion = readSchemaVersion(database);
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported leaderboard database version: ${currentVersion}`);
  }
  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    return;
  }

  database.transaction(() => {
    database.exec(`
      CREATE TABLE leaderboard_results (
        result_id TEXT PRIMARY KEY,
        user_oid TEXT NOT NULL,
        display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 200),
        outcome TEXT NOT NULL CHECK(outcome IN ('cleared', 'defeated')),
        score INTEGER NOT NULL,
        normal_elapsed_ms INTEGER NOT NULL,
        total_active_ms INTEGER NOT NULL,
        enemy_kills INTEGER NOT NULL,
        hit_count INTEGER NOT NULL,
        boss1_ms INTEGER NULL,
        boss2_ms INTEGER NULL,
        boss3_ms INTEGER NULL,
        boss_time_sort_ms INTEGER NOT NULL,
        submitted_at_ms INTEGER NOT NULL
      );

      CREATE INDEX idx_leaderboard_results_ranking
        ON leaderboard_results (
          score DESC,
          boss_time_sort_ms ASC,
          submitted_at_ms ASC,
          result_id ASC
        );

      CREATE TABLE submission_attempts (
        id INTEGER PRIMARY KEY,
        user_oid TEXT NOT NULL,
        attempted_at_ms INTEGER NOT NULL
      );

      CREATE INDEX idx_submission_attempts_user_time
        ON submission_attempts (user_oid, attempted_at_ms);
    `);
    database.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
  })();
}