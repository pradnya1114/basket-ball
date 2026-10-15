"use client";
import { useState } from "react";
import { ArenaBackdrop } from "./ArenaBackdrop";
import { ArcadeButton, IconBall, IconCamera, Panel } from "./ui";
import type { OfflineState } from "@/hooks/useOffline";
import { sfx } from "@/game/audio";
import { TIMING } from "@/game/constants";

interface Props {
  initialName: string;
  offline: OfflineState;
  onStart: (name: string) => void;
}

/** Page 1 — single player welcome: name in, start. */
export function WelcomePage({ initialName, offline, onStart }: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const n = name.trim();
    if (!n) return setError("Enter your name to step on the court.");
    if (n.length > 18) return setError("Keep your name to 18 characters or fewer so it fits the scoreboard.");
    setError(null);
    sfx.resume();
    sfx.countdown(true);
    onStart(n);
  };

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <ArenaBackdrop />

      <div className="relative mx-auto flex min-h-full w-full max-w-[1180px] flex-col justify-center gap-4 px-4 py-5 sm:gap-6 sm:px-6 sm:py-8 xl:px-10">
        {/* top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-16 text-[10px] font-black uppercase tracking-[0.2em] text-sky-200/55 sm:pt-20">
          <span className="flex items-center gap-2">
            <IconBall className="h-0 w-4 text-amber-300" />
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <OfflineBadge offline={offline} />
            {offline.online && !offline.ready && !offline.unsupported ? (
              <button
                onClick={() => void offline.prepare()}
                className="rounded-full border border-sky-300/50 bg-sky-400/15 px-2.5 py-1 text-[9px] tracking-[0.14em] text-sky-100 transition hover:bg-sky-400/25"
              >
                {offline.preparing ? "⏳ Storing ~20 MB…" : "📦 Store for offline"}
              </button>
            ) : null}
          </div>
        </div>

        {/* title */}
        <div className="text-center">
          <h1 className="title-glow bg-[linear-gradient(180deg,#fff8ec_0%,#ffd166_38%,#ff8a2b_72%,#ff5f00_100%)] bg-clip-text text-[clamp(2rem,9vw,7rem)] font-black uppercase leading-[0.9] tracking-[0.02em] text-transparent">
            Air Basketball
          </h1>
          <p className="mt-2 text-[clamp(0.85rem,2.4vh,1.6rem)] font-black uppercase tracking-[0.34em] text-sky-100/80">
            Grab. Aim. Shoot. Score!
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/5 px-4 py-1.5 text-[clamp(0.6rem,1.5vh,0.85rem)] font-bold uppercase tracking-[0.14em] text-cyan-200/80">
            <IconCamera className="h-4 w-4" />
            Play using hand gestures — no controller needed
          </p>
        </div>

        {/* card */}
        <Panel glow className="mx-auto w-full max-w-[1000px] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto grid w-full max-w-[560px] grid-cols-1 text-center">
            <div className="flex flex-col justify-center">
              <label className="text-base font-black uppercase tracking-[0.2em] text-amber-200 sm:text-lg" htmlFor="player">
                Player name
              </label>
              <input
                id="player"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Enter your name"
                maxLength={22}
                className="mt-2 w-full rounded-2xl border-2 border-sky-300/25 bg-slate-950/70 px-4 py-3 text-lg font-black uppercase tracking-[0.08em] text-white outline-none transition placeholder:normal-case placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-500 focus:border-amber-300/80 focus:shadow-[0_0_0_4px_rgba(255,159,28,0.16)] sm:text-xl"
              />
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                {[
                  [`${TIMING.singlePlayerSec}s`, "round"],
                  ["+2 / +3", "per basket"],
                  ["Top 10", "leaderboard"],
                ].map(([a, b]) => (
                  <div key={b} className="rounded-xl border border-white/10 bg-black/30 px-1 py-2">
                    <div className="text-base font-black text-white sm:text-lg">{a}</div>
                    <div className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400 sm:text-[9px]">{b}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="mt-6 flex flex-col items-center gap-3">
            {error ? (
              <div
                role="alert"
                className="shake w-full rounded-2xl border-2 border-rose-400/60 bg-rose-500/15 px-5 py-2.5 text-center text-[clamp(0.8rem,1.8vh,1.05rem)] font-black uppercase tracking-[0.1em] text-rose-200"
              >
                ⚠ {error}
              </div>
            ) : null}
            <ArcadeButton size="lg" className="w-full max-w-[460px]" onClick={submit}>
              ▶ Start game
            </ArcadeButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function OfflineBadge({ offline }: { offline: OfflineState }) {
  const label = !offline.online
    ? offline.ready
      ? "Offline · running from device"
      : "Offline · not stored on device"
    : offline.ready
      ? "Offline ready"
      : offline.unsupported
        ? ""
        : offline.preparing
          ? "Storing for offline…"
          : "Preparing offline…";
  const tone = !offline.online
    ? offline.ready
      ? "border-amber-300/50 bg-amber-400/15 text-amber-100"
      : "border-rose-300/50 bg-rose-500/15 text-rose-200"
    : offline.ready
      ? "border-emerald-300/50 bg-emerald-400/15 text-emerald-200"
      : "border-sky-300/40 bg-sky-400/10 text-sky-100";
  return 
    
      
 ;
}

export { OfflineBadge };
