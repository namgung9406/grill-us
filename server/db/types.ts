export interface LeaderboardRow {
  result_id: string;
  user_oid: string;
  display_name: string;
  outcome: "cleared" | "defeated";
  score: number;
  normal_elapsed_ms: number;
  total_active_ms: number;
  enemy_kills: number;
  hit_count: number;
  boss1_ms: number | null;
  boss2_ms: number | null;
  boss3_ms: number | null;
  boss_time_sort_ms: number;
  submitted_at_ms: number;
}

export interface InsertResult {
  row: LeaderboardRow;
  inserted: boolean;
}