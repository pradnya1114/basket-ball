"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface OfflineState {
  /** browser currently has a network connection */
  online: boolean;
  /** everything needed to play (incl. the hand-tracking engine) is stored on this device */
  ready: boolean;
  /** service workers unsupported / insecure origin — still playable while the page is open */
  unsupported: boolean;
  /** a storage pass is currently running */
  preparing: boolean;
  /** force: register SW, warm the tracking chunk, cache all loaded assets, verify engine files */
  prepare: () => Promise<void>;
}

type CoreStatus = { type?: string; missing?: string[] };

const CORE_URLS = [
  "/",
  "/brand/air-basketball-logo.png",
  "/mediapipe/hand_landmarker.task",
  "/mediapipe/wasm/vision_wasm_internal.js",
  "/mediapipe/wasm/vision_wasm_internal.wasm",
  "/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
];

/**
 * Registers the offline service worker (production only), caches every resource the
 * page loads (including the lazily loaded hand-tracking chunk), and reports whether
 * the whole game — hand tracking included — is stored on the device.
 */
export function useOffline(): OfflineState {
  const supported =
    typeof window !== "undefined" && "serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production";

  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const regPromise = useRef<Promise<ServiceWorkerRegistration | null> | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    if (!supported) setUnsupported(true);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [supported]);

  const ensureRegistered = useCallback(async () => {
    if (!supported) return null;
    if (!regPromise.current) {
      regPromise.current = navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
    }
    return regPromise.current;
  }, [supported]);

  /** Ask the service worker to fill any gaps and report which engine files are still missing. */
  const queryCore = useCallback((timeoutMs = 45_000): Promise<string[]> => {
    return new Promise((resolve) => {
      const swReg = navigator.serviceWorker;
      const worker = swReg.controller;
      const timer = setTimeout(() => {
        swReg.removeEventListener("message", onMsg);
        resolve(CORE_URLS); // assume everything missing if the SW never answered
      }, timeoutMs);
      const onMsg = (e: MessageEvent) => {
        const d = e.data as CoreStatus;
        if (d?.type !== "CORE_STATUS") return;
        clearTimeout(timer);
        swReg.removeEventListener("message", onMsg);
        resolve(d.missing ?? []);
      };
      swReg.addEventListener("message", onMsg);
      if (worker) {
        worker.postMessage({ type: "ENSURE_CORE", urls: CORE_URLS });
      } else {
        clearTimeout(timer);
        swReg.removeEventListener("message", onMsg);
        resolve(CORE_URLS);
      }
    });
  }, []);

  const prepare = useCallback(async () => {
    if (!supported) return;
    setPreparing(true);
    try {
      const reg = await ensureRegistered();
      if (!reg) {
        setUnsupported(true);
        return;
      }
      await navigator.serviceWorker.ready;
      // warm the lazily loaded tracking chunk so it shows up in the resource list (and in the cache)
      await import("@mediapipe/tasks-vision").catch(() => undefined);
      const urls = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .filter((u) => u.startsWith(location.origin));
      reg.active?.postMessage({ type: "CACHE_URLS", urls });
      const missing = await queryCore();
      setReady(missing.length === 0);
    } finally {
      setPreparing(false);
    }
  }, [ensureRegistered, queryCore, supported]);

  // run one storage pass automatically in production
  useEffect(() => {
    if (supported) void prepare();
  }, [prepare, supported]);

  return { online, ready, unsupported, preparing, prepare };
}
