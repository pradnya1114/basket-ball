/**
 * OFFLINE leaderboard — 100% on-device.
 *
 * Every finished game is stored in localStorage as a history row keyed by a unique
 * `recordKey`, so a result is recorded exactly once even if a button is pressed twice
 * or the timer fires again. The Top 10 is derived from that history (best score per
 * player). No network request is ever made, so the board works with no internet.
 */
export interface LeaderEntry {
  name: string;
  score: number;
  shotsMade: number;
  accuracy: number;
  bestStreak: number;
  mode: string;
  playedAt?: string;
}

export interface SubmitPayload {
  recordKey: string;
  name: string;
  score: number;
  shotsMade: number;
  shotsTaken: number;
  accuracy: number;
  bestStreak: number;
  threes: number;
  durationSec: number;
}

interface HistoryRow extends SubmitPayload {
  playedAt: string;
}

const HISTORY_KEY = "air-basketball.history.v2";
const LEGACY_KEY = "air-basketball.leaderboard.v1";
const MAX_HISTORY = 500;

function readHistory(): HistoryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const rows = raw ? (JSON.parse(raw) as HistoryRow[]) : [];
    if (Array.isArray(rows) && rows.length) return rows;

    // one-time migration of boards saved by earlier versions
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    const legacy = legacyRaw ? (JSON.parse(legacyRaw) as LeaderEntry[]) : [];
    if (!Array.isArray(legacy) || legacy.length === 0) return [];
    const migrated: HistoryRow[] = legacy.map((e, i) => ({
      recordKey: `legacy-${i}-${e.name}`,
      name: e.name,
      score: Number(e.score) || 0,
      shotsMade: Number(e.shotsMade) || 0,
      shotsTaken: Number(e.shotsMade) || 0,
      accuracy: Number(e.accuracy) || 0,
      bestStreak: Number(e.bestStreak) || 0,
      threes: 0,
      durationSec: 60,
      playedAt: e.playedAt ?? new Date(0).toISOString(),
    }));
    writeHistory(migrated);
    return migrated;
  } catch {
    return [];
  }
}

function writeHistory(rows: HistoryRow[]) {
  if (typeof window === "undefined") return true;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(-MAX_HISTORY)));
    return true;
  } catch {
    return false; // storage full / private mode — game still continues
  }
}

/** Highest score per player; ties go to who reached it first, then alphabetical. */
export function consolidate(entries: LeaderEntry[]): LeaderEntry[] {
  const best = new Map<string, LeaderEntry>();
  for (const e of entries) {
    const key = e.name.trim().toLowerCase();
    if (!key) continue;
    const cur = best.get(key);
    if (
      !cur ||
      e.score > cur.score ||
      (e.score === cur.score && (e.playedAt ?? "") < (cur.playedAt ?? ""))
    ) {
      best.set(key, e);
    }
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.playedAt ?? "").localeCompare(b.playedAt ?? "") ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    )
    .slice(0, 10);
}

function toEntry(r: HistoryRow): LeaderEntry {
  return {
    name: r.name,
    score: r.score,
    shotsMade: r.shotsMade,
    accuracy: r.accuracy,
    bestStreak: r.bestStreak,
    mode: "single",
    playedAt: r.playedAt,
  };
}

export function readLeaderboard(): LeaderEntry[] {
  return consolidate(readHistory().map(toEntry));
}

/** Kept async so callers don't change, but it never touches the network. */
export async function fetchLeaderboard(): Promise<{ entries: LeaderEntry[]; source: "local" }> {
  return { entries: readLeaderboard(), source: "local" };
}

export function getPersonalBest(name: string): number {
  const key = name.trim().toLowerCase();
  return readHistory()
    .filter((r) => r.name.trim().toLowerCase() === key)
    .reduce((m, r) => Math.max(m, r.score), 0);
}

/** Records a finished game exactly once (idempotent on recordKey). */
export async function submitResult(
  payload: SubmitPayload,
): Promise<{ ok: boolean; rank: number; duplicate: boolean; entries: LeaderEntry[] }> {
  const rows = readHistory();
  const duplicate = rows.some((r) => r.recordKey === payload.recordKey);
  let ok = true;
  if (!duplicate) {
    rows.push({ ...payload, playedAt: new Date().toISOString() });
    ok = writeHistory(rows);
  }
  const entries = consolidate(rows.map(toEntry));
  const rank = entries.findIndex((e) => e.name.trim().toLowerCase() === payload.name.trim().toLowerCase()) + 1;
  return { ok, rank, duplicate, entries };
}

export function makeRecordKey(playerName: string, sessionId: string) {
  return `${sessionId}:${playerName.trim().toLowerCase()}`;
}

export async function clearLeaderboard(): Promise<{ ok: boolean; entries: LeaderEntry[] }> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(HISTORY_KEY);
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      return { ok: false, entries: readLeaderboard() };
    }
  }
  return { ok: true, entries: [] };
}

/** Full game history (for export). */
export function exportHistory() {
  return readHistory();
}

/** Download a JSON backup of the board — works offline (blob URL, no server). */
export function downloadSnapshot(payload: Record<string, unknown>, fileName = "air-basketball-data.json") {
  if (typeof document === "undefined") return false;
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}
