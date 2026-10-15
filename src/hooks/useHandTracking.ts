"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureSample } from "@/game/engine";
import { PINCH } from "@/game/constants";

/* ------------------------------------------------------------------ types */
export type TrackingStatus = "off" | "loading" | "ready" | "error";
export type TrackingSource = "camera" | "pointer" | "off";

export interface TrackedHand {
  landmarks: { x: number; y: number; z: number }[];
  handedness: "Left" | "Right";
  pinchRatio: number;
}

export interface HandDebug {
  present: boolean;
  hands: TrackedHand[];
  fps: number;
  latencyMs: number;
  lastVideoTime: number;
  videoReady: boolean;
}

export interface CalibSettings {
  on: number;
  off: number;
  mirror: boolean;
  gain: number;
}

type VisionBundle = Awaited<ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>>;

const CALIB_KEY = "air-basketball.calibration.v1";
const DEFAULT_CALIB: CalibSettings = { on: PINCH.on, off: PINCH.off, mirror: true, gain: 1 };

function loadCalib(): CalibSettings {
  if (typeof window === "undefined") return DEFAULT_CALIB;
  try {
    const raw = window.localStorage.getItem(CALIB_KEY);
    if (!raw) return DEFAULT_CALIB;
    const parsed = JSON.parse(raw) as Partial<CalibSettings>;
    return {
      on: typeof parsed.on === "number" ? parsed.on : DEFAULT_CALIB.on,
      off: typeof parsed.off === "number" ? parsed.off : DEFAULT_CALIB.off,
      mirror: parsed.mirror !== false,
      gain: typeof parsed.gain === "number" ? parsed.gain : 1,
    };
  } catch {
    return DEFAULT_CALIB;
  }
}

const calib: CalibSettings = loadCalib();

export function getCalibration() {
  return { ...calib };
}

export function saveCalibration(patch: Partial<CalibSettings>) {
  Object.assign(calib, patch);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CALIB_KEY, JSON.stringify(calib));
    } catch {
      /* storage disabled — keep in-memory value */
    }
  }
}

/* MediaPipe hand landmark index map (21 points) */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/* ------------------------------------------------------------------- hook */
interface Options {
  autoStart?: boolean;
  /** element used for the pointer fallback layer */
  pointerTarget?: React.RefObject<HTMLElement | null>;
}

export function useHandTracking({ autoStart = false, pointerTarget }: Options = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleRef = useRef<GestureSample>({
    present: false,
    x: 0.5,
    y: 0.6,
    pinch: false,
    pinchStrength: 0,
    handedness: null,
    source: "camera",
    size: 0,
    sizeVel: 0,
  });
  const debugRef = useRef<HandDebug>({
    present: false,
    hands: [],
    fps: 0,
    latencyMs: 0,
    lastVideoTime: -1,
    videoReady: false,
  });

  const [status, setStatus] = useState<TrackingStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState({ secure: true, embedded: false, hasMediaDevices: true });
  useEffect(() => {
    setDiagnostics({
      secure: typeof window !== "undefined" ? window.isSecureContext : true,
      embedded: typeof window !== "undefined" && window.self !== window.top,
      hasMediaDevices: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    });
  }, []);
  const [source, setSource] = useState<TrackingSource>("off");
  const [pinchUi, setPinchUi] = useState(0);
  const [calibPhase, setCalibPhase] = useState<"idle" | "open" | "pinch" | "done">("idle");
  const [calibProgress, setCalibProgress] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<{ close: () => void } | null>(null);
  const rafRef = useRef(0);
  const loopActiveRef = useRef(false);
  const pointerPinchRef = useRef(false);
  const mountedRef = useRef(true);
  const startedRef = useRef(false);
  const uiTickRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* --------------------------------------------------------- model loader */
  const loadLandmarker = useCallback(async () => {
    // OFFLINE: the WASM runtime and the hand model ship inside /public/mediapipe and are
    // precached by the service worker — no CDN or internet access is ever required.
    //
    // The library normally loads its wasm glue by injecting <script src=… crossOrigin=…>
    // and then has the wasm fetch itself. In kiosk/iframe previews that second round-trip
    // is the fragile step ("ModuleFactory not set."). So we pre-download BOTH files with
    // our own fetch (which lets us report exactly what failed), run the glue as an inline
    // script and hand the wasm bytes to the engine directly.
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");

    const jsUrl = vision.wasmLoaderPath;
    const wasmUrl = vision.wasmBinaryPath;
    const offlineHint =
      " You appear to be offline and the engine is not stored on this device yet — open the app once with internet and wait for the OFFLINE READY badge.";
    let jsRes;
    try {
      jsRes = await fetch(jsUrl, { cache: "no-store" });
    } catch {
      throw new Error(
        navigator.onLine
          ? "The tracking engine could not be loaded from the server. Reload the page and retry."
          : `The tracking engine could not be loaded.${offlineHint}`,
      );
    }
    if (!jsRes.ok) {
      throw new Error(`The tracking engine script is unavailable (${jsUrl} → HTTP ${jsRes.status}). Reload the page and retry.`);
    }
    const jsText = await jsRes.text();
    if (!jsText.includes("ModuleFactory")) {
      throw new Error(`The tracking engine script is corrupted (${jsUrl}). Reload the page and retry.`);
    }
    let wasmRes;
    try {
      wasmRes = await fetch(wasmUrl, { cache: "no-store" });
    } catch {
      throw new Error(
        navigator.onLine
          ? "The ~9 MB tracking engine could not be downloaded from the server. Reload the page and retry."
          : `The ~9 MB tracking engine is missing.${offlineHint}`,
      );
    }
    if (!wasmRes.ok) {
      throw new Error(`The ~9 MB tracking engine could not be downloaded (${wasmUrl} → HTTP ${wasmRes.status}). Reload the page and retry.`);
    }
    const wasmBytes = new Uint8Array(await wasmRes.arrayBuffer());
    const isWasm =
      wasmBytes.length > 1_000_000 && wasmBytes[0] === 0x00 && wasmBytes[1] === 0x61 && wasmBytes[2] === 0x73 && wasmBytes[3] === 0x6d;
    if (!isWasm) {
      throw new Error(
        `The tracking engine did not download completely (${(wasmBytes.length / 1048576).toFixed(1)} MB received, ~9.2 MB expected). Reload the page and retry.`,
      );
    }

    const g = globalThis as unknown as { Module?: unknown; ModuleFactory?: unknown };
    const armEngine = () => {
      g.Module = {
        wasmBinary: wasmBytes,
        locateFile: (p: string) => (p.endsWith(".wasm") ? wasmUrl : p),
      };
      // inline classic script → defines globalThis.ModuleFactory from verified bytes
      if (typeof g.ModuleFactory !== "function") {
        const s = document.createElement("script");
        s.textContent = jsText;
        document.body.appendChild(s);
        s.remove();
      }
      if (typeof g.ModuleFactory !== "function") {
        g.Module = undefined;
        throw new Error("The tracking engine script loaded but did not initialise. Reload the page and retry.");
      }
    };

    armEngine();

    let lastErr: unknown = null;
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        armEngine(); // the library re-injects its own script each attempt; keep our verified one armed
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { 
            modelAssetPath: "/mediapipe/hand_landmarker.task", 
            delegate :"CPU" === delegate ? "CPU" : "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.45,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
        g.Module = undefined; // the library clears ModuleFactory on success; drop our reference too
        return { landmarker, HandLandmarker };
      } catch (err) {
        lastErr = err;
      }
    }
    g.Module = undefined;
    throw lastErr instanceof Error ? lastErr : new Error("Hand model could not be created");
  }, []);

  /* ------------------------------------------------------------ detection */
  const detectLoop = useCallback(
    (landmarker: { detectForVideo: (v: HTMLVideoElement, ts: number) => unknown }) => {
      if (loopActiveRef.current) return; // never run two loops at once
      loopActiveRef.current = true;
      const state = {
        smoothX: 0.5,
        smoothY: 0.6,
        lastSeen: 0,
        frames: 0,
        fpsClock: performance.now(),
        pinchStable: false,
        pinchFrames: 0,
        // apparent hand size = depth cue (hand closer to the lens ⇒ bigger)
        sizeSmooth: 0,
        sizePrev: 0,
        sizePrevTs: 0,
        sizeVel: 0,
      };

      const step = () => {
        if (!loopActiveRef.current || !mountedRef.current) {
          loopActiveRef.current = false;
          return;
        }
        const video = videoRef.current;
        const now = performance.now();
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          debugRef.current.videoReady = true;
          if (video.currentTime !== debugRef.current.lastVideoTime) {
            debugRef.current.lastVideoTime = video.currentTime;
            const t0 = performance.now();
            let result: {
              landmarks?: { x: number; y: number; z: number }[][];
              handedness?: { categoryName: string }[][];
              handednesses?: { categoryName: string }[][];
            } = {};
            try {
              result = landmarker.detectForVideo(video, now) as typeof result;
            } catch {
              /* ignore a single bad frame */
            }
            debugRef.current.latencyMs = performance.now() - t0;
            state.frames += 1;
            if (now - state.fpsClock > 500) {
              debugRef.current.fps = Math.round((state.frames * 1000) / (now - state.fpsClock));
              state.frames = 0;
              state.fpsClock = now;
            }

            const hands = result.landmarks ?? [];
            const hns = result.handedness ?? result.handednesses ?? [];
            if (hands.length > 0) {
              // pick the hand with the largest apparent size (closest to camera)
              let bestIdx = 0;
              let bestSize = -1;
              hands.forEach((lm, i) => {
                const size = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
                if (size > bestSize) {
                  bestSize = size;
                  bestIdx = i;
                }
              });
              const lm = hands[bestIdx];
              const handSize = Math.max(
                0.0001,
                Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) + Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y) / 2,
              );
              const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
              const ratio = pinchDist / handSize;

              // palm-centre blended with the index fingertip for precise aiming
              const palm = { x: 0, y: 0 };
              for (const i of [0, 5, 9, 13, 17]) {
                palm.x += lm[i].x / 5;
                palm.y += lm[i].y / 5;
              }
              const rawX = (palm.x * 0.55 + lm[8].x * 0.45) * (calib.mirror ? -1 : 1) + (calib.mirror ? 1 : 0);
              const rawY = palm.y * 0.62 + lm[8].y * 0.38;

              const a = 0.42;
              state.smoothX = state.smoothX * (1 - a) + rawX * a;
              state.smoothY = state.smoothY * (1 - a) + rawY * a;
              state.lastSeen = now;

              // hysteresis + a couple of confirmation frames = no flicker
              const wantPinch = state.pinchStable ? ratio < calib.off : ratio < calib.on;
              if (wantPinch === state.pinchStable) {
                state.pinchFrames = 0;
              } else {
                state.pinchFrames += 1;
                if (state.pinchFrames >= (wantPinch ? PINCH.framesToGrab : 1)) {
                  state.pinchStable = wantPinch;
                  state.pinchFrames = 0;
                }
              }

              // apparent-size (depth) channel: hand toward the body shrinks,
              // a thrust at the lens grows — this drives pull-back & throw in the front view
              if (state.sizePrevTs === 0) {
                state.sizeSmooth = handSize;
                state.sizePrev = handSize;
              }
              state.sizeSmooth = state.sizeSmooth * 0.55 + handSize * 0.45;
              const dtS = Math.max(0.012, (now - state.sizePrevTs) / 1000);
              const rawSizeVel = (state.sizeSmooth - state.sizePrev) / dtS;
              state.sizeVel = Math.max(-3.5, Math.min(3.5, state.sizeVel * 0.5 + rawSizeVel * 0.5));
              state.sizePrev = state.sizeSmooth;
              state.sizePrevTs = now;

              const gain = calib.gain;
              sampleRef.current = {
                present: true,
                x: Math.max(0, Math.min(1, 0.5 + (state.smoothX - 0.5) * gain)),
                y: Math.max(0, Math.min(1, 0.5 + (state.smoothY - 0.5) * gain)),
                pinch: state.pinchStable,
                pinchStrength: Math.max(0, Math.min(1, 1 - ratio / Math.max(0.05, calib.off))),
                handedness: (hns[bestIdx]?.[0]?.categoryName as "Left" | "Right") ?? null,
                source: "camera",
                size: state.sizeSmooth,
                sizeVel: state.sizeVel,
              };
              debugRef.current.present = true;
              debugRef.current.hands = hands.map((l, i) => ({
                landmarks: l,
                handedness: (hns[i]?.[0]?.categoryName as "Left" | "Right") ?? "Right",
                pinchRatio: Math.hypot(l[4].x - l[8].x, l[4].y - l[8].y) / Math.max(0.0001, Math.hypot(l[0].x - l[9].x, l[0].y - l[9].y)),
              }));

              uiTickRef.current += 1;
              if (uiTickRef.current % 8 === 0 && mountedRef.current) {
                setPinchUi(sampleRef.current.pinchStrength);
                if (calibPhaseRef.current !== "idle") runCalibrationTick(ratio, state.pinchStable);
              }
            } else {
              debugRef.current.present = false;
              debugRef.current.hands = [];
              if (now - state.lastSeen > 240) {
                state.pinchStable = false;
                sampleRef.current = { ...sampleRef.current, present: false, pinch: false, handedness: null };
              }
            }
          }
        }
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [],
  );

  /* --------------------------------------------------------- calibration */
  const calibPhaseRef = useRef<"idle" | "open" | "pinch" | "done">("idle");
  const calibSamples = useRef<{ open: number[]; pinch: number[] }>({ open: [], pinch: [] });

  const runCalibrationTick = useCallback((ratio: number, pinching: boolean) => {
    const phase = calibPhaseRef.current;
    if (phase === "open") {
      calibSamples.current.open.push(ratio);
    } else if (phase === "pinch") {
      calibSamples.current.pinch.push(ratio);
    }
  }, []);

  const startCalibration = useCallback(async () => {
    if (status !== "ready") throw new Error("Start the camera before calibrating");
    calibSamples.current = { open: [], pinch: [] };
    setCalibPhase("open");
    calibPhaseRef.current = "open";
    setCalibProgress(0);
    await new Promise((r) => setTimeout(r, 2600));
    setCalibPhase("pinch");
    calibPhaseRef.current = "pinch";
    setCalibProgress(0.5);
    await new Promise((r) => setTimeout(r, 2600));
    const openAvg = calibSamples.current.open.length
      ? calibSamples.current.open.reduce((a, b) => a + b, 0) / calibSamples.current.open.length
      : 1.7;
    const pinchAvg = calibSamples.current.pinch.length
      ? calibSamples.current.pinch.reduce((a, b) => a + b, 0) / calibSamples.current.pinch.length
      : 0.25;
    const on = Math.max(0.2, Math.min(0.9, (openAvg + pinchAvg) / 2));
    const off = Math.max(on * 1.25, Math.min(1.2, on * 1.6));
    saveCalibration({ on, off });
    calibPhaseRef.current = "done";
    setCalibPhase("done");
    setCalibProgress(1);
    setTimeout(() => {
      calibPhaseRef.current = "idle";
      setCalibPhase("idle");
    }, 1400);
    return { on, off };
  }, [status]);

  /* -------------------------------------------------------------- camera */
  const stop = useCallback(() => {
    loopActiveRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
      } catch {
        /* noop */
      }
      v.srcObject = null;
    }
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        /* noop */
      }
      landmarkerRef.current = null;
    }
    startedRef.current = false;
    debugRef.current = { present: false, hands: [], fps: 0, latencyMs: 0, lastVideoTime: -1, videoReady: false };
    sampleRef.current = {
      present: false,
      x: 0.5,
      y: 0.6,
      pinch: false,
      pinchStrength: 0,
      handedness: null,
      source: sampleRef.current.source,
      size: 0,
      sizeVel: 0,
    };
    if (mountedRef.current) {
      setSource((prev) => (prev === "pointer" ? "pointer" : "off"));
      setStatus((prev) => (prev === "error" ? "error" : "off"));
    }
  }, []);

  /** Loads (or reloads) the hand model without tearing down a working camera preview. */
  const attachModel = useCallback(async () => {
    setModelStatus("loading");
    setModelError(null);
    try {
      if (landmarkerRef.current) {
        loopActiveRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        try {
          landmarkerRef.current.close();
        } catch {
          /* noop */
        }
        landmarkerRef.current = null;
      }
      const loaded = await Promise.race([
        loadLandmarker(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out while loading the hand-tracking model")), 25000),
        ),
      ]);
      if (!mountedRef.current) {
        loaded.landmarker.close();
        return false;
      }
      landmarkerRef.current = loaded.landmarker as unknown as { close: () => void };
      detectLoop(loaded.landmarker as unknown as { detectForVideo: (v: HTMLVideoElement, ts: number) => unknown });
      setModelStatus("ready");
      return true;
    } catch (err) {
      setModelStatus("error");
      setModelError(modelHint(err));
      return false;
    }
  }, [detectLoop, loadLandmarker]);

  /**
   * Ref callback used by every camera preview surface. Pages mount their own
   * <video>, so the live MediaStream has to be re-attached whenever a new one
   * appears — otherwise the preview is black after navigating.
   */
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    el.muted = true;
    el.playsInline = true;
    const stream = streamRef.current;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    }
  }, []);

  const start = useCallback(async () => {
    if (startedRef.current) {
      if (!streamRef.current) {
        setError(null);
        return;
      }
      void attachModel();
      return;
    }
    startedRef.current = true;
    setStatus("loading");
    setError(null);
    setSource("camera");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser cannot access a camera (getUserMedia missing). Use HTTPS or a supported browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        startedRef.current = false;
        return;
      }
      streamRef.current = stream;
      // the loop tolerates a not-yet-decoded video element, so don't block on it.
      // attachVideo() covers preview surfaces that mount later (page changes).
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
      }
      if (mountedRef.current) {
        setStatus("ready");
        setSource("camera");
      }
      void attachModel();
    } catch (err) {
      const message = humaniseCameraError(err, {
        insecure: !diagnostics.secure,
        embedded: diagnostics.embedded,
        noApi: !diagnostics.hasMediaDevices,
      });
      startedRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (mountedRef.current) {
        setError(message);
        setStatus("error");
        setModelStatus("idle");
      }
    }
  }, [attachModel, diagnostics.embedded, diagnostics.hasMediaDevices, diagnostics.secure]);

  /* ------------------------------------------------------ pointer fallback */
  const enablePointerFallback = useCallback(() => {
    stop();
    setSource("pointer");
    setStatus("ready");
    setError(null);
    const pLast = { y: 0.5, ts: performance.now() };
    const move = (e: PointerEvent) => {
      const target = pointerTarget?.current ?? document.body;
      const rect = target.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const y = (e.clientY - rect.top) / Math.max(1, rect.height);
      const tNow = performance.now();
      const dtP = Math.max(0.012, (tNow - pLast.ts) / 1000);
      const vyPointer = (y - pLast.y) / dtP; // >0 = dragging down = "pulling back"
      pLast.y = y;
      pLast.ts = tNow;
      sampleRef.current = {
        present: true,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        pinch: pointerPinchRef.current,
        pinchStrength: pointerPinchRef.current ? 1 : 0,
        handedness: "Right",
        source: "pointer",
        // pointer drag distance fakes the depth channel so the front view still works
        size: 0.16 + (pointerPinchRef.current ? Math.max(0, 0.5 - y) * 0.05 : 0),
        sizeVel: pointerPinchRef.current ? -vyPointer : 0,
      };
      debugRef.current.present = true;
      debugRef.current.fps = 60;
      uiTickRef.current += 1;
      if (uiTickRef.current % 8 === 0) setPinchUi(pointerPinchRef.current ? 1 : 0);
    };
    const down = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-no-gesture]")) return;
      pointerPinchRef.current = true;
      move(e);
      sampleRef.current = { ...sampleRef.current, pinch: true, pinchStrength: 1 };
    };
    const up = () => {
      pointerPinchRef.current = false;
      sampleRef.current = { ...sampleRef.current, pinch: false, pinchStrength: 0 };
    };
    const listeners: Array<[string, EventListener]> = [
      ["pointermove", move as EventListener],
      ["pointerdown", down as EventListener],
      ["pointerup", up as EventListener],
    ];
    for (const [ev, fn] of listeners) window.addEventListener(ev, fn);
    pointerCleanupRef.current = () => {
      for (const [ev, fn] of listeners) window.removeEventListener(ev, fn);
      pointerCleanupRef.current = null;
      pointerPinchRef.current = false;
      debugRef.current.present = false;
      sampleRef.current = { ...sampleRef.current, present: false, pinch: false };
    };
  }, [pointerTarget, stop]);

  const pointerCleanupRef = useRef<(() => void) | null>(null);

  const disablePointerFallback = useCallback(() => {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    sampleRef.current = { ...sampleRef.current, present: false, pinch: false };
    debugRef.current.present = false;
    setSource("off");
    setStatus("off");
  }, []);

  useEffect(() => {
    if (autoStart) void start();
    return () => {
      pointerCleanupRef.current?.();
      pointerCleanupRef.current = null;
      stop();
    };
  }, [autoStart, start, stop]);

  /** Retry: restart the camera if it died, otherwise just reload the tracking model. */
  const retry = useCallback(async () => {
    if (streamRef.current && startedRef.current) {
      await attachModel();
      return;
    }
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    stop();
    await start();
  }, [attachModel, start, stop]);


  return {
    videoRef,
    attachVideo,
    sampleRef,
    debugRef,
    status,
    error,
    modelStatus,
    modelError,
    diagnostics,
    source,
    pinchUi,
    calibPhase,
    calibProgress,
    calibration: calib,
    start,
    stop,
    retry,
    retryModel: attachModel,
    enablePointerFallback,
    disablePointerFallback,
    startCalibration,
  };
}

export type HandTrackingApi = ReturnType<typeof useHandTracking>;

function modelHint(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timed out/i.test(msg)) {
    return "The on-device hand model took too long to start. Press RETRY MODEL, or use pointer mode to keep playing.";
  }
  return `The camera works but the hand-tracking model failed to load (${msg.slice(0, 120)}). Retry, or switch to pointer mode.`;
}

function humaniseCameraError(
  err: unknown,
  flags: { insecure: boolean; embedded: boolean; noApi: boolean } = { insecure: false, embedded: false, noApi: false },
) {
  if (flags.noApi) {
    return "This context has no camera API (getUserMedia is unavailable). Open the app over HTTPS in a normal browser tab, or play in pointer mode.";
  }
  const e = err as { name?: string; message?: string };
  const name = e?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    const extra = flags.embedded
      ? " This page is running inside an embedded frame that has not been granted camera access — open it in a new tab (button below), or allow the camera for this site and retry."
      : " Allow camera access for this page in your browser settings, then retry.";
    return `Camera permission was denied.${extra}`;
  }
  if (flags.insecure) {
    return "The browser blocks cameras on non-HTTPS pages. Open this app over HTTPS or on localhost, then retry.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No usable camera was found. Connect a webcam and press RETRY.";
  }
  if (name === "NotReadableError") {
    return "The camera is busy or blocked by another application. Close the other app and press RETRY.";
  }
  return e?.message ? `Hand tracking could not start: ${e.message}` : "Hand tracking could not start. Check the camera connection, then retry.";
}
