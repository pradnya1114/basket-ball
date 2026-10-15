import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { gameResults } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * The table is normally created with `npx drizzle-kit push`, but a fresh/reset
 * database must never take the game down — so provision it on first use.
 */
const READY_KEY = "__airBbSchemaReady";
type GlobalWithFlag = typeof globalThis & { [READY_KEY]?: Promise<void> };

function ensureSchema(db: ReturnType<typeof getDb>): Promise<void> {
  const g = globalThis as GlobalWithFlag;
  if (!g[READY_KEY]) {
    g[READY_KEY] = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "air_bb_game_results" (
          "id" serial PRIMARY KEY,
          "record_key" text NOT NULL,
          "player_name" text NOT NULL,
          "mode" text NOT NULL,
          "score" integer NOT NULL,
          "shots_made" integer NOT NULL,
          "shots_taken" integer NOT NULL,
          "accuracy" real NOT NULL,
          "best_streak" integer NOT NULL,
          "threes" integer NOT NULL DEFAULT 0,
          "duration_sec" integer NOT NULL DEFAULT 60,
          "created_at" timestamptz NOT NULL DEFAULT now()
        )`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "air_bb_record_key_idx" ON "air_bb_game_results" ("record_key")`);
    })();
    // a transient DB failure must not be cached forever
    g[READY_KEY].catch(() => {
      delete g[READY_KEY];
    });
  }
  return g[READY_KEY];
}

type Entry = {
  name: string;
  score: number;
  shotsMade: number;
  accuracy: number;
  bestStreak: number;
  mode: string;
  playedAt: string;
};

/** Best (highest) score per player name, ties resolved by who reached it first. */
async function readTop10(db: ReturnType<typeof getDb>): Promise<Entry[]> {
  await ensureSchema(db);
  const rows = await db
    .select({
      playerName: gameResults.playerName,
      score: sql<number>`max(${gameResults.score})`,
      shotsMade: sql<number>`max(${gameResults.shotsMade})`,
      accuracy: sql<number>`max(${gameResults.accuracy})`,
      bestStreak: sql<number>`max(${gameResults.bestStreak})`,
      mode: sql<string>`max(${gameResults.mode})`,
      playedAt: sql<string>`max(${gameResults.createdAt})`,
    })
    .from(gameResults)
    .groupBy(gameResults.playerName)
    .orderBy(desc(sql`max(${gameResults.score})`), sql`min(${gameResults.createdAt})`)
    .limit(10);

  return rows.map((row) => ({
    name: row.playerName,
    score: Number(row.score),
    shotsMade: Number(row.shotsMade),
    accuracy: Number(row.accuracy),
    bestStreak: Number(row.bestStreak),
    mode: row.mode ?? "single",
    playedAt: String(row.playedAt),
  }));
}

export async function GET() {
  try {
    const db = getDb();
    return NextResponse.json({ ok: true, source: "database", entries: await readTop10(db) });
  } catch (error) {
    console.error("[leaderboard] read failed", error);
    return NextResponse.json({ ok: false, source: "fallback", entries: [] });
  }
}

/** Wipe the whole board (used by the "1 · RESET LEADERBOARD" control on the results page). */
export async function DELETE() {
  try {
    const db = getDb();
    await ensureSchema(db);
    await db.delete(gameResults);
    return NextResponse.json({ ok: true, cleared: true, entries: await readTop10(db) });
  } catch (error) {
    console.error("[leaderboard] clear failed", error);
    return NextResponse.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 24);
  const recordKey = String(body.recordKey ?? "").trim();
  if (!name || !recordKey) {
    return NextResponse.json({ ok: false, error: "name and recordKey are required" }, { status: 400 });
  }
  const num = (key: string, fallback = 0) => {
    const raw = Number(body[key]);
    return Number.isFinite(raw) ? raw : fallback;
  };
  const score = Math.max(0, Math.min(9999, Math.round(num("score"))));
  const shotsMade = Math.max(0, Math.min(9999, Math.round(num("shotsMade"))));
  const shotsTaken = Math.max(shotsMade, Math.min(9999, Math.round(num("shotsTaken"))));
  const accuracy = Math.max(0, Math.min(100, num("accuracy")));
  const bestStreak = Math.max(0, Math.min(9999, Math.round(num("bestStreak"))));
  const threes = Math.max(0, Math.min(9999, Math.round(num("threes"))));
  const mode = body.mode === "two" ? "two" : "single";
  const durationSec = Math.max(1, Math.min(3600, Math.round(num("durationSec", 60))));

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
    await ensureSchema(db);
  } catch (error) {
    console.error("[leaderboard] database unavailable", error);
    return NextResponse.json({ ok: false, error: "database unavailable", duplicate: false }, { status: 503 });
  }
  let duplicate = false;
  try {
    const inserted = await db
      .insert(gameResults)
      .values({
        recordKey,
        playerName: name,
        mode,
        score,
        shotsMade,
        shotsTaken,
        accuracy,
        bestStreak,
        threes,
        durationSec,
      })
      .onConflictDoNothing({ target: gameResults.recordKey })
      .returning({ id: gameResults.id });
    duplicate = inserted.length === 0;
  } catch (error) {
    console.error("[leaderboard] write failed", error);
    return NextResponse.json({ ok: false, error: "database unavailable", duplicate: false }, { status: 503 });
  }

  const entries = await readTop10(db).catch(() => [] as Entry[]);
  const rank = entries.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase()) + 1;
  return NextResponse.json({ ok: true, duplicate, rank: rank || entries.length + (score > 0 ? 1 : 0), entries });
}
