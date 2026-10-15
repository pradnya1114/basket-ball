"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { AirBasketballEngine, LiveStats } from "@/game/engine";
import { sfx } from "@/game/audio";
import { getSoundEnabled, PlayfieldCanvas, setSoundEnabled } from "./PlayfieldCanvas";
import { CameraPanel } from "./CameraPanel";
import { ArcadeButton, Pill } from "./ui";
import type { PlayerResult, Session } from "@/lib/types";
import { TIMING } from "@/game/constants";
import type { HandTrackingApi } from "@/hooks/useHandTracking";

interface Props {
  session: Session;
  tracking: HandTrackingApi;
  playfieldRef: RefObject<HTMLDivElement | null>;
  onExit: () => void;
  onFinish: (results: PlayerResult[]) => void;
}

type Phase = "countdown" | "playing" | "paused" | "finished";

/**
 * Page 3 — single-player gameplay (60 seconds). Full-bleed court with floating HUD
 * cards. No score and no leaderboard here: those are revealed on the results page.
 */
export function GamePage({ session, tracking, playfieldRef, onExit, onFinish }: Props) {
  const engineRef = useRef<AirBasketballEngine | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [count, setCount] = useState(3);
  const [flash, setFlash] = useState<{ text: string; tone: "good" | "bad" | "info"; id: number } | null>(null);
  const [sound, setSound] = useState(getSoundEnabled());
  const [camView, setCamView] = useState<"sm" | "lg" | "off">("sm");
  const finishedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const duration = TIMING.singlePlayerSec;
  const activeName = session.players[0] || "PLAYER";

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    },
    [],
  );

  /* ------------------------------------------------------ countdown, go */
  useEffect(() => {
    setPhase("countdown");
    setCount(3);
    let n = 3;
    sfx.resume();
    sfx.countdown(false);
    const iv = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        sfx.countdown(n === 1);
        return;
      }
      window.clearInterval(iv);
      const engine = engineRef.current;
      if (!engine) return;
      engine.resetStats();
      engine.startRound(duration);
      setCount(0);
      setPhase("playing");
      sfx.combo(1);
    }, 900);
    return () => window.clearInterval(iv);
  }, [duration]);

  const handleMessage = useCallback((text: string, tone: "good" | "bad" | "info") => {
    setFlash({ text, tone, id: Date.now() + Math.random() });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(id);
  }, [flash]);

  /* ------------------------------------------------------- end of the run */
  const commitTurn = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || finishedRef.current) return; // finish exactly once
    finishedRef.current = true;
    const s = engine.getStats();
    const played = Math.max(1, Math.round(duration - s.timeLeft));
    const result: PlayerResult = {
      name: activeName,
      score: s.score,
      shotsMade: s.shotsMade,
      shotsTaken: s.shotsTaken,
      accuracy: s.shotsTaken > 0 ? (s.shotsMade / s.shotsTaken) * 100 : 0,
      bestStreak: s.bestStreak,
      threes: s.threes,
      durationSec: played,
      rank: 0,
    };
    engine.pauseRound();
    engine.setFrozen(true);
    setPhase("finished");
    later(() => onFinish([result]), 900);
  }, [activeName, duration, later, onFinish]);

  const onTimeEnd = useCallback(() => {
    if (finishedRef.current) return;
    sfx.buzzer();
    commitTurn();
  }, [commitTurn]);

  const endNow = () => {
    if (phase === "countdown") return;
    engineRef.current?.endRound();
    onTimeEnd();
  };

  const togglePause = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (phase === "playing") {
      engine.pauseRound();
      engine.setFrozen(true);
      setPhase("paused");
    } else if (phase === "paused") {
      engine.setFrozen(false);
      engine.resumeRound();
      setPhase("playing");
    }
  };

  const timeLeft = stats?.timeLeft ?? duration;
  const timePct = Math.max(0, Math.min(1, timeLeft / duration));
  const urgent = timeLeft <= 10;

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#04070f]">
      {/* ------------------------------------------------------- the court */}
      <div ref={playfieldRef} className="absolute inset-0">
        <PlayfieldCanvas
          fill
          tracking={tracking}
          engineRef={engineRef}
          playerName={activeName}
          durationSec={duration}
          onStats={setStats}
          onMessage={handleMessage}
          onTimeEnd={onTimeEnd}
        />
      </div>

      {/* -------------------------------------------------------- HUD: top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-2 pb-3 pt-[4.75rem] sm:gap-4 sm:px-3 xl:px-4 xl:pb-6">
        {/* session card */}
        <div className="mt-2 flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/72 px-2 py-2 backdrop-blur-sm sm:mt-5 sm:gap-4 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <div className="text-[7px] font-black uppercase tracking-[0.16em] text-amber-300/75 sm:text-[9px] sm:tracking-[0.28em]">Single player</div>
            <div className="max-w-[22vw] truncate text-xs font-black uppercase leading-tight tracking-[0.05em] text-white sm:max-w-none sm:text-[clamp(1.1rem,2.6vh,1.9rem)]">
              {activeName}
            </div>
          </div>
        </div>

        {/* clock */}
        <div className="w-[clamp(105px,31vw,220px)] rounded-2xl border border-white/10 bg-slate-950/72 px-2 py-2 backdrop-blur-sm sm:w-[clamp(180px,26vw,320px)] sm:px-4">
          <div className="flex items-end justify-between">
              <span className="text-[7px] font-black uppercase tracking-[0.12em] text-sky-200/60 sm:text-[9px] sm:tracking-[0.24em]">Time left</span>
            <span
              className={`text-[clamp(1.4rem,3.4vh,2.4rem)] font-black leading-none tabular-nums ${
                urgent ? "text-rose-300" : "text-white"
              }`}
            >
              {Math.ceil(timeLeft)}
              <span className="ml-0.5 text-[0.55em] font-black uppercase tracking-widest text-slate-400">s</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-150 ${
                urgent ? "bg-[linear-gradient(90deg,#ff6b6b,#ffd166)]" : "bg-[linear-gradient(90deg,#38bdf8,#7de8b0)]"
              }`}
              style={{ width: `${timePct * 100}%` }}
            />
          </div>
        </div>

        {/* tracking + camera */}
        <div className="flex min-w-0 flex-col items-end gap-1 sm:gap-1.5 max-sm:absolute max-sm:right-2 max-sm:top-[9rem] max-sm:z-20">
          <div className="flex flex-col items-end gap-1" data-no-gesture>
            <Pill tone={stats?.tracking ? "good" : "bad"} className="max-w-[30vw] truncate bg-slate-950/72 px-2 text-[8px] tracking-normal backdrop-blur-sm sm:max-w-none sm:px-3 sm:text-xs sm:tracking-[0.18em]">
              <span className={`h-1.5 w-1.5 rounded-full ${stats?.tracking ? "bg-emerald-300" : "animate-pulse bg-rose-400"}`} />
              {stats?.tracking ? "Hand detected" : "Hand not detected"}
            </Pill>
            
          </div>

          <div data-no-gesture className={`flex flex-col items-end ${camView === "lg" ? "" : ""}`}>
            {camView === "off" ? (
              <button
                onClick={() => setCamView("sm")}
                className="rounded-xl border border-cyan-300/40 bg-slate-950/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 transition hover:bg-slate-900"
              >
                🎥 Camera
              </button>
            ) : (
              <div className={`w-[clamp(88px,24vw,180px)] rounded-2xl sm:w-[clamp(150px,17vw,230px)] ${camView === "lg" ? "w-[clamp(120px,32vw,240px)] sm:w-[clamp(240px,26vw,330px)]" : ""}`}>
                <div className={stats?.tracking ? "" : "flash-ring rounded-2xl"}>
                  <CameraPanel
                    videoRef={tracking.videoRef}
                    attachVideo={tracking.attachVideo}
                    debugRef={tracking.debugRef}
                    status={tracking.status}
                    error={tracking.error}
                    source={tracking.source}
                    pinchUi={tracking.pinchUi}
                    tracking={!!stats?.tracking}
                    modelStatus={tracking.modelStatus}
                    modelError={tracking.modelError}
                    embedded={tracking.diagnostics.embedded}
                    insecure={!tracking.diagnostics.secure}
                    onRetry={() => void tracking.retry()}
                    onRetryModel={() => void tracking.retryModel()}
                    onUsePointer={tracking.enablePointerFallback}
                    onStopPointer={tracking.disablePointerFallback}
                  />
                </div>
                <div className="mt-1 flex justify-end gap-1">
                  
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ HUD: feedback */}
      {flash ? (
        <div
          key={flash.id}
          className={`pop-in pointer-events-none absolute left-1/2 top-[15%] -translate-x-1/2 rounded-2xl border-2 px-6 py-2 text-[clamp(1.2rem,3.4vh,2.4rem)] font-black uppercase tracking-[0.14em] ${
            flash.tone === "good"
              ? "border-emerald-300/70 bg-emerald-400/20 text-emerald-200 shadow-[0_0_50px_-10px_rgba(125,232,176,0.8)]"
              : flash.tone === "bad"
                ? "border-rose-300/60 bg-rose-500/20 text-rose-200"
                : "border-sky-300/50 bg-sky-400/15 text-sky-100"
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      {/* --------------------------------------------------- HUD: bottom left */}
      <div className="pointer-events-none absolute bottom-2 left-2 w-[min(44vw,420px)] sm:bottom-4 sm:left-4 sm:w-[clamp(280px,42vw,520px)]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-2 py-2 backdrop-blur-sm sm:px-4 sm:py-2.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-sky-200/70">Shot power</span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#ffd166,#ff8a2b,#ff4d4d)] transition-[width] duration-75"
                style={{ width: `${Math.round((stats?.charge ?? 0) * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right text-base font-black tabular-nums text-white">
              {Math.round((stats?.charge ?? 0) * 100)}%
            </span>
          </div>
          <p className="mt-1.5 hidden text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 sm:block">
            {stats?.canGrab
              ? "① pinch to grab the ball"
              : stats?.ballState === "held"
                ? "③ pull back to charge · ④ thrust forward & release to shoot"
                : "ball resetting…"}
          </p>
        </div>
      </div>

     

      {/* ---------------------------------------------------------- overlays */}
      {phase === "countdown" ? (
        <Overlay>
          <div className="px-6 text-center">
            <p className="text-[clamp(0.8rem,2vh,1.2rem)] font-black uppercase tracking-[0.3em] text-sky-200/80">
              {`Get ready, ${activeName}`}
            </p>
            <div
              key={count}
              className="count-pulse my-1 text-[clamp(4rem,16vh,11rem)] font-black leading-none text-amber-300 drop-shadow-[0_0_40px_rgba(255,159,28,0.6)]"
            >
              {count > 0 ? count : "GO"}
            </div>
            <p className="text-[clamp(0.6rem,1.5vh,0.9rem)] font-bold uppercase tracking-[0.2em] text-slate-300">
              Pinch · aim · pull back · throw
            </p>
            {tracking.status !== "ready" || tracking.modelStatus !== "ready" ? (
              <div
                data-no-gesture
                className="mx-auto mt-3 max-w-[560px] rounded-xl border border-amber-300/50 bg-amber-400/10 px-4 py-2 text-[11px] font-bold uppercase leading-relaxed tracking-[0.12em] text-amber-100"
              >
                {tracking.error ?? tracking.modelError ?? "Gesture camera is not running yet."} Use POINTER MODE in the
                camera card to play without a camera.
              </div>
            ) : null}
          </div>
        </Overlay>
      ) : null}

      {phase === "paused" ? (
        <Overlay>
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-[clamp(2.4rem,9vh,6rem)] font-black uppercase leading-none tracking-[0.06em] text-white">Paused</p>
            <div className="flex gap-2" data-no-gesture>
              <ArcadeButton size="lg" onClick={togglePause}>
                ▶ Resume
              </ArcadeButton>
              <ArcadeButton size="lg" variant="ghost" onClick={onExit}>
                How to play
              </ArcadeButton>
              <ArcadeButton size="lg" variant="danger" onClick={endNow}>
                ■ End → results
              </ArcadeButton>
            </div>
          </div>
        </Overlay>
      ) : null}

      {phase === "finished" ? (
        <Overlay>
          <div className="text-center">
            <p className="text-[clamp(1.2rem,4vh,2.6rem)] font-black uppercase tracking-[0.16em] text-amber-300">
              Final buzzer
            </p>
            <p className="mt-2 text-[clamp(0.6rem,1.6vh,0.95rem)] font-bold uppercase tracking-[0.2em] text-slate-300">
              Heading to your score…
            </p>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/74 backdrop-blur-[3px]">{children}</div>;
}
