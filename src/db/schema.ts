import { integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Persistent, cross-device leaderboard for AIR BASKETBALL.
 * Each row is one completed game result (a player may appear several times,
 * the leaderboard view aggregates the highest score per player name).
 */
export const gameResults = pgTable(
  "air_bb_game_results",
  {
    id: serial("id").primaryKey(),
    /** Client generated key used to guarantee a result is recorded exactly once. */
    recordKey: text("record_key").notNull(),
    playerName: text("player_name").notNull(),
    mode: text("mode").notNull(),
    score: integer("score").notNull(),
    shotsMade: integer("shots_made").notNull(),
    shotsTaken: integer("shots_taken").notNull(),
    accuracy: real("accuracy").notNull(),
    bestStreak: integer("best_streak").notNull(),
    threes: integer("threes").notNull().default(0),
    durationSec: integer("duration_sec").notNull().default(60),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("air_bb_record_key_idx").on(table.recordKey)],
);
