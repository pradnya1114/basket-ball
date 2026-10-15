import {
  BALL_R,
  BALL_SPAWN,
  COURT_FLOOR_Y,
  HAND_ZONE,
  HOOP,
  SHOT,
  THREE_PT_X,
  TIMING,
  WORLD,
  clamp,
  lerp,
} from "./constants";
import { createShotTrack, idealSpeedFor, predictsMake, simulateTrajectory, stepBall, type Ball, type ShotTrack } from "./physics";
import {
  drawAimGuide,
  drawArena,
  drawBall,
  drawBallShadow,
  drawCalibrationFrame,
  drawCourt,
  drawFloatTexts,
  drawGrabZone,
  drawHandCursor,
  drawHoopBack,
  drawHoopFront,
  drawNet,
  drawPausedOverlay,
  drawPowerMeter,
  drawTargetHighlight,
  drawTrail,
  drawVignette,
  drawParticles,
  type Ctx,
  type FloatText,
  type Particle,
  type TrailPoint,
} from "./render";
import { sfx } from "./audio";
import {
  F,
  computeFrontLaunch,
  drawFrontBall,
  drawFrontFloor,
  drawFrontGuide,
  drawFrontHoop,
  drawFrontPower,
  drawFrontTarget,
  frontPath,
  frontPredictsMake,
  project,
  stepFront,
  type FrontBall,
} from "./front";

export interface GestureSample {
  /** latest tracked hand, in normalized (mirrored) camera space */
  present: boolean;
  x: number;
  y: number;
  pinch: boolean;
  pinchStrength: number;
  handedness: "Left" | "Right" | null;
  source: "camera" | "pointer";
  /** apparent hand size (wrist→knuckle span, normalised) — the depth cue */
  size: number;
  /** rate of change of that size: negative = pulling toward the body */
  sizeVel: number;
}

export const EMPTY_GESTURE: GestureSample = {
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

export type BallState = "idle" | "held" | "flying" | "dead";

export interface LiveStats {
  score: number;
  shotsMade: number;
  shotsTaken: number;
  streak: number;
  bestStreak: number;
  threes: number;
  multiplier: number;
  timeLeft: number;
  running: boolean;
  ballState: BallState;
  charge: number;
  tracking: boolean;
  hand: "Left" | "Right" | null;
  source: "camera" | "pointer";
  canGrab: boolean;
  fps: number;
  lastMessage: string;
}

export interface EngineEvents {
  onStats?: (stats: LiveStats) => void;
  onScore?: (payload: { points: number; kind: "two" | "three"; swish: boolean; streak: number }) => void;
  onShotEnd?: (made: boolean, shot: ShotTrack) => void;
  onTimeEnd?: () => void;
  onMessage?: (text: string, tone: "good" | "bad" | "info") => void;
}

export interface EngineConfig {
  practice: boolean;
  durationSec: number;
  playerName: string;
  showCursor: boolean;
  calibrationFrame: boolean;
  /** "front" = look down the court and throw into the screen (default) */
  view: "front" | "side";
}

const DEFAULT_CONFIG: EngineConfig = {
  practice: false,
  durationSec: TIMING.singlePlayerSec,
  playerName: "PLAYER",
  showCursor: true,
  calibrationFrame: false,
  view: "front",
};

export class AirBasketballEngine {
  private canvas: HTMLCanvasElement;
  private ctx: Ctx;
  private raf = 0;
  private running = false;
  private lastTs = 0;
  private acc = 0;
  private time = 0;
  private scale = 1;
  private frameCount = 0;
  private fps = 60;

  private ball: Ball = { x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0, spin: 0, angle: 0 };
  /** front-facing (into the screen) ball state, in arcade metres */
  private fb: FrontBall = { x: 0, y: 1.28, z: F.holdZ, vx: 0, vy: 0, vz: 0, spin: 0, angle: 0 };
  private grabSize = 0;
  private readonly FRONT_ANCHOR = { x: 660, y: 655 };
  private get frontMode() {
    return this.config.view === "front";
  }
  private hoopScreen() {
    return this.frontMode ? project(0, F.rimY, F.rimZ) : { sx: HOOP.rimCenterX, sy: HOOP.rimY, s: 1 };
  }
  private state: BallState = "idle";
  private shot: ShotTrack | null = null;
  /** only shots launched by a real throw can score or count as an attempt */
  private shotOfficial = false;
  private grabAnchor = { x: 0, y: 0 };
  private grabOffset = { x: 0, y: 0 };
  private charge = 0;
  private lockout = 0;
  private deadTimer = 0;
  private popIn = 0;

  private hand = { x: 0.5, y: 0.6, vx: 0, vy: 0, pinch: false, present: false, smoothX: 0.5, smoothY: 0.6 };
  private lastHandWorld = { x: 0, y: 0 };
  private hasHandHistory = false;
  private noHandMs = 0;
  private previewMake = false;
  private sweetSpot = -1;
  private sweetScan = 0;

  private trail: TrailPoint[] = [];
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private netSwing = 0;
  private hoopFlash = 0;
  private hype = 0;
  private shake = 0;

  private stats = {
    score: 0,
    shotsMade: 0,
    shotsTaken: 0,
    streak: 0,
    bestStreak: 0,
    threes: 0,
    multiplier: 1,
    lastMessage: "",
  };
  private timeLeft = TIMING.singlePlayerSec;
  private running_clock = false;
  private timeEndFired = false;
  private frozen = false;

  config: EngineConfig = { ...DEFAULT_CONFIG };
  readGesture: () => GestureSample = () => EMPTY_GESTURE;
  events: EngineEvents = {};
  private lastStatsPush = 0;

  constructor(canvas: HTMLCanvasElement, events: EngineEvents = {}, config: Partial<EngineConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.events = events;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.timeLeft = config.durationSec ?? TIMING.singlePlayerSec;
    this.resize();
  }

  /* ------------------------------------------------------------ lifecycle */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private dpr = 1;
  private offsetX = 0;
  private offsetY = 0;
  private cssW: number = WORLD.w;
  private cssH: number = WORLD.h;

  /** Uniform world→screen scale with letterboxing so any container size works. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(180, Math.round(rect.height || w * (WORLD.h / WORLD.w)));
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scale = Math.min(w / WORLD.w, h / WORLD.h);
    this.offsetX = (w - WORLD.w * this.scale) / 2;
    this.offsetY = (h - WORLD.h * this.scale) / 2;
    this.applyTransform();
    this.ctx.imageSmoothingEnabled = true;
  }

  private applyTransform() {
    const s = this.scale * this.dpr;
    this.ctx.setTransform(s, 0, 0, s, this.offsetX * this.dpr, this.offsetY * this.dpr);
  }

  setConfig(patch: Partial<EngineConfig>) {
    this.config = { ...this.config, ...patch };
  }

  /* --------------------------------------------------------------- rounds */
  startRound(durationSec = this.config.durationSec) {
    this.timeLeft = durationSec;
    this.config.durationSec = durationSec;
    this.running_clock = true;
    this.timeEndFired = false;
    this.frozen = false;
    this.resetBall(true);
    this.pushStats(true);
  }

  pauseRound() {
    this.running_clock = false;
  }

  resumeRound() {
    if (this.timeLeft > 0 && !this.timeEndFired) this.running_clock = true;
  }

  endRound() {
    this.running_clock = false;
    this.timeEndFired = true;
    this.frozen = true;
    this.forceRelease(false);
  }

  setFrozen(frozen: boolean) {
    this.frozen = frozen;
    if (frozen) this.forceRelease(false);
  }

  resetStats() {
    this.stats = {
      score: 0,
      shotsMade: 0,
      shotsTaken: 0,
      streak: 0,
      bestStreak: 0,
      threes: 0,
      multiplier: 1,
      lastMessage: "",
    };
    this.resetBall(true);
    this.pushStats(true);
  }

  resetBall(hard = false) {
    this.state = "idle";
    this.shot = null;
    this.shotOfficial = false;
    this.charge = 0;
    this.trail = [];
    this.ball = this.frontMode
      ? { x: this.FRONT_ANCHOR.x, y: this.FRONT_ANCHOR.y, vx: 0, vy: 0, spin: 0, angle: 0 }
      : { x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0, spin: 0, angle: 0 };
    if (this.frontMode) {
      this.fb = { x: 0, y: 1.28, z: F.holdZ, vx: 0, vy: 0, vz: 0, spin: 0, angle: this.fb.angle };
    }
    this.popIn = hard ? 1 : 0;
    if (hard) this.lockout = TIMING.shotLockoutMs / 1000;
  }

  getStats(): LiveStats {
    return {
      score: this.stats.score,
      shotsMade: this.stats.shotsMade,
      shotsTaken: this.stats.shotsTaken,
      streak: this.stats.streak,
      bestStreak: this.stats.bestStreak,
      threes: this.stats.threes,
      multiplier: this.stats.multiplier,
      timeLeft: this.timeLeft,
      running: this.running_clock,
      ballState: this.state,
      charge: this.charge,
      tracking: this.hand.present,
      hand: this.currentHandedness,
      source: this.lastSource,
      canGrab: this.state === "idle" && this.lockout <= 0 && !this.frozen,
      fps: this.fps,
      lastMessage: this.stats.lastMessage,
    };
  }

  private currentHandedness: "Left" | "Right" | null = null;
  private lastSource: "camera" | "pointer" = "camera";

  /* -------------------------------------------------------------- helpers */
  private toWorld(nx: number, ny: number) {
    const zx = (nx - HAND_ZONE.xFrom) / (HAND_ZONE.xTo - HAND_ZONE.xFrom);
    const zy = (ny - HAND_ZONE.yFrom) / (HAND_ZONE.yTo - HAND_ZONE.yFrom);
    return {
      x: lerp(HAND_ZONE.worldMinX, HAND_ZONE.worldMaxX, clamp(zx, 0, 1)),
      y: lerp(HAND_ZONE.worldMinY, HAND_ZONE.worldMaxY, clamp(zy, 0, 1)),
    };
  }

  private spawnParticles(x: number, y: number, count: number, colors: string[], power = 1, shape: Particle["shape"] = "dot") {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = (60 + Math.random() * 320) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60 * power,
        life: 0.5 + Math.random() * 0.7,
        maxLife: 1.1,
        size: 3 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: shape === "shard" ? 620 : 300,
        shape,
      });
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
  }

  private floatText(text: string, x: number, y: number, color: string, size = 62) {
    this.texts.push({ text, x: clamp(x, 200, WORLD.w - 200), y, life: 1.5, maxLife: 1.5, color, size, vy: -58 });
    if (this.texts.length > 12) this.texts.shift();
  }

  private message(text: string, tone: "good" | "bad" | "info") {
    this.stats.lastMessage = text;
    this.events.onMessage?.(text, tone);
    this.pushStats(true);
  }

  private pushStats(force = false) {
    const now = performance.now();
    if (!force && now - this.lastStatsPush < 90) return;
    this.lastStatsPush = now;
    this.events.onStats?.(this.getStats());
  }

  /* ----------------------------------------------------------- gesture fsm */
  private updateTracking(g: GestureSample, dt: number) {
    this.lastSource = g.source;
    this.currentHandedness = g.handedness;
    const was = this.hand.present;
    this.hand.present = g.present;
    if (!g.present) {
      this.noHandMs += dt * 1000;
      this.hasHandHistory = false;
      this.hand.vx = 0;
      this.hand.vy = 0;
      // lost the hand while holding it → drop it gently, never fire a shot
      if (this.state === "held" && this.noHandMs > 700) {
        this.forceRelease(true);
        this.message("TRACKING LOST — BALL DROPPED", "bad");
      }
      return;
    }
    if (!was) this.noHandMs = 0;
    this.noHandMs = 0;

    const target = this.toWorld(g.x, g.y);
    const a = clamp(dt * 16, 0.08, 1);
    this.hand.smoothX = lerp(this.hand.smoothX, target.x, a);
    this.hand.smoothY = lerp(this.hand.smoothY, target.y, a);
    this.hand.x = this.hand.smoothX;
    this.hand.y = this.hand.smoothY;

    if (this.hasHandHistory && dt > 0) {
      const rawVx = (this.hand.x - this.lastHandWorld.x) / dt;
      const rawVy = (this.hand.y - this.lastHandWorld.y) / dt;
      const k = SHOT.smoothing;
      this.hand.vx = clamp(lerp(this.hand.vx, rawVx, k), -3200, 3200);
      this.hand.vy = clamp(lerp(this.hand.vy, rawVy, k), -3200, 3200);
    }
    this.lastHandWorld = { x: this.hand.x, y: this.hand.y };
    this.hasHandHistory = true;

    this.hand.pinch = g.pinch;

    this.lastSize = g.size || 0;
    this.lastSizeVel = g.sizeVel || 0;

    if (this.state === "idle" && this.lockout <= 0 && !this.frozen && g.pinch) {
      const d = Math.hypot(this.ball.x - this.hand.x, this.ball.y - this.hand.y);
      const relax = this.config.practice || this.frontMode;
      const near = d < (relax ? SHOT.grabDistance * 1.45 : SHOT.grabDistance);
      if (near) {
        this.state = "held";
        this.grabAnchor = { x: this.hand.x, y: this.hand.y };
        this.grabOffset = {
          x: clamp(this.ball.x - this.hand.x, -70, 70),
          y: clamp(this.ball.y - this.hand.y, -70, 70),
        };
        this.grabSize = this.lastSize;
        this.charge = 0;
        this.ball.vx = 0;
        this.ball.vy = 0;
        sfx.grab();
      }
    }

    if (this.state === "held") {
      const bx = clamp(this.hand.x + this.grabOffset.x, BALL_R, HAND_ZONE.worldMaxX);
      const by = clamp(this.hand.y + this.grabOffset.y, 90, COURT_FLOOR_Y - BALL_R * 0.4);
      this.ball.x = bx;
      this.ball.y = by;
      this.ball.vx = this.hand.vx;
      this.ball.vy = this.hand.vy;
      this.ball.spin = lerp(this.ball.spin, -this.hand.vx / 900, 0.2);
      this.ball.angle += (this.hand.vx / 1200) * 0.05;

      if (this.frontMode) {
        // lateral aim from the hand sweep, release height from how high the hand is
        this.fb.x = clamp((this.hand.x - this.FRONT_ANCHOR.x) / 300, -1.7, 1.7) * 0.52;
        this.fb.y = clamp(1.3 + (this.FRONT_ANCHOR.y - this.hand.y) / 235, 0.8, 2.15);
        this.fb.z = F.holdZ;
        this.fb.angle += this.hand.vx / 60000;
      }

      const back = Math.max(0, this.grabAnchor.x - this.hand.x);
      const down = Math.max(0, this.hand.y - this.grabAnchor.y);
      const raw = (back / SHOT.pullBackRangeX) * 0.72 + (down / SHOT.pullBackRangeY) * 0.28;
      // depth channel: shrinking apparent size = hand pulled toward the body = charged
      const sizePull =
        this.grabSize > 0.004 ? clamp((this.grabSize - this.lastSize) / (this.grabSize * 0.3), 0, 1) : 0;
      this.charge = clamp(Math.max(raw, this.frontMode ? sizePull : 0, this.charge * 0.985), 0, 1);

      if (!g.pinch) this.release();
    }
  }

  private lastSize = 0;
  private lastSizeVel = 0;

  /**
   * Launch vector from the current charge + hand movement.
   * Shared by the live preview and the real release so what you see is what you get.
   */
  private computeLaunch(charge: number, vx: number, vy: number) {
    const bx = this.ball.x;
    const by = this.ball.y;
    const toTarget = Math.atan2(Math.max(0, by - (HOOP.rimY - 6)), Math.max(60, HOOP.rimCenterX - bx));
    const nudge = clamp(vy / 3000, -SHOT.angleNudge, SHOT.angleNudge);
    const angle = clamp(Math.max(SHOT.arcAngle, toTarget + SHOT.closeArcBoost) - nudge, SHOT.minArc, SHOT.maxArc);
    const ideal = idealSpeedFor(bx, by, angle);
    const reference = ideal === null ? SHOT.speedRef : lerp(SHOT.speedRef, ideal, SHOT.distanceAssist);
    const flick = clamp(Math.hypot(vx, Math.min(0, vy)) / SHOT.flickDivisor, 0, 1);
    const chargeEff = clamp(charge + flick * SHOT.flickWeight, 0, 1.1);
    const speed = clamp(reference * (SHOT.powerAtZero + SHOT.powerSpan * chargeEff), SHOT.speedFloor, SHOT.speedCeiling);
    return { vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed, angle, speed };
  }

  private release() {
    const vx = this.hand.vx;
    const vy = this.hand.vy;
    // a forward hand movement OR a hand thrust toward the lens (growing apparent size)
    const forward = vx > SHOT.minReleaseVx || (this.frontMode && this.lastSizeVel > 0.42);
    const charged = this.charge > SHOT.minCharge;
    if (!forward && !charged) {
      // simple "let go" — drop the ball, no shot counted
      this.forceRelease(true);
      return;
    }
    const power = this.charge;
    this.state = "flying";
    if (this.frontMode) {
      const l = computeFrontLaunch({ x: this.fb.x, y: this.fb.y, z: this.fb.z }, power, vx / 900);
      this.fb.vx = l.vx;
      this.fb.vy = l.vy;
      this.fb.vz = l.vz;
      this.fb.spin = 5 + power * 7;
      this.shot = createShotTrack(this.ball.x, power);
    } else {
      const launch = this.computeLaunch(power, vx, vy);
      this.ball.vx = launch.vx;
      this.ball.vy = launch.vy;
      this.ball.spin = -Math.abs(launch.vx) / 520;
      this.shot = createShotTrack(this.ball.x, power);
    }
    this.shotOfficial = true;
    this.stats.shotsTaken += 1;
    this.charge = 0;
    this.trail = [];
    sfx.whoosh();
    this.spawnParticles(this.ball.x, this.ball.y, 10, ["#7dd3fc", "#e0f2fe"], 0.6);
    this.pushStats(true);
  }

  /**
   * Release without an official shot (dropped ball / round over).
   * `asDrop` lets the ball tumble to the floor but it never scores and never
   * counts as an attempt; otherwise the ball is simply returned to the spot.
   */
  private forceRelease(asDrop: boolean) {
    if (this.state !== "held") {
      if (!asDrop) this.resetBall(true);
      return;
    }
    this.charge = 0;
    sfx.release();
    if (asDrop) {
      this.state = "flying";
      this.shot = createShotTrack(this.ball.x);
      this.shotOfficial = false;
      this.ball.vx = clamp(this.hand.vx * 0.22, -220, 220);
      this.ball.vy = clamp(this.hand.vy * 0.22, -160, 220);
      this.ball.spin = this.ball.vx / 900;
    } else {
      this.shot = null;
      this.shotOfficial = false;
      this.resetBall(true);
    }
    this.pushStats(true);
  }

  /* -------------------------------------------------------------- scoring */
  private handleMake() {
    const shot = this.shot;
    if (!shot || !this.shotOfficial) return;
    const fromDeep = this.frontMode ? shot.power >= F.deepCharge : shot.startX <= THREE_PT_X;
    const swish = !shot.touchedRim && !shot.touchedBoard;
    this.stats.streak += 1;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
    this.stats.multiplier = this.stats.streak >= 3 ? 2 : 1;
    const base = fromDeep ? 3 : 2;
    const points = base * this.stats.multiplier + (swish ? 1 : 0);
    this.stats.score += points;
    this.stats.shotsMade += 1;
    if (fromDeep) this.stats.threes += 1;

    const hs = this.hoopScreen();
    const cx = hs.sx;
    const cy = hs.sy;
    this.netSwing = 1;
    this.hoopFlash = 1;
    this.hype = 1;
    this.shake = fromDeep ? 16 : 11;
    this.spawnParticles(cx, cy + 30, 46, ["#ffd166", "#ff8a2b", "#7de8b0", "#e0f2fe"], 1.15);
    this.spawnParticles(cx, cy + 10, 12, ["#ffd166"], 0.7, "ring");
    if (swish) sfx.swish();
    sfx.score(fromDeep ? 3 : 2);
    if (this.stats.multiplier > 1) sfx.combo(this.stats.streak);

    this.floatText(
      swish ? "SWISH!" : fromDeep ? "DEEP LAUNCH · THREE!" : "NICE SHOT!",
      cx,
      cy - (this.frontMode ? 150 : 150),
      "#7de8b0",
      74,
    );
    this.floatText(`+${points}`, cx + 150, cy - 60, "#ffd166", 58);
    if (this.stats.multiplier > 1) this.floatText(`COMBO x${this.stats.multiplier}`, cx, cy - 220, "#ff8a2b", 54);
    this.message(fromDeep ? "THREE POINTER!" : swish ? "SWISH!" : "NICE SHOT!", "good");
    this.events.onScore?.({ points, kind: fromDeep ? "three" : "two", swish, streak: this.stats.streak });
  }

  private endShot(made: boolean) {
    const shot = this.shot;
    const official = this.shotOfficial && !!shot;
    this.state = "dead";
    this.deadTimer = TIMING.respawnMs / 1000;
    if (!made && official) {
      this.stats.streak = 0;
      this.stats.multiplier = 1;
      sfx.miss();
      this.floatText("MISSED!", clamp(this.ball.x, 300, WORLD.w - 320), this.ball.y - 90, "#ff6b6b", 60);
      this.message("MISSED!", "bad");
    }
    this.shotOfficial = false;
    this.lockout = TIMING.shotLockoutMs / 1000;
    if (official) this.events.onShotEnd?.(made, shot as ShotTrack);
    this.shot = null;
    this.pushStats(true);
  }

  /* ------------------------------------------------------------- main loop */
  private tick = (ts: number) => {
    if (!this.running) return;
    const dt = this.lastTs ? clamp((ts - this.lastTs) / 1000, 0.001, 0.05) : 1 / 60;
    this.lastTs = ts;
    this.time = ts;
    this.frameCount += 1;
    this.fps = lerp(this.fps, 1 / dt, 0.05);

    // fixed-step physics for stable bounces
    this.acc += dt;
    const step = 1 / 120;
    let guard = 0;
    while (this.acc >= step && guard < 12) {
      this.physicsStep(step);
      this.acc -= step;
      guard += 1;
    }
    if (guard >= 12) this.acc = 0;

    this.update(dt);
    this.render();
    this.pushStats();
    this.raf = requestAnimationFrame(this.tick);
  };

  private update(dt: number) {
    const g = this.readGesture();
    this.updateTracking(g, dt);

    if (this.lockout > 0) this.lockout = Math.max(0, this.lockout - dt);
    if (this.popIn > 0) this.popIn = Math.max(0, this.popIn - dt * 2.2);
    if (this.netSwing > 0) this.netSwing = Math.max(0, this.netSwing - dt * 1.5);
    if (this.hoopFlash > 0) this.hoopFlash = Math.max(0, this.hoopFlash - dt * 1.6);
    if (this.hype > 0) this.hype = Math.max(0, this.hype - dt * 0.55);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 42);

    if (this.state === "idle" && !this.frozen) {
      if (this.frontMode) {
        // ball floats in front of the player's chest, gently bobbing
        this.fb.y = lerp(this.fb.y, 1.28 + Math.sin(this.time * 0.0022) * 0.05, 0.12);
        this.fb.x = lerp(this.fb.x, 0, 0.08);
        this.fb.z = F.holdZ;
        this.fb.angle += dt * 0.4;
        const p = project(this.fb.x, this.fb.y, this.fb.z);
        this.ball.x = p.sx;
        this.ball.y = p.sy;
      } else {
        // ball idles on the court with a soft breathing motion
        this.ball.y = lerp(this.ball.y, COURT_FLOOR_Y - BALL_R, 0.14);
        this.ball.x = lerp(this.ball.x, BALL_SPAWN.x, 0.05);
        this.ball.angle += dt * 0.25;
      }
    }

    if (this.state === "dead") {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) {
        this.resetBall();
        this.popIn = 1;
      }
    }

    if (this.state === "flying" && this.shot) {
      const s = this.shot;
      if (this.frontMode) {
        const onFloor = this.fb.y <= F.floorY + F.ballR + 0.03 && Math.abs(this.fb.vy) < 0.6;
        const out =
          onFloor || s.restTime > 0.3 || s.elapsed > 4.5 || Math.abs(this.fb.x) > F.outX || this.fb.z > F.outZ + 1.5;
        if (!this.shotOfficial) {
          if (s.elapsed > 0.7 || out) this.endShot(false);
        } else if (s.finished && (s.elapsed > 0.5 || this.fb.y < F.rimY - 0.75 || out)) {
          this.endShot(true);
        } else if (!s.finished && out) {
          this.endShot(false);
        }
        if (this.frozen) this.endShot(s.scored);
      } else {
        const resting = Math.abs(this.ball.vy) < 26 && this.ball.y > COURT_FLOOR_Y - BALL_R - 3;
        const settled = s.restTime > 0.4 || resting || s.elapsed > 5 || this.ball.y > WORLD.h + 40;
        if (!this.shotOfficial) {
          // dropped ball: get it out of the way quickly
          if (s.elapsed > 0.7 || settled) this.endShot(false);
        } else if (s.finished && (s.elapsed > 0.55 || this.ball.y > HOOP.rimY + 150 || settled)) {
          this.endShot(true);
        } else if (!s.finished && settled) {
          this.endShot(false);
        }
      }
    }

    // trail
    if (this.state === "flying" || this.state === "dead") {
      this.trail.push({ x: this.ball.x, y: this.ball.y, r: BALL_R });
      if (this.trail.length > 14) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
    }

    // particles
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.99;
      p.life -= dt;
      if (p.life <= 0 || p.y > WORLD.h + 60) this.particles.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const f = this.texts[i];
      f.y += f.vy * dt;
      f.vy *= 0.96;
      f.life -= dt;
      if (f.life <= 0) this.texts.splice(i, 1);
    }

    // live trajectory preview + sweet-spot search (cheap, cached every few frames)
    if (this.state === "held") {
      if (this.frontMode) {
        const st = { x: this.fb.x, y: this.fb.y, z: this.fb.z };
        const aim = this.hand.vx / 900;
        const l = computeFrontLaunch(st, this.charge, aim);
        this.previewMake = frontPredictsMake(st, l);
        this.sweetScan += 1;
        if (this.sweetScan % 6 === 0) {
          let found = -1;
          for (let c = 0; c <= 1.0001; c += 0.05) {
            if (frontPredictsMake(st, computeFrontLaunch(st, c, aim))) {
              found = c;
              break;
            }
          }
          this.sweetSpot = found;
        }
      } else {
      const launch = this.computeLaunch(this.charge, this.hand.vx, this.hand.vy);
      this.previewMake = predictsMake(this.ball.x, this.ball.y, launch.vx, launch.vy);
      this.sweetScan += 1;
      if (this.sweetScan % 6 === 0) {
        let found = -1;
        for (let c = 0; c <= 1.0001; c += 0.0625) {
          const l = this.computeLaunch(c, this.hand.vx, this.hand.vy);
          if (predictsMake(this.ball.x, this.ball.y, l.vx, l.vy)) {
            found = c;
            break;
          }
        }
        this.sweetSpot = found;
      }
      }
    } else {
      this.sweetSpot = -1;
      this.previewMake = false;
    }

    // round clock
    if (this.running_clock && !this.frozen && !this.config.practice) {
      const before = Math.ceil(this.timeLeft);
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      const after = Math.ceil(this.timeLeft);
      if (after !== before) {
        if (after <= 5 && after > 0) sfx.countdown(after === 1);
        this.pushStats(true);
      }
      if (this.timeLeft <= 0 && !this.timeEndFired) {
        this.timeEndFired = true;
        this.running_clock = false;
        this.frozen = true;
        this.forceRelease(false);
        sfx.buzzer();
        this.events.onTimeEnd?.();
      }
    }
  }

  private physicsStep(dt: number) {
    if (this.state !== "flying" || this.frozen) return;
    const shot = this.shot ?? createShotTrack(this.ball.x, this.charge);
    this.shot = shot;
    if (this.frontMode) {
      const ev = stepFront(this.fb, shot, dt);
      const p = project(this.fb.x, this.fb.y, this.fb.z);
      // keep the 2D proxy aligned so trails/particles/labels land on the ball
      this.ball.x = p.sx;
      this.ball.y = p.sy;
      for (const hit of ev.hits) {
        if (hit === "floor") {
          sfx.bounce(clamp(Math.abs(this.fb.vy) / 6, 0.2, 1));
          const fp = project(this.fb.x, 0.02, this.fb.z);
          this.spawnParticles(fp.sx, fp.sy, 6, ["#93c5fd", "#cbd5e1"], 0.45);
        } else if (hit === "rim") {
          sfx.rim();
          this.shake = Math.max(this.shake, 5);
        } else if (hit === "board") {
          sfx.board();
          this.hoopFlash = Math.max(this.hoopFlash, 0.5);
        }
      }
      if (ev.scored) this.handleMake();
      if (ev.inNet) this.netSwing = Math.max(this.netSwing, 0.85);
      return;
    }
    const ev = stepBall(this.ball, shot, dt);
    for (const hit of ev.hits) {
      if (hit === "floor") {
        sfx.bounce(clamp(Math.abs(this.ball.vy) / 700, 0.2, 1));
        this.spawnParticles(this.ball.x, COURT_FLOOR_Y - 4, 6, ["#93c5fd", "#cbd5e1"], 0.45);
      } else if (hit === "rim") {
        sfx.rim();
        this.shake = Math.max(this.shake, 5);
      } else if (hit === "board") {
        sfx.board();
        this.hoopFlash = Math.max(this.hoopFlash, 0.5);
      }
    }
    if (ev.scored) this.handleMake();
    if (ev.inNet) this.netSwing = Math.max(this.netSwing, 0.85);
  }

  /* -------------------------------------------------------------- drawing */
  /** FRONT-FACING view: looking down the court, the ball flies away from the player. */
  private renderFront() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#02050c";
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.applyTransform();
    ctx.save();
    if (this.shake > 0.4) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    drawArena(ctx, this.time, this.hype);
    drawFrontFloor(ctx, this.time);
    drawFrontTarget(ctx, this.previewMake, this.time, this.hoopFlash);
    drawFrontHoop(ctx, this.netSwing * Math.PI * 2, this.hoopFlash, false);
    drawTrail(ctx, this.trail, this.hoopFlash > 0.1);

    const p = project(this.fb.x, this.fb.y, this.fb.z);
    if (this.state === "idle" && this.hand.present && !this.frozen) {
      drawGrabZone(ctx, { x: p.sx, y: p.sy, vx: 0, vy: 0, spin: 0, angle: 0 }, this.time, true);
    }
    drawFrontBall(ctx, this.fb, this.state === "held" ? 0.55 + this.charge : this.hoopFlash * 0.4);
    drawFrontHoop(ctx, this.netSwing * Math.PI * 2, this.hoopFlash, true);

    if (this.state === "held") {
      const st = { x: this.fb.x, y: this.fb.y, z: this.fb.z };
      const l = computeFrontLaunch(st, this.charge, this.hand.vx / 900);
      drawFrontGuide(ctx, frontPath(st, l), this.previewMake, { sx: p.sx, sy: p.sy });
      drawFrontPower(ctx, this.charge, this.previewMake, this.sweetSpot);
    } else if (this.state === "idle" && !this.frozen) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(226,240,255,0.9)";
      ctx.font = "900 26px 'Trebuchet MS', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PINCH TO GRAB", p.sx, p.sy + 120);
      ctx.textAlign = "left";
      ctx.restore();
    }

    if (this.config.showCursor && this.state !== "flying") {
      drawHandCursor(ctx, { x: p.sx, y: p.sy, pinch: this.hand.pinch ? 1 : 0, present: this.hand.present }, this.time);
    }
    drawParticles(ctx, this.particles);
    drawFloatTexts(ctx, this.texts);
    if (this.config.calibrationFrame) drawCalibrationFrame(ctx, this.time);
    drawVignette(ctx);

    if (this.frozen && !this.config.practice) {
      drawPausedOverlay(ctx, "BALL FROZEN", "Get ready — show your hand to the camera");
    } else if (!this.hand.present) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "rgba(190,18,60,0.55)";
      ctx.beginPath();
      ctx.roundRect(WORLD.w / 2 - 520, 26, 1040, 54, 16);
      ctx.fill();
      ctx.fillStyle = "#fff1f2";
      ctx.font = "900 26px 'Trebuchet MS', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        this.sourceIsCamera
          ? "HAND NOT DETECTED — raise one hand into frame and pinch thumb + index together"
          : "PRESS & DRAG ON THE COURT TO SIMULATE A HAND",
        WORLD.w / 2,
        60,
      );
      ctx.textAlign = "left";
      ctx.restore();
      ctx.restore();
      return;
    }
    ctx.restore();
  }

  private render() {
    if (this.frontMode) {
      this.renderFront();
      return;
    }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#02050c";
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.applyTransform();
    ctx.save();
    if (this.shake > 0.4) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.fillStyle = "#04070f";
    ctx.fillRect(-40, -40, WORLD.w + 80, WORLD.h + 80);

    drawArena(ctx, this.time, this.hype);
    drawCourt(ctx, this.time);
    drawHoopBack(ctx, this.time, this.hoopFlash);
    drawTargetHighlight(ctx, this.hoopFlash);
    drawBallShadow(ctx, this.ball.x, this.ball.y);
    drawTrail(ctx, this.trail, this.hoopFlash > 0.1);

    if (this.state === "idle" && this.hand.present && !this.frozen) {
      drawGrabZone(ctx, this.ball, this.time, Math.hypot(this.ball.x - this.hand.x, this.ball.y - this.hand.y) < SHOT.grabDistance);
    }

    const pop = 1 + this.popIn * 0.35;
    ctx.save();
    if (pop !== 1) {
      ctx.translate(this.ball.x, this.ball.y);
      ctx.scale(pop, pop);
      ctx.translate(-this.ball.x, -this.ball.y);
    }
    drawBall(ctx, this.ball, this.state === "held" ? 0.6 + this.charge : this.hoopFlash * 0.4);
    ctx.restore();

    drawNet(ctx, this.netSwing * Math.PI * 2, HOOP.rimY);
    drawHoopFront(ctx, this.hoopFlash);

    if (this.state === "held") {
      const launch = this.computeLaunch(this.charge, this.hand.vx, this.hand.vy);
      // same integrator + step as the live physics, so the preview is the truth
      const traj = simulateTrajectory(this.ball.x, this.ball.y, launch.vx, launch.vy, 130, 1 / 120);
      drawAimGuide(
        ctx,
        this.ball,
        { x: HOOP.rimCenterX, y: HOOP.rimY - 118 },
        traj,
        this.previewMake,
      );
      drawPowerMeter(ctx, this.ball.x, this.ball.y - 132, this.charge, this.sweetSpot < 0 ? 0 : this.sweetSpot);
      if (this.previewMake) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#7de8b0";
        ctx.font = "800 24px 'Trebuchet MS', system-ui, sans-serif";
        ctx.fillText("ON TARGET — RELEASE!", this.ball.x - 120, this.ball.y - 158);
        ctx.restore();
      }
    }

    if (this.config.showCursor) {
      drawHandCursor(ctx, { x: this.hand.x, y: this.hand.y, pinch: this.hand.pinch ? 1 : 0, present: this.hand.present }, this.time);
    }
    drawParticles(ctx, this.particles);
    drawFloatTexts(ctx, this.texts);
    if (this.config.calibrationFrame) drawCalibrationFrame(ctx, this.time);
    drawVignette(ctx);

    if (this.frozen && !this.config.practice) {
      drawPausedOverlay(ctx, "BALL FROZEN", "Get ready — show your hand to the camera");
    } else if (!this.hand.present) {
      const label = this.sourceIsCamera
        ? "HAND NOT DETECTED — raise one hand into frame and pinch thumb + index together"
        : "MOVE THE POINTER INTO THE COURT TO TRACK";
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "rgba(190,18,60,0.55)";
      ctx.beginPath();
      ctx.roundRect(WORLD.w / 2 - 520, 26, 1040, 54, 16);
      ctx.fill();
      ctx.fillStyle = "#fff1f2";
      ctx.font = "900 26px 'Trebuchet MS', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, WORLD.w / 2, 60);
      ctx.restore();
      ctx.textAlign = "left";
    }
    ctx.restore();
  }

  private sourceIsCamera = true;
  setSourceIsCamera(v: boolean) {
    this.sourceIsCamera = v;
  }
}
