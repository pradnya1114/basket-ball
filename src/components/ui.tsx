"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { sfx } from "@/game/audio";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-slate-950 bg-[linear-gradient(180deg,#ffd166_0%,#ff9f1c_45%,#ff6b00_100%)] border-amber-200/70 shadow-[0_10px_0_-2px_rgba(180,71,8,0.85),0_18px_40px_-12px_rgba(255,145,26,0.7)] hover:brightness-110",
  secondary:
    "text-sky-50 bg-[linear-gradient(180deg,rgba(30,86,150,0.95),rgba(11,32,60,0.95))] border-sky-300/40 shadow-[0_8px_0_-2px_rgba(8,28,54,0.9),0_16px_32px_-14px_rgba(56,189,248,0.5)] hover:border-sky-200/70",
  ghost: "text-sky-100 bg-white/5 border-white/15 hover:bg-white/10",
  danger:
    "text-white bg-[linear-gradient(180deg,#ff6b6b,#c9184a)] border-rose-200/50 shadow-[0_8px_0_-2px_rgba(120,10,40,0.9)] hover:brightness-110",
};

const SIZES: Record<Size, string> = {
  sm: "px-4 py-2 text-base",
  md: "px-7 py-3 text-xl",
  lg: "px-10 py-4 text-2xl md:text-3xl",
};

export function ArcadeButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        sfx.ui();
        onClick?.(e);
      }}
      className={`group relative inline-flex items-center justify-center gap-3 rounded-2xl border font-black uppercase tracking-[0.14em] transition-all duration-150 active:translate-y-1 active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = "info",
  className = "",
}: {
  children: ReactNode;
  tone?: "good" | "bad" | "info" | "warn";
  className?: string;
}) {
  const tones = {
    good: "border-emerald-300/50 bg-emerald-400/15 text-emerald-200",
    bad: "border-rose-300/50 bg-rose-500/15 text-rose-200",
    info: "border-sky-300/40 bg-sky-400/10 text-sky-100",
    warn: "border-amber-300/50 bg-amber-400/15 text-amber-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-[linear-gradient(160deg,rgba(12,26,48,0.92),rgba(4,10,20,0.94))] backdrop-blur-sm ${
        glow ? "shadow-[0_0_60px_-18px_rgba(255,145,26,0.55)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function StatBox({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "hot" | "good" | "cool";
}) {
  const tones = {
    default: "text-white",
    hot: "text-amber-300",
    good: "text-emerald-300",
    cool: "text-sky-300",
  } as const;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 px-4 py-2.5 text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-200/60">{label}</div>
      <div className={`text-3xl font-black leading-tight tabular-nums ${tones[tone]}`}>{value}</div>
      {hint ? <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{hint}</div> : null}
    </div>
  );
}

export function IconHand({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.8a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V6.3a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.6a5 5 0 0 1-3.9-1.9L5 14.5a1.6 1.6 0 0 1 2.4-2.1L9 14V7.5a1.5 1.5 0 0 1 3 0" />
    </svg>
  );
}

export function IconCamera({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a1.5 1.5 0 0 0 1.2-.6l.7-1a1.5 1.5 0 0 1 1.2-.6h2.6a1.5 1.5 0 0 1 1.2.6l.7 1a1.5 1.5 0 0 0 1.2.6h1.8A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  );
}

export function IconBall({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M2.8 12h18.4M12 2.8v18.4M4.6 5.2C8 8 8 16 4.6 18.8M19.4 5.2C16 8 16 16 19.4 18.8" />
    </svg>
  );
}

export function IconHoop({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M4 4h9v7H4z" />
      <path d="M6 11h6l-.8 3.4a2.4 2.4 0 0 1-2.3 1.8h-.9a2.4 2.4 0 0 1-2.3-1.8z" />
      <path d="M13 8h4.5A2.5 2.5 0 0 1 20 10.5V21" />
    </svg>
  );
}
