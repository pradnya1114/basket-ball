"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArenaBackdrop } from "./ArenaBackdrop";
import { CameraPanel } from "./CameraPanel";
import { PlayfieldCanvas } from "./PlayfieldCanvas";
import { ArcadeButton, IconBall, IconCamera, IconHand, IconHoop, Panel, Pill } from "./ui";
import type { AirBasketballEngine, LiveStats } from "@/game/engine";
import type { HandTrackingApi } from "@/hooks/useHandTracking";
import { getCalibration, saveCalibration } from "@/hooks/useHandTracking";
import { sfx } from "@/game/audio";

interface Props {
  tracking: HandTrackingApi;
  playfieldRef: RefObject<HTMLDivElement | null>;
  playerName: string;
  onBack: () => void;
  onPlay: () => void;
}

/**
 * FRONT-FACING view: you look straight down the court at the hoop and throw the
 * ball *into* the screen, so the gestures are depth gestures.
 */
const STEPS = [
  {
    n: 1,
    title: "Pinch to grab",
    short: "Thumb + index together, hand in view",
    body: "Face the camera with one hand raised.",
    accent: "#38bdf8",
  },
  {
    n: 2,
    title: "Move to aim",
    short: "Slide your hand left / right, raise it",
    body: "Move your hand sideways to line the shot up left or right.",
    accent: "#7de8b0",
  },
  {
    n: 3,
    title: "Pull back to charge",
    short: "Draw your hand toward your chest",
    body: "Pull your hand back toward your body — it looks smaller to the camera, and that is the charge.",
    accent: "#ffd166",
  },
  {
    n: 4,
    title: "Throw to score",
    short: "Thrust at the screen and release",
    body: "Punch your hand forward at the screen (it grows in frame) and open the pinch.",
    accent: "#ff8a2b",
  },
];

export function RulesPage({ tracking, playfieldRef, playerName, onBack, onPlay }: Props) {
  const [testing, setTesting] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibMsg, setCalibMsg] = useState<string | null>(null);
  const [live, setLive] = useState<LiveStats | null>(null);
  const [readout, setReadout] = useState({ x: 0, y: 0, pinch: false, present: false, hands: 0, fps: 0 });
  const [calib, setCalib] = useState(getCalibration());
  const engineRef = useRef<AirBasketballEngine | null>(null);

  useEffect(() => {
    const iv = window.setInterval(() => {
      const s = tracking.sampleRef.current;
      setReadout({
        x: s?.x ?? 0,
        y: s?.y ?? 0,
        pinch: !!s?.pinch,
        present: !!s?.present,
        hands: tracking.debugRef.current?.hands.length ?? 0,
        fps: Math.round(tracking.debugRef.current?.fps ?? 0),
      });
    }, 140);
    return () => window.clearInterval(iv);
  }, [tracking]);

  const runCalibration = async () => {
    setCalibrating(true);
    setCalibMsg(null);
    try {
      const res = await tracking.startCalibration();
      saveCalibration(res);
      setCalib(getCalibration());
      setCalibMsg(`Pinch thresholds set to ${res.on.toFixed(2)} / ${res.off.toFixed(2)}`);
      sfx.combo(2);
    } catch (err) {
      setCalibMsg(err instanceof Error ? err.message : "Calibration failed");
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto xl:overflow-hidden">
      <ArenaBackdrop dim />
      <div className="relative mx-auto flex h-auto min-h-full w-full max-w-[1440px] flex-col px-3 pb-4 pt-[clamp(76px,12vh,120px)] sm:px-5 xl:h-full xl:min-h-0 xl:px-8 xl:pb-5">
        <header className="grid shrink-0 grid-cols-1 items-center gap-3 sm:gap-4 xl:grid-cols-[1fr_auto_1fr]">
          <div className="text-center xl:col-start-2">
            <h1 className="title-glow text-[clamp(2.2rem,8vw,5.5rem)] font-black uppercase leading-[0.9] tracking-[0.04em] text-white sm:tracking-[0.08em]">
              How to <span className="text-amber-300">play</span>
            </h1>
          </div>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center xl:col-start-3 xl:justify-end">
            <Pill tone={tracking.status === "ready" ? (readout.present ? "good" : "warn") : tracking.status === "error" ? "bad" : "info"}>
              <IconCamera className="h-4 w-4" />
              {tracking.status === "loading"
                ? "Starting camera…"
                : tracking.status === "error"
                  ? "Camera error"
                  : readout.present
                    ? `Hand detected · ${readout.hands} · ${readout.fps}fps`
                    : "Hand not detected"}
            </Pill>
            
          </div>
        </header>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.5fr_1fr] xl:gap-4">
          {/* ---------------------------------------------------- steps ---- */}
          <div className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <div className="grid gap-3 sm:grid-cols-2 xl:gap-4">
              {STEPS.map((s) => (
                <Panel key={s.n} className="relative overflow-hidden p-3 sm:p-4">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <StepArt kind={s.n} accent={s.accent} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-base font-black"
                          style={{ background: s.accent, color: "#05101f" }}
                        >
                          {s.n}
                        </span>
                        <h2 className="text-base font-black uppercase leading-tight tracking-[0.04em] text-white sm:text-lg">{s.title}</h2>
                      </div>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: s.accent }}>
                        {s.short}
                      </p>
                      <p className="mt-1.5 text-[13px] font-medium leading-snug text-slate-300">{s.body}</p>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>

            <Panel className="p-5">
              <h3 className="flex items-center gap-2 text-xl font-black uppercase tracking-[0.1em] text-amber-200">
                <IconHoop className="h-6 w-6" /> Scoring &amp; rules
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Basket", "+2 points"],
                  ["Deep launch (60%+ power)", "+3 points"],
                  ["Clean swish (no rim)", "+1 bonus"],
                  ["3 makes in a row", "COMBO x2"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-200/60">{k}</div>
                    <div className="text-xl font-black text-white">{v}</div>
                  </div>
                ))}
              </div>
             
            </Panel>
          </div>

          {/* ------------------------------------------------- camera / test - */}
          <div className="flex flex-col gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <CameraPanel
              videoRef={tracking.videoRef}
              attachVideo={tracking.attachVideo}
              debugRef={tracking.debugRef}
              status={tracking.status}
              error={tracking.error}
              source={tracking.source}
              pinchUi={tracking.pinchUi}
              tracking={readout.present}
              modelStatus={tracking.modelStatus}
              modelError={tracking.modelError}
              embedded={tracking.diagnostics.embedded}
              insecure={!tracking.diagnostics.secure}
              onRetry={() => void tracking.retry()}
              onRetryModel={() => void tracking.retryModel()}
              onUsePointer={tracking.enablePointerFallback}
              onStopPointer={tracking.disablePointerFallback}
            />

  

            {testing ? (
              <div ref={playfieldRef} className="relative overflow-hidden rounded-2xl border border-cyan-300/25 bg-slate-950">
                <PlayfieldCanvas
                  tracking={tracking}
                  engineRef={engineRef}
                  practice
                  calibrationFrame
                  playerName={playerName || "TEST PLAYER"}
                  onStats={setLive}
                />
                <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 rounded-xl bg-slate-950/80 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-200">
                  <span>State: {live?.ballState ?? "idle"}</span>
                  <span>Charge {Math.round((live?.charge ?? 0) * 100)}%</span>
                  <span>{live?.tracking ? "Hand locked" : "Show your hand"}</span>
                  <span className="text-slate-400">Scores only on the final page</span>
                </div>
              </div>
            ) : null}

            {calibrating || calibMsg ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] ${calibrating ? "border-amber-300/60 bg-amber-400/15 text-amber-100" : "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
                  }`}
              >
                {calibrating
                  ? tracking.calibPhase === "open"
                    ? "Calibration step 1: hold your hand open and relaxed in view…"
                    : "Calibration step 2: now pinch thumb to index finger and hold…"
                  : calibMsg}
                {calibrating ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40">
                    <div className="h-full w-full origin-left animate-[pop-in_5.2s_linear] bg-amber-300" />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3">
              <ArcadeButton size="lg" onClick={onPlay}>
                🏀 Let&apos;s play
              </ArcadeButton>
              <div className="grid grid-cols-2 gap-3">
                <ArcadeButton
                  variant={testing ? "danger" : "secondary"}
                  onClick={() => {
                    sfx.resume();
                    setTesting((v) => !v);
                  }}
                >
                  {testing ? "Stop test" : "gestures"}
                </ArcadeButton>
                <ArcadeButton
                  variant="secondary"
                  disabled={tracking.status !== "ready" || calibrating}
                  onClick={runCalibration}
                >
                  Calibrate camera
                </ArcadeButton>
              </div>
              
              {tracking.status === "off" ? (
                <ArcadeButton variant="primary" onClick={() => void tracking.start()}>
                  Enable camera
                </ArcadeButton>
              ) : null}
              {tracking.status === "error" ? (
                <div className="rounded-2xl border-2 border-rose-400/60 bg-rose-500/15 px-4 py-3 text-sm font-bold text-rose-100">
                  {tracking.error ?? "Camera unavailable."} Use the retry button above, or switch to pointer mode.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="mt-3 flex shrink-0 items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          <span className="flex items-center gap-2">
            <IconBall className="h-4 w-4 text-amber-400" /> 
          </span>
          <span>Tip: stay about an arm&apos;s length from the camera</span>
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- step art */
function StepArt({ kind, accent }: { kind: number; accent: string }) {
  return (
    <svg viewBox="0 0 110 110" className="h-16 w-16 shrink-0">
      <circle cx="78" cy="66" r="17" fill="#f97e1b" stroke="rgba(50,16,2,0.8)" strokeWidth="2" />
      <path d="M61 66h34M78 49v34" stroke="rgba(50,16,2,0.7)" strokeWidth="1.8" fill="none" />
      <g
        className={kind === 3 ? "step-gesture" : kind === 4 ? "step-gesture" : undefined}
        style={kind >= 3 ? { animationDuration: kind === 4 ? "2.2s" : "3.4s" } : undefined}
      >
        <path
          d="M28 74c-6-4-8-10-4-14 3-3 7-2 10 1l4 4-2-18c0-4 6-5 7-1l2 16-1-16c0-4 6-5 7-1l1 17 1-14c0-4 6-4 6 0l1 14 1-11c0-4 6-4 6 0l1 15c1 12-5 20-14 22-8 2-18 0-24-4z"
          fill="rgba(180,225,255,0.22)"
          stroke={accent}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        {kind === 1 ? (
          <>
            <circle cx="52" cy="52" r="7" fill="none" stroke={accent} strokeWidth="2.4" className="flash-ring" />
            <path d="M40 40l24 24" stroke={accent} strokeWidth="2" strokeDasharray="4 4" className="marquee-dash" />
          </>
        ) : null}
        {kind === 2 ? <path d="M58 50l26 12" stroke={accent} strokeWidth="2.4" strokeDasharray="10 8" className="marquee-dash" /> : null}
        {kind === 3 ? <path d="M56 44c-14-6-22 4-22 12" stroke={accent} strokeWidth="2.4" fill="none" markerEnd="" /> : null}
        {kind === 4 ? <path d="M60 42c16-12 30-6 34 8" stroke={accent} strokeWidth="2.4" fill="none" /> : null}
      </g>
      {kind === 4 ? <path d="M56 34c14-16 34-14 44 2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" strokeDasharray="6 6" fill="none" /> : null}
    </svg>
  );
}
