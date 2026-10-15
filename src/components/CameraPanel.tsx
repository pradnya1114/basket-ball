"use client";
import { useEffect, useRef, type RefObject } from "react";
import { HAND_CONNECTIONS, type HandDebug, type TrackingStatus } from "@/hooks/useHandTracking";
import { ArcadeButton, IconCamera } from "./ui";
import { sfx } from "@/game/audio";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** ref callback that re-attaches the live MediaStream to whichever preview is mounted */
  attachVideo?: (el: HTMLVideoElement | null) => void;
  debugRef: RefObject<HandDebug>;
  status: TrackingStatus;
  error: string | null;
  source: "camera" | "pointer" | "off";
  pinchUi: number;
  tracking: boolean;
  className?: string;
  modelStatus?: "idle" | "loading" | "ready" | "error";
  modelError?: string | null;
  embedded?: boolean;
  insecure?: boolean;
  onRetry: () => void;
  onRetryModel?: () => void;
  onUsePointer: () => void;
  onStopPointer: () => void;
}

/** Small live camera preview with hand skeleton overlay, diagnostics and fallbacks. */
export function CameraPanel({
  videoRef,
  attachVideo,
  debugRef,
  status,
  error,
  source,
  pinchUi,
  tracking,
  className = "",
  modelStatus = "ready",
  modelError = null,
  embedded = false,
  insecure = false,
  onRetry,
  onRetryModel,
  onUsePointer,
  onStopPointer,
}: Props) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = overlayRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const dbg = debugRef.current;
          if (dbg?.present && dbg.hands.length && source === "camera") {
            for (const hand of dbg.hands) {
              const pts = hand.landmarks.map((p) => ({ x: (1 - p.x) * canvas.width, y: p.y * canvas.height }));
              ctx.strokeStyle = "rgba(90,220,255,0.9)";
              ctx.lineWidth = 2 * dpr;
              for (const [a, b] of HAND_CONNECTIONS) {
                if (!pts[a] || !pts[b]) continue;
                ctx.beginPath();
                ctx.moveTo(pts[a].x, pts[a].y);
                ctx.lineTo(pts[b].x, pts[b].y);
                ctx.stroke();
              }
              ctx.fillStyle = "rgba(255,255,255,0.95)";
              for (const p of pts) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2.4 * dpr, 0, Math.PI * 2);
                ctx.fill();
              }
              const pinching = hand.pinchRatio < 0.45;
              const tip = pts[8] ?? pts[4];
              ctx.strokeStyle = pinching ? "#7de8b0" : "#ff9f1c";
              ctx.lineWidth = 2.5 * dpr;
              ctx.beginPath();
              ctx.arc(tip.x, tip.y, (pinching ? 10 : 15) * dpr, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [debugRef, source]);

  const live = status === "ready" && modelStatus === "ready" && tracking;
  const pointerMode = source === "pointer";
  const state = pointerMode
    ? "POINTER MODE"
    : status === "loading"
      ? "STARTING CAMERA…"
      : status === "error"
        ? "CAMERA BLOCKED"
        : modelStatus === "loading"
          ? "LOADING HAND MODEL…"
          : modelStatus === "error"
            ? "MODEL ERROR"
            : live
              ? "HAND DETECTED"
              : "HAND NOT DETECTED";
  const tone = live
    ? "bg-emerald-400/20 text-emerald-200"
    : status === "error" || modelStatus === "error"
      ? "bg-rose-500/20 text-rose-200"
      : status === "loading" || modelStatus === "loading"
        ? "bg-amber-400/20 text-amber-200"
        : pointerMode
          ? "bg-sky-400/20 text-sky-100"
          : "bg-white/10 text-slate-300";

  const openTab = () => {
    sfx.ui();
    window.open(window.location.href, "_blank", "noopener");
  };

  return (
    <div className={`overflow-hidden rounded-2xl border border-cyan-300/25 bg-slate-950/80 ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/50 px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200/80">
          <IconCamera className="h-4 w-4" />
          {pointerMode ? "Pointer" : "Gesture cam"}
        </span>
        <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${tone}`}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              live ? "animate-pulse bg-emerald-300" : status === "error" || modelStatus === "error" ? "bg-rose-400" : "bg-slate-400"
            }`}
          />
          {state}
        </span>
      </div>

      <div className="relative aspect-[4/3] w-full bg-[#050a14]">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={attachVideo ? (el) => { attachVideo(el); } : videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-90"
        />
        <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" />

        {live ? (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-emerald-300">
            ● live
          </span>
        ) : null}
        <span
          className={`absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] ${
            live ? "bg-emerald-400/85 text-slate-900" : "bg-rose-500/85 text-white animate-pulse"
          }`}
        >
          {live ? "hand locked" : "no hand"}
        </span>

        {status !== "ready" || modelStatus !== "ready" || pointerMode ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-950/85 px-3 py-2 text-center">
            {pointerMode ? (
              <>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-100">
                  Press &amp; drag on the court to simulate a hand
                </span>
                <ArcadeButton size="sm" variant="ghost" onClick={onRetry}>
                  Try camera again
                </ArcadeButton>
              </>
            ) : status === "loading" || modelStatus === "loading" ? (
              <>
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" />
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-200/80">
                  {status === "loading" ? "Requesting the camera…" : "Preparing the hand model…"}
                </span>
              </>
            ) : status === "error" ? (
              <>
                <span className="text-[12px] font-black uppercase tracking-[0.12em] text-rose-300">Camera unavailable</span>
                <span className="text-[10px] leading-snug text-slate-300">{error}</span>
                <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                  <ArcadeButton size="sm" onClick={onRetry}>
                    Retry camera
                  </ArcadeButton>
                  <ArcadeButton size="sm" variant="secondary" onClick={onUsePointer}>
                    Pointer mode
                  </ArcadeButton>
                  {embedded || insecure ? (
                    <ArcadeButton size="sm" variant="ghost" onClick={openTab}>
                      Open in new tab
                    </ArcadeButton>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <span className="text-[12px] font-black uppercase tracking-[0.12em] text-amber-200">Hand model issue</span>
                <span className="text-[10px] leading-snug text-slate-300">{modelError}</span>
                <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                  <ArcadeButton size="sm" onClick={() => (onRetryModel ? onRetryModel() : onRetry())}>
                    Retry model
                  </ArcadeButton>
                  <ArcadeButton size="sm" variant="secondary" onClick={onUsePointer}>
                    Pointer mode
                  </ArcadeButton>
                  <ArcadeButton
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      sfx.ui();
                      window.location.reload();
                    }}
                  >
                    ↻ Reload page
                  </ArcadeButton>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 bg-black/40 px-3 py-1.5">
        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Pinch</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#7de8b0,#ffd166)] transition-[width] duration-75"
            style={{ width: `${Math.round(pinchUi * 100)}%` }}
          />
        </div>
        <span className="tabular-nums text-[9px] font-bold text-slate-400">{Math.round(debugRef.current?.fps ?? 0)}fps</span>
        {!pointerMode ? (
          <button
            onClick={() => {
              sfx.ui();
              onUsePointer();
            }}
            title="Use the mouse or touch instead of the camera"
            className="rounded-md border border-white/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:bg-white/10"
          >
            Pointer
          </button>
        ) : (
          <button
            onClick={() => {
              sfx.ui();
              onStopPointer();
            }}
            className="rounded-md border border-sky-300/40 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-sky-200 hover:bg-sky-400/10"
          >
            Camera
          </button>
        )}
      </div>
    </div>
  );
}
