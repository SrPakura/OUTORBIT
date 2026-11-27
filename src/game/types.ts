// ============================================================================
// LEADERBOARD EN BASE44
// ============================================================================

export interface LeaderboardEntryRecord {
  id?: string;
  player_name: string;
  clear_time_sec: number;
  score: number;
  dominant_style: string;
  stealth_pct: number;
  aggression_pct: number;
  aerial_pct: number;
  subterranean_pct: number;
  stasis_pct: number;
  alarms_triggered: number;
  created_date?: string;
}
