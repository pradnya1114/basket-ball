/** AIR BASKETBALL is a single-player game: one player, one 60 second run. */
export type GameMode = "single";
export type Page = "welcome" | "rules" | "game" | "results";

export interface Session {
  mode: GameMode;
  /** always exactly one player */
  players: [string];
  /** stable id for one run, used to record the result exactly once */
  sessionId: string;
}

export interface PlayerResult {
  name: string;
  score: number;
  shotsMade: number;
  shotsTaken: number;
  accuracy: number;
  bestStreak: number;
  threes: number;
  durationSec: number;
  rank: number;
}

export interface MatchResult {
  mode: GameMode;
  player: PlayerResult;
  /** previous personal best before this run (0 if first game) */
  previousBest: number;
  isNewBest: boolean;
  playedAt: number;
}

export function newSessionId() {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function accuracyOf(made: number, taken: number) {
  return taken > 0 ? (made / taken) * 100 : 0;
}
