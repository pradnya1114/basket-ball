"use client";
import { useEffect, useState } from "react";
import { ArenaBackdrop } from "./ArenaBackdrop";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { OfflineBadge } from "./WelcomePage";
import { ArcadeButton, IconBall, Panel } from "./ui";
import type { MatchResult, PlayerResult } from "@/lib/types";
import type { LeaderEntry } from "@/lib/leaderboard";
import type { OfflineState } from "@/hooks/useOffline";

interface Props {
  match: MatchResult;
  entries: LeaderEntry[];
  saveError: string | null;
  notice: string | null;
  offline: OfflineState;
  onNoticeDismiss: () => void;
  onResetBoard: () => void;
  onSaveData: () => void;
  onRestart: () => void;
  onPlayAgain: () => void;
  onChangePlayer: () => void;
  onHowTo: () => void;
}

function praiseFor(r: PlayerResult, isNewBest: boolean) {
  if (isNewBest) return { title: "New high score!", cls: "text-amber-300" };
  if (r.score >= 26) return { title: "Court champion!", cls: "text-amber-300" };
  if (r.score >= 14) return { title: "Amazing shots!", cls: "text-emerald-300" };
  if (r.score >= 6) return { title: "Nice shooting!", cls: "text-sky-300" };
  if (r.shotsTaken > 0) return { title: "Keep practising!", cls: "text-slate-100" };
  return { title: "Go get that first basket!", cls: "text-slate-100" };
}

const CONFETTI = Array.from({ length: 44 }).map((_, i) => ({
  left: (i * 2.27) % 100,
  delay: (i % 11) * 0.24,
  dur: 3.4 + ((i * 7) % 9) * 0.45,
  size: 6 + ((i * 5) % 8),
  color: ["#ffd166", "#ff8a2b", "#7de8b0", "#38bdf8", "#ffffff"][i % 5],
  drift: `${((i % 9) - 4) * 2.2}vw`,
}));

/** Page 4 — final score, stats and the Top 10 board (all stored on this device). */
export function ResultsPage({
  match,
  entries,
  saveError,
  notice,
  offline,
  onNoticeDismiss,
  onResetBoard,
  onSaveData,
  onRestart,
  onPlayAgain,
  onChangePlayer,
  onHowTo,
}: Props) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const p = match.player;
  const praise = praiseFor(p, match.isNewBest);
  const celebrate = match.isNewBest || p.rank === 1;

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      onPlayAgain();
      return;
    }
    const id = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 800);
    return () => window.clearTimeout(id);
  }, [countdown, onPlayAgain]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
        e.preventDefault();
        onSaveData();
      } else if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
        e.preventDefault();
        if (window.confirm("Clear the whole leaderboard on this device? This cannot be undone.")) {
          onResetBoard();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSaveData, onResetBoard]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ArenaBackdrop dim={!celebrate} />
      {celebrate ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="confetti absolute block rounded-[2px]"
              style={{
                left: `${c.left}%`,
                top: "-6vh",
                width: c.size,
                height: c.size * 2.2,
                background: c.color,
                animationDuration: `${c.dur}s`,
                animationDelay: `${c.delay}s`,
                ["--drift" as string]: c.drift,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="relative mx-auto flex h-full w-full max-w-[1380px] flex-col gap-3 overflow-hidden px-4 pb-3 pt-[clamp(84px,12vh,112px)] sm:px-5 xl:px-8">
        <header className="shrink-0">
          <div className="mb-1 flex justify-end text-[9px] font-black uppercase tracking-[0.2em] text-sky-200/60 sm:text-[10px]">
            <OfflineBadge offline={offline} />
          </div>
          <div className="text-center">
            <h1 className={`title-glow text-[clamp(1.8rem,5.8vh,4.5rem)] font-black uppercase leading-[0.92] tracking-[0.02em] ${praise.cls}`}>
              {praise.title}
            </h1>
            <p className="mt-1 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 sm:text-[11px]">
            <IconBall className="ball-bounce h-4 w-4 text-amber-400" />
            {saveError ?? "Score saved on this device"}
            </p>
          </div>
        </header>

        {notice ? (
          <div className="pop-in mx-auto flex w-full max-w-[900px] shrink-0 items-center gap-3 rounded-2xl border border-sky-300/45 bg-sky-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-100">
            <span className="flex-1">{notice}</span>
            <button
              onClick={onNoticeDismiss}
              className="rounded-lg border border-white/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] hover:bg-white/10"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-rows-[0.95fr_1.05fr] gap-3 lg:grid-cols-[1.5fr_1fr] lg:grid-rows-1">
          {/* score card */}
          <Panel glow className="flex min-h-0 flex-col overflow-hidden p-3 sm:p-4 lg:p-5">
            <div className="flex min-h-0 flex-wrap items-center justify-between gap-2 sm:gap-4">
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-300/80">Final score</div>
                <div className="title-glow text-[clamp(2.8rem,9vh,6.5rem)] font-black leading-[0.82] tabular-nums text-white">
                  {p.score}
                </div>
                <div className="mt-1 truncate text-[clamp(1rem,2.8vh,1.8rem)] font-black uppercase tracking-[0.06em] text-amber-200">
                  {p.name}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl border border-white/10 bg-black/35 px-2 py-1.5 text-center sm:px-3">
                  <div className="text-[8px] font-black uppercase tracking-[0.12em] text-sky-200/60 sm:text-[9px]">Rank</div>
                  <div className="text-2xl font-black tabular-nums text-amber-300 sm:text-3xl">{p.rank ? `#${p.rank}` : "—"}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 px-2 py-1.5 text-center sm:px-3">
                  <div className="text-[8px] font-black uppercase tracking-[0.12em] text-sky-200/60 sm:text-[9px]">Best</div>
                  <div className="text-xl font-black tabular-nums text-white sm:text-2xl">
                    {Math.max(match.previousBest, p.score)}
                    {match.isNewBest && match.previousBest > 0 ? (
                      <span className="ml-2 text-sm text-emerald-300">+{p.score - match.previousBest}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-1.5 sm:mt-3 sm:grid-cols-3 xl:grid-cols-6">
              <Metric k="Baskets" v={`${p.shotsMade}`} tone="good" />
              <Metric k="Attempts" v={`${p.shotsTaken}`} />
              <Metric k="Accuracy" v={`${Math.round(p.accuracy)}%`} tone="cool" />
              <Metric k="Best streak" v={`${p.bestStreak}`} tone="hot" />
              <Metric k="Deep +3" v={`${p.threes}`} tone="hot" />
              <Metric k="Time played" v={`${p.durationSec}s`} />
            </div>

            <div className="mt-auto pt-2">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#7de8b0,#ffd166,#ff8a2b)]"
                  style={{ width: `${Math.min(100, Math.round(p.accuracy))}%` }}
                />
              </div>
              <div className="mt-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-400 sm:text-[9px]">
                Shooting accuracy {Math.round(p.accuracy)}% · {p.shotsMade} of {p.shotsTaken} shots
              </div>
            </div>
          </Panel>

          {/* top 10 */}
          <div className="min-h-0">
            <div className="h-full min-h-0">
              <LeaderboardPanel entries={entries} currentNames={[p.name]} source="local" dense />
            </div>
          </div>
        </div>

        {/* actions */}
        <div className="flex shrink-0 justify-center">
          <ArcadeButton size="sm" variant="secondary" className="min-h-11 w-full max-w-xs" onClick={onRestart}>
            ⟲ Restart
          </ArcadeButton>
        </div>
      </div>

      {countdown !== null ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-slate-950/88 backdrop-blur-sm">
          <p className="text-[clamp(0.8rem,2vh,1.2rem)] font-black uppercase tracking-[0.3em] text-sky-200/80">Back on the court</p>
          <div key={countdown} className="count-pulse text-[clamp(4rem,20vh,12rem)] font-black leading-none text-amber-300">
            {countdown > 0 ? countdown : "GO"}
          </div>
          <ArcadeButton size="sm" variant="ghost" onClick={() => setCountdown(null)}>
            Cancel
          </ArcadeButton>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ k, v, tone = "default" }: { k: string; v: string; tone?: "default" | "hot" | "good" | "cool" }) {
  const tones = { default: "text-white", hot: "text-amber-300", good: "text-emerald-300", cool: "text-sky-300" } as const;
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 px-1.5 py-1.5 text-center sm:px-2 sm:py-2">
      <div className="text-[7px] font-black uppercase tracking-[0.08em] text-sky-200/60 sm:text-[9px] sm:tracking-[0.14em]">{k}</div>
      <div className={`text-[clamp(1rem,2.6vh,1.8rem)] font-black leading-tight tabular-nums ${tones[tone]}`}>{v}</div>
    </div>
  );
}
