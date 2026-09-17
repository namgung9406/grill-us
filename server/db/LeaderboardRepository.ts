import type Database from "better-sqlite3";

import type { InsertResult, LeaderboardRow } from "./types";

interface AttemptCountRow {
  count: number;
}

export class LeaderboardRepository {
  private readonly findResultStatement: Database.Statement<[string], LeaderboardRow>;
  private readonly insertResultStatement: Database.Statement<LeaderboardRow>;
  private readonly listTopStatement: Database.Statement<[number], LeaderboardRow>;
  private readonly insertAttemptStatement: Database.Statement<[string, number]>;
  private readonly deleteAttemptsStatement: Database.Statement<[number]>;
  private readonly countAttemptsStatement: Database.Statement<[string, number], AttemptCountRow>;

  public constructor(database: Database.Database) {
    this.findResultStatement = database.prepare<[string], LeaderboardRow>(`
      SELECT * FROM leaderboard_results WHERE result_id = ?
    `);
    this.insertResultStatement = database.prepare<LeaderboardRow>(`
      INSERT OR IGNORE INTO leaderboard_results (
        result_id, user_oid, display_name, outcome, score, normal_elapsed_ms,
        total_active_ms, enemy_kills, hit_count, boss1_ms, boss2_ms, boss3_ms,
        boss_time_sort_ms, submitted_at_ms
      ) VALUES (
        @result_id, @user_oid, @display_name, @outcome, @score, @normal_elapsed_ms,
        @total_active_ms, @enemy_kills, @hit_count, @boss1_ms, @boss2_ms, @boss3_ms,
        @boss_time_sort_ms, @submitted_at_ms
      )
    `);
    this.listTopStatement = database.prepare<[number], LeaderboardRow>(`
      SELECT * FROM leaderboard_results
      ORDER BY score DESC, boss_time_sort_ms ASC, submitted_at_ms ASC, result_id ASC
      LIMIT ?
    `);
    this.insertAttemptStatement = database.prepare<[string, number]>(`
      INSERT INTO submission_attempts (user_oid, attempted_at_ms) VALUES (?, ?)
    `);
    this.deleteAttemptsStatement = database.prepare<[number]>(`
      DELETE FROM submission_attempts WHERE attempted_at_ms < ?
    `);
    this.countAttemptsStatement = database.prepare<[string, number], AttemptCountRow>(`
      SELECT COUNT(*) AS count
      FROM submission_attempts
      WHERE user_oid = ? AND attempted_at_ms >= ?
    `);
  }

  public findByResultId(resultId: string): LeaderboardRow | null {
    return this.findResultStatement.get(resultId) ?? null;
  }

  public insertOrGet(row: LeaderboardRow): InsertResult {
    const result = this.insertResultStatement.run(row);
    const storedRow = this.findByResultId(row.result_id);
    if (storedRow === null) {
      throw new Error("The leaderboard result was not persisted.");
    }
    return { row: storedRow, inserted: result.changes === 1 };
  }

  public listTop(limit: number): readonly LeaderboardRow[] {
    return this.listTopStatement.all(limit);
  }

  public recordAttempt(userOid: string, attemptedAtMs: number): void {
    this.insertAttemptStatement.run(userOid, attemptedAtMs);
  }

  public deleteAttemptsBefore(cutoffMs: number): number {
    return this.deleteAttemptsStatement.run(cutoffMs).changes;
  }

  public countAttempts(userOid: string, sinceMs: number): number {
    return this.countAttemptsStatement.get(userOid, sinceMs)?.count ?? 0;
  }
}