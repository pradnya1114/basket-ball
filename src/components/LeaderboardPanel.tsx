"use client";
import type { LeaderEntry } from "@/lib/leaderboard";
import { IconHoop } from "./ui";

interface Props {
  entries: LeaderEntry[];
  currentNames: string[];
  loading?: boolean;
  source?: "local" | "loading";
  dense?: boolean;
}

const MEDALS = ["#ffd166", "#d7e3f4", "#e08a4a"];

export function LeaderboardPanel({ entries, currentNames, loading = false, dense = false }: Props) {
  const names = currentNames.map((n) => n.trim().toLowerCase()).filter(Boolean);
  return (
    <aside
      className={`flex h-full flex-col overflow-hidden rounded-3xl border border-amber-300/20 bg-[linear-gradient(180deg,rgba(10,22,42,0.96),rgba(3,8,16,0.98))] shadow-[0_30px_70px_-40px_rgba(0,0,0,1)] ${
        dense ? "" : ""
      }`}
    >
      <header className={`relative border-b border-amber-300/20 bg-[linear-gradient(180deg,rgba(255,159,28,0.22),rgba(255,159,28,0))] ${dense ? "px-3 pb-2 pt-2" : "px-4 pb-3 pt-4"}`}>
        <div className="flex items-center gap-2">
          <IconHoop className={`${dense ? "h-5 w-5" : "h-6 w-6"} shrink-0 text-amber-300`} />
          <h2 className={`${dense ? "text-lg sm:text-xl" : "text-2xl"} font-black uppercase leading-none tracking-[0.1em] text-amber-200`}>
            Top 10 Players
          </h2>
        </div>
        <p className={`${dense ? "mt-0.5 text-[9px]" : "mt-1 text-[11px]"} font-bold uppercase tracking-[0.16em] text-sky-200/50`}>
          Highest score per player · saved on this device
        </p>
      </header>

      <div className={`min-h-0 flex-1 ${dense ? "flex flex-col overflow-hidden px-2 py-1.5" : "overflow-y-auto px-3 py-3"}`}>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-8 text-center">
            <div className="text-5xl">🏀</div>
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
              No scores yet
            </p>
            <p className="mt-1 text-xs text-slate-500">Sink a few baskets to open the board.</p>
          </div>
        ) : (
          <ol className={dense ? "grid grid-cols-2 gap-1.5 md:flex md:flex-col" : "space-y-2"}>
            {entries.map((e, i) => {
              const isMe = names.includes(e.name.trim().toLowerCase());
              return (
                <li
                  key={`${e.name}-${i}`}
                  className={`relative flex min-w-0 items-center gap-2 rounded-xl border px-2 ${dense ? "py-0.5" : "py-2"} transition-colors ${
                    isMe
                      ? "border-amber-300/70 bg-[linear-gradient(90deg,rgba(255,159,28,0.28),rgba(255,159,28,0.05))]"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                  }`}
                >
                  <span
                    className={`flex ${dense ? "h-6 w-6" : "h-8 w-8"} shrink-0 items-center justify-center rounded-lg text-sm font-black tabular-nums`}
                    style={{
                      background: MEDALS[i] ?? "rgba(255,255,255,0.08)",
                      color: MEDALS[i] ? "#08111f" : "rgba(226,240,255,0.8)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${dense ? "text-xs sm:text-sm" : "text-lg"} font-black uppercase leading-tight tracking-wide text-white`}>
                      {e.name}
                    </span>
                    {!dense ? (
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/50">
                        {e.shotsMade} made · {Math.round(e.accuracy)}% · run {e.bestStreak}
                      </span>
                    ) : null}
                  </span>
                  <span className={`${dense ? "text-lg" : "text-3xl"} font-black tabular-nums ${isMe ? "text-amber-300" : "text-sky-100/90"}`}>
                    {e.score}
                  </span>
                  {isMe ? (
                    <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-900">
                      you
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
