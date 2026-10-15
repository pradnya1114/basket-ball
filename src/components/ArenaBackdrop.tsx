"use client";

/** Pure-CSS animated arena backdrop used by the menu / rules / results pages. */
export function ArenaBackdrop({ dim = false }: { dim?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#12335e_0%,#0a1730_38%,#04070f_78%)]" />

      {/* stadium light rigs */}
      <div className="absolute inset-x-0 top-0 flex justify-center gap-[9vw]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-6 w-24 rounded-b-xl bg-slate-800/90 shadow-[0_0_28px_rgba(120,200,255,0.35)]" />
            <div
              className="beam h-[70vh] w-[26vw]"
              style={{ animationDelay: `${i * 0.9}s`, transformOrigin: "top center" }}
            />
          </div>
        ))}
      </div>

      {/* crowd silhouette */}
      <div className="crowd absolute inset-x-0 top-[16vh] h-[26vh] opacity-70" />
      <div className="absolute inset-x-0 top-[40vh] h-[3px] bg-[linear-gradient(90deg,transparent,rgba(255,159,28,0.75),transparent)] blur-[1px]" />

      {/* floating basketballs */}
      {BALLS.map((b, i) => (
        <div
          key={i}
          className="float-ball absolute"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: b.size,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
            opacity: b.opacity,
          }}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full spin-ball" style={{ animationDuration: `${b.spin}s` }}>
            <defs>
              <radialGradient id={`bg${i}`} cx="35%" cy="30%">
                <stop offset="0%" stopColor="#ffbe7a" />
                <stop offset="55%" stopColor="#f97e1b" />
                <stop offset="100%" stopColor="#a63f06" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill={`url(#bg${i})`} />
            <g stroke="rgba(50,16,2,0.8)" strokeWidth="3.5" fill="none">
              <circle cx="50" cy="50" r="46" />
              <path d="M4 50h92M50 4v92" />
              <path d="M14 18c22 18 22 46 0 64M86 18c-22 18-22 46 0 64" />
            </g>
          </svg>
        </div>
      ))}

      {/* hoop silhouette on the right */}
      <svg viewBox="0 0 220 260" className="absolute -right-4 bottom-[14vh] h-[46vh] w-auto opacity-70">
        <rect x="150" y="0" width="14" height="260" fill="rgba(20,34,56,0.9)" />
        <rect x="60" y="24" width="96" height="72" rx="6" fill="rgba(150,215,255,0.16)" stroke="rgba(190,232,255,0.65)" strokeWidth="4" />
        <rect x="76" y="52" width="42" height="34" fill="none" stroke="#ff8a2b" strokeWidth="5" />
        <path d="M40 100h74" stroke="#ff7a18" strokeWidth="9" strokeLinecap="round" />
        <path d="M46 104l8 40M104 104l-6 40M75 104v42" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
      </svg>

      {/* drifting particles */}
      <div className="absolute inset-0">
        {DUST.map((d, i) => (
          <span
            key={i}
            className="dust absolute block rounded-full bg-sky-200/40"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(75%_60%_at_50%_45%,transparent_35%,rgba(2,5,12,0.78)_100%)]" />
      {dim ? <div className="absolute inset-0 bg-slate-950/55" /> : null}
    </div>
  );
}

const BALLS = [
  { left: 6, top: 22, size: 74, dur: 9, delay: 0, opacity: 0.5, spin: 7 },
  { left: 17, top: 62, size: 46, dur: 11, delay: 1.4, opacity: 0.36, spin: 9 },
  { left: 33, top: 14, size: 32, dur: 8, delay: 0.6, opacity: 0.3, spin: 6 },
  { left: 48, top: 70, size: 58, dur: 12, delay: 2.1, opacity: 0.4, spin: 11 },
  { left: 69, top: 30, size: 40, dur: 10, delay: 0.9, opacity: 0.3, spin: 8 },
  { left: 87, top: 66, size: 66, dur: 13, delay: 1.1, opacity: 0.34, spin: 12 },
];

const DUST = Array.from({ length: 34 }).map((_, i) => ({
  left: (i * 37) % 100,
  top: (i * 53) % 100,
  size: 2 + ((i * 7) % 4),
  dur: 9 + ((i * 3) % 11),
  delay: (i % 9) * 0.8,
}));
