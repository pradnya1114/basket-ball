"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GamePage } from "@/components/GamePage";
import { ResultsPage } from "@/components/ResultsPage";
import { RulesPage } from "@/components/RulesPage";
import { WelcomePage } from "@/components/WelcomePage";
import { sfx } from "@/game/audio";
import { useHandTracking } from "@/hooks/useHandTracking";
import { useOffline } from "@/hooks/useOffline";
import {
  clearLeaderboard,
  downloadSnapshot,
  exportHistory,
  getPersonalBest,
  makeRecordKey,
  readLeaderboard,
  submitResult,
  type LeaderEntry,
} from "@/lib/leaderboard";
import { newSessionId, type MatchResult, type Page, type PlayerResult, type Session } from "@/lib/types";

/**
 * AIR BASKETBALL — single player, fully offline.
 * Flow: Welcome → How to play → Game (60s) → Results + Top 10.
 */
export default function AirBasketballApp() {
  const [page, setPage] = useState<Page>("welcome");
  const [session, setSession] = useState<Session>({ mode: "single", players: [""], sessionId: newSessionId() });
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const tracking = useHandTracking({ pointerTarget: playfieldRef });
  const offline = useOffline();
  const recordedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setEntries(readLeaderboard());
  }, []);

  /* ------------------------------------------- camera only on rules + game --- */
  const cameraForPage = useRef<Page | null>(null);
  useEffect(() => {
    if (page === "rules" || page === "game") {
      if (cameraForPage.current !== page) {
        cameraForPage.current = page;
        if (tracking.status === "off") void tracking.start();
      }
    } else if (cameraForPage.current !== null) {
      cameraForPage.current = null;
      tracking.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  /* -------------------------------------------------------------- flow --- */
  const startSession = useCallback((name: string) => {
    sfx.resume();
    setSession({ mode: "single", players: [name], sessionId: newSessionId() });
    setMatch(null);
    setSaveError(null);
    setNotice(null);
    setPage("rules");
  }, []);

  const finishRound = useCallback(
    async (results: PlayerResult[]) => {
      const key = session.sessionId;
      const r = results[0];
      if (!r || recordedRef.current.has(key)) return; // record exactly once
      recordedRef.current.add(key);

      const previousBest = getPersonalBest(r.name);
      const res = await submitResult({
        recordKey: makeRecordKey(r.name, key),
        name: r.name,
        score: r.score,
        shotsMade: r.shotsMade,
        shotsTaken: r.shotsTaken,
        accuracy: Math.round(r.accuracy * 10) / 10,
        bestStreak: r.bestStreak,
        threes: r.threes,
        durationSec: r.durationSec,
      });
      const isNewBest = r.score > 0 && r.score > previousBest;
      setEntries(res.entries);
      setMatch({
        mode: "single",
        player: { ...r, rank: res.rank },
        previousBest,
        isNewBest,
        playedAt: Date.now(),
      });
      setSaveError(res.ok ? null : "Device storage is full or blocked — this score could not be kept.");
      setPage("results");
      if (isNewBest) sfx.win();
    },
    [session.sessionId],
  );

  const restart = useCallback(() => {
    setSession((s) => ({ ...s, sessionId: newSessionId() }));
    setMatch(null);
    setSaveError(null);
    setNotice(null);
    setPage("game");
  }, []);

  const resetBoard = useCallback(async () => {
    const { ok, entries: list } = await clearLeaderboard();
    setEntries(list);
    setNotice(ok ? "Leaderboard reset — all scores on this device were cleared." : "Could not clear device storage.");
  }, []);

  const saveData = useCallback(() => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const fileName = `air-basketball-${stamp}.json`;
    let calibration: unknown = undefined;
    if (typeof window !== "undefined") {
      try {
        const calibRaw = window.localStorage.getItem("air-basketball.calibration.v1");
        if (calibRaw) calibration = JSON.parse(calibRaw);
      } catch {
        // ignore
      }
    }
    const ok = downloadSnapshot(
      {
        app: "AIR BASKETBALL",
        exportedAt: new Date().toISOString(),
        top10: entries,
        history: exportHistory(),
        lastRun: match,
        calibration,
      },
      fileName,
    );
    setNotice(ok ? `All user data saved as ${fileName}.` : "Download was blocked by the browser.");
  }, [entries, match]);

  /* ------------------------------------------------------------ render --- */
  return (
    <div className="relative h-[100dvh] min-h-[100svh] w-screen overflow-hidden bg-[#04070f] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/air-basketball-logo.png"
        alt="AIR BASKETBALL logo"
        className="pointer-events-none absolute left-3 top-3 z-50 h-[clamp(42px,7vh,64px)] w-auto object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.95)] sm:left-5 sm:top-4 sm:h-[clamp(48px,7vh,72px)]"
      />
      <div key={page === "game" ? `game-${session.sessionId}` : page} className="page-enter h-full w-full">
        {page === "welcome" ? (
          <WelcomePage initialName={session.players[0]} offline={offline} onStart={startSession} />
        ) : null}

        {page === "rules" ? (
          <RulesPage
            tracking={tracking}
            playfieldRef={playfieldRef}
            playerName={session.players[0] || "PLAYER"}
            onBack={() => setPage("welcome")}
            onPlay={() => {
              setMatch(null);
              setPage("game");
            }}
          />
        ) : null}

        {page === "game" ? (
          <GamePage
            session={session}
            tracking={tracking}
            playfieldRef={playfieldRef}
            onExit={() => setPage("rules")}
            onFinish={(results) => void finishRound(results)}
          />
        ) : null}

        {page === "results" && match ? (
          <ResultsPage
            match={match}
            entries={entries}
            saveError={saveError}
            notice={notice}
            offline={offline}
            onNoticeDismiss={() => setNotice(null)}
            onResetBoard={() => void resetBoard()}
            onSaveData={saveData}
            onRestart={() => {
              setSession({ mode: "single", players: [""], sessionId: newSessionId() });
              setMatch(null);
              setSaveError(null);
              setNotice(null);
              setPage("welcome");
            }}
            onPlayAgain={restart}
            onChangePlayer={() => {
              setMatch(null);
              setPage("welcome");
            }}
            onHowTo={() => setPage("rules")}
          />
        ) : null}

        {page === "results" && !match ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4">
            <p className="text-2xl font-black uppercase tracking-[0.2em] text-slate-300">No result to show</p>
            <button
              className="rounded-xl border border-white/20 px-6 py-3 font-black uppercase tracking-[0.14em]"
              onClick={() => setPage("welcome")}
            >
              Back to start
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
