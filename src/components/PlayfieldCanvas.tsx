"use client";
import { useEffect, useRef, type MutableRefObject } from "react";
import { AirBasketballEngine, type EngineEvents, type GestureSample } from "@/game/engine";
import type { HandTrackingApi } from "@/hooks/useHandTracking";
import { sfx } from "@/game/audio";

interface Props extends EngineEvents {
  tracking: HandTrackingApi;
  practice?: boolean;
  playerName?: string;
  durationSec?: number;
  calibrationFrame?: boolean;
  /** "front" = look down the court at the hoop (default), "side" = profile view */
  view?: "front" | "side";
  /** true = stretch to the parent box (letterboxed internally), false = 16:9 card */
  fill?: boolean;
  engineRef: MutableRefObject<AirBasketballEngine | null>;
  className?: string;
}

/**
 * Mounts the canvas, owns exactly one engine + one animation loop, and wires
 * the live gesture sample into it. Unmounting releases everything.
 */
export function PlayfieldCanvas({
  tracking,
  practice = false,
  playerName = "PLAYER",
  durationSec = 60,
  calibrationFrame = false,
  view = "front",
  fill = false,
  engineRef,
  className = "",
  onStats,
  onScore,
  onMessage,
  onShotEnd,
  onTimeEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handlers = useRef({ onStats, onScore, onMessage, onShotEnd, onTimeEnd });
  handlers.current = { onStats, onScore, onMessage, onShotEnd, onTimeEnd };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new AirBasketballEngine(
      canvas,
      {
        onStats: (s) => handlers.current.onStats?.(s),
        onScore: (p) => handlers.current.onScore?.(p),
        onMessage: (t, tone) => handlers.current.onMessage?.(t, tone),
        onShotEnd: (made, shot) => handlers.current.onShotEnd?.(made, shot),
        onTimeEnd: () => handlers.current.onTimeEnd?.(),
      },
      { practice, playerName, durationSec, calibrationFrame, view },
    );
    engine.readGesture = (): GestureSample =>
      tracking.sampleRef.current ?? {
        present: false,
        x: 0.5,
        y: 0.6,
        pinch: false,
        pinchStrength: 0,
        handedness: null,
        source: "camera",
        size: 0,
        sizeVel: 0,
      };
    engine.setSourceIsCamera(tracking.source !== "pointer");
    engine.start();
    engineRef.current = engine;

    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    const onWinResize = () => engine.resize();
    window.addEventListener("resize", onWinResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
      engine.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setConfig({ practice, playerName, durationSec, calibrationFrame, view });
    engine.setSourceIsCamera(tracking.source !== "pointer");
  }, [practice, playerName, durationSec, calibrationFrame, view, tracking.source, engineRef]);

  return (
    <canvas
      ref={canvasRef}
      className={`block bg-[#04070f] ${
        fill ? "h-full w-full" : "aspect-[16/9] w-full rounded-2xl shadow-[0_40px_90px_-40px_rgba(0,0,0,1)]"
      } ${className}`}
    />
  );
}

let soundEnabled = true;
export function setSoundEnabled(on: boolean) {
  soundEnabled = on;
  sfx.setEnabled(on);
}
export function getSoundEnabled() {
  return soundEnabled;
}
