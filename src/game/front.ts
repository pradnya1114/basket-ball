import { WORLD, clamp, lerp } from "./constants";
import type { ShotTrack } from "./physics";

/**
 * FRONT-FACING view: the player looks straight down the court at the hoop and
 * throws the ball *into* the screen. Coordinates are arcade metres:
 *   x = left/right, y = height above the floor, z = distance down-court (away from player)
 */
export const F = {
  camY: 1.12,
  focal: 780,
  horizon: 498,
  ballR: 0.125,
  rimY: 2.0,
  rimZ: 3.6,
  rimR: 0.245,
  boardZ: 3.8,
  boardHalfW: 0.92,
  boardTopY: 3.02,
  boardBottomY: 1.9,
  netDrop: 0.42,
  netR: 0.15,
  floorY: 0,
  gravity: 9.0,
  /** where the ball floats while held */
  holdZ: 1.62,
  outZ: 5.6,
  outX: 3.2,
  deepCharge: 0.58,
  /** arcade forgiveness: how far off-centre a drop can still count */
  capture: 0.1,
};

export interface FrontBall {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  angle: number;
}

export interface Proj {
  sx: number;
  sy: number;
  s: number;
}

export function project(x: number, y: number, z: number): Proj {
  const s = F.focal / Math.max(0.5, z);
  return { sx: WORLD.w / 2 + x * s, sy: F.horizon - (y - F.camY) * s, s };
}

/** Speed that drops the ball through the ring from (y, z) at elevation `elev` (radians). */
export function idealSpeedFront(y: number, x: number, z: number, elev: number): number | null {
  const d = Math.max(0.5, F.rimZ - z);
  const rise = F.rimY - y;
  const tan = Math.tan(elev);
  const cos = Math.cos(elev);
  const denom = 2 * cos * cos * (d * tan - rise);
  if (!(denom > 0.02)) return null;
  const v2 = (F.gravity * d * d) / denom;
  if (!Number.isFinite(v2) || v2 <= 0) return null;
  void x;
  return Math.sqrt(v2);
}

export interface FrontLaunch {
  vx: number;
  vy: number;
  vz: number;
  elev: number;
  speed: number;
}

/**
 * Front-mode launch vector. Reference elevation steepens when the ball is held low,
 * speed = ballistic ideal scaled by the charge, lateral velocity from the hand sweep.
 */
export function computeFrontLaunch(state: { y: number; x: number; z: number }, charge: number, aimVx: number): FrontLaunch {
  const elev = clamp(0.62 + Math.max(0, F.rimY - state.y) * 0.22, 0.5, 1.15);
  const ideal = idealSpeedFront(state.y, state.x, state.z, elev);
  const reference = ideal === null ? 5.2 : lerp(5.05, ideal, 0.88);
  const speed = clamp(reference * (0.88 + 0.34 * clamp(charge, 0, 1.1)), 2.6, 9.2);
  const horiz = speed * Math.cos(elev);
  return {
    vz: horiz,
    vy: speed * Math.sin(elev),
    vx: clamp(aimVx * 0.35 + state.x * 0.55, -1.9, 1.9),
    elev,
    speed,
  };
}

export interface FrontStepEvents {
  hits: ("floor" | "board" | "rim" | "none")[];
  scored: boolean;
  inNet: boolean;
}

/** One physics substep for the front view, including rim / backboard / floor collisions. */
export function stepFront(b: FrontBall, shot: ShotTrack, dt: number): FrontStepEvents {
  const ev: FrontStepEvents = { hits: [], scored: false, inNet: false };
  const prevY = b.y;

  b.vy -= F.gravity * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.angle += b.spin * dt;

  const radial = Math.hypot(b.x, b.z - F.rimZ);

  // score: downward crossing of the rim plane inside the ring
  if (!shot.scored && b.vy < 0 && prevY >= F.rimY && b.y < F.rimY && radial < F.rimR + F.capture) {
    shot.scored = true;
    shot.made = true;
    shot.finished = true;
    ev.scored = true;
  }
  ev.inNet = b.y < F.rimY && b.y > F.rimY - F.netDrop && radial < F.rimR;

  // rim: clip the ring edge on the way through
  if (!shot.scored && b.vy < 0 && prevY >= F.rimY - F.ballR && b.y < F.rimY + F.ballR) {
    if (radial > F.rimR + F.capture * 0.45 && radial < F.rimR + F.ballR + 0.05 && b.z < F.rimZ + 0.25) {
      const nx = radial > 1e-4 ? b.x / radial : 0;
      const nz = radial > 1e-4 ? (b.z - F.rimZ) / radial : 1;
      b.x = nx * (F.rimR + F.ballR);
      b.z = F.rimZ + nz * (F.rimR + F.ballR);
      b.vy = -b.vy * 0.34;
      const push = 0.7;
      b.vx += nx * push;
      b.vz += nz * push * 0.6;
      shot.touchedRim = true;
      ev.hits.push("rim");
    }
  }

  // backboard plane
  if (
    b.z + F.ballR > F.boardZ &&
    b.z < F.boardZ + 0.4 &&
    Math.abs(b.x) < F.boardHalfW + F.ballR &&
    b.y > F.boardBottomY - F.ballR &&
    b.y < F.boardTopY + F.ballR &&
    b.vz > 0
  ) {
    b.z = F.boardZ - F.ballR;
    b.vz = -b.vz * 0.44;
    b.vx *= 0.9;
    shot.touchedBoard = true;
    ev.hits.push("board");
  }

  // floor
  if (b.y < F.floorY + F.ballR) {
    b.y = F.floorY + F.ballR;
    if (b.vy < 0) {
      if (Math.abs(b.vy) > 0.5) {
        b.vy = -b.vy * 0.58;
        b.vx *= 0.86;
        b.vz *= 0.86;
        shot.bounces += 1;
        ev.hits.push("floor");
      } else {
        b.vy = 0;
        b.vx *= 0.9;
        b.vz *= 0.9;
        shot.restTime += dt;
      }
    }
  }

  return ev;
}

/** Preview path in 3D (same integrator as the live physics). */
export function frontPath(b: { x: number; y: number; z: number }, l: FrontLaunch, steps = 150, step = 1 / 120) {
  const pts: Proj[] = [];
  let { x, y, z } = b;
  let { vx, vy, vz } = l;
  for (let i = 0; i < steps; i += 1) {
    vy -= F.gravity * step;
    x += vx * step;
    y += vy * step;
    z += vz * step;
    pts.push(project(x, y, z));
    if (y < F.floorY || z > F.outZ) break;
  }
  return pts;
}

/** Would this path drop through the ring? Drives the green ON-TARGET preview. */
export function frontPredictsMake(b: { x: number; y: number; z: number }, l: FrontLaunch) {
  let { x, y, z } = b;
  let { vx, vy, vz } = l;
  const step = 1 / 240;
  for (let i = 0; i < 1400; i += 1) {
    const prevY = y;
    vy -= F.gravity * step;
    x += vx * step;
    y += vy * step;
    z += vz * step;
    if (y < F.floorY || z > F.outZ) return false;
    if (vy < 0 && prevY >= F.rimY && y < F.rimY) {
      return Math.hypot(x, z - F.rimZ) < F.rimR + F.capture;
    }
  }
  return false;
}

/* ------------------------------------------------------------- rendering */
type Ctx = CanvasRenderingContext2D;

function floorEdges() {
  const nearZ = 0.55;
  const farZ = 4.7;
  const halfNear = 3.4;
  const halfFar = 2.25;
  return { nearZ, farZ, halfNear, halfFar };
}

export function drawFrontFloor(ctx: Ctx, t: number) {
  const { nearZ, farZ, halfNear, halfFar } = floorEdges();
  const nl = project(-halfNear, 0, nearZ);
  const nr = project(halfNear, 0, nearZ);
  const fl = project(-halfFar, 0, farZ);
  const fr = project(halfFar, 0, farZ);

  const g = ctx.createLinearGradient(0, fl.sy, 0, WORLD.h);
  g.addColorStop(0, "#1b3050");
  g.addColorStop(0.35, "#152740");
  g.addColorStop(1, "#0a1728");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(nl.sx, WORLD.h);
  ctx.lineTo(fl.sx, fl.sy);
  ctx.lineTo(fr.sx, fr.sy);
  ctx.lineTo(nr.sx, WORLD.h);
  ctx.closePath();
  ctx.fill();

  // converging floorboards
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 2;
  for (let i = -14; i <= 14; i += 1) {
    const a = project(i * 0.46, 0, nearZ);
    const b = project(i * 0.3, 0, farZ + 1.4);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  for (let z = 0.8; z < 5.2; z += 0.42) {
    const a = project(-halfNear * 1.3, 0, z);
    const b = project(halfNear * 1.3, 0, z);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  ctx.restore();

  // court outlines: sidelines, baseline, key, free-throw arc, 3PT arc
  ctx.strokeStyle = "rgba(125,211,252,0.42)";
  ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(project(s * halfFar, 0, farZ).sx, project(s * halfFar, 0, farZ).sy);
    ctx.lineTo(project(s * halfNear, 0, nearZ).sx, project(s * halfNear, 0, nearZ).sy);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(fl.sx, fl.sy);
  ctx.lineTo(fr.sx, fr.sy);
  ctx.stroke();

  // key / lane
  ctx.strokeStyle = "rgba(125,211,252,0.3)";
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(project(s * 0.85, 0, 4.55).sx, project(s * 0.85, 0, 4.55).sy);
    ctx.lineTo(project(s * 0.85, 0, 2.75).sx, project(s * 0.85, 0, 2.75).sy);
  }
  ctx.stroke();
  circleOnFloor(ctx, 0, 2.75, 0.62, "rgba(125,211,252,0.3)");

  // three point arc (deep launch zone)
  ctx.save();
  ctx.setLineDash([16, 12]);
  ctx.lineDashOffset = -t * 0.02;
  circleOnFloor(ctx, 0, F.rimZ, 1.28, "rgba(255,166,60,0.8)", 5);
  ctx.restore();
  ctx.font = "800 20px 'Trebuchet MS', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,166,60,0.85)";
  ctx.textAlign = "center";
  const lab = project(0, 0, F.rimZ + 1.45);
  ctx.fillText("DEEP LAUNCH ZONE · +3", lab.sx, lab.sy + 26);
  ctx.textAlign = "left";
}

function circleOnFloor(ctx: Ctx, cx: number, cz: number, r: number, color: string, width = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = 0; i <= 64; i += 1) {
    const a = (i / 64) * Math.PI * 2;
    const p = project(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
    if (i === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  }
  ctx.stroke();
}

/** Returns the projected rim ellipse for callers that need it. */
export function drawFrontHoop(ctx: Ctx, swing: number, flash: number, front: boolean) {
  const p = (x: number, y: number, z: number) => project(x, y, z);
  if (!front) {
    // pole + backboard + rim back half (drawn before the ball)
    const top = p(-F.boardHalfW, F.boardTopY, F.boardZ);
    const bottom = p(F.boardHalfW, F.boardBottomY, F.boardZ);
    ctx.fillStyle = "rgba(16,30,50,0.95)";
    ctx.fillRect(WORLD.w / 2 - 16, top.sy, 32, WORLD.h - top.sy);
    const g = ctx.createLinearGradient(top.sx, top.sy, bottom.sx, bottom.sy);
    g.addColorStop(0, "rgba(186,228,255,0.34)");
    g.addColorStop(1, "rgba(70,120,180,0.18)");
    ctx.fillStyle = g;
    ctx.strokeStyle = flash > 0 ? `rgba(255,214,120,${0.6 + flash})` : "rgba(196,232,255,0.9)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.rect(top.sx, top.sy, bottom.sx - top.sx, bottom.sy - top.sy);
    ctx.fill();
    ctx.stroke();
    // inner square
    const sq = 0.3;
    const a = p(-sq, F.rimY + 0.62, F.boardZ + 0.001);
    const b = p(sq, F.rimY + 0.04, F.boardZ + 0.001);
    ctx.strokeStyle = flash > 0 ? "rgba(255,196,90,0.95)" : "rgba(255,150,50,0.9)";
    ctx.lineWidth = 7;
    ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
    // rim (back arc)
    ctx.strokeStyle = "#ff7a18";
    ctx.lineWidth = 7;
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      const ang = Math.PI + (i / 40) * Math.PI;
      const q = p(Math.cos(ang) * F.rimR, F.rimY, F.rimZ + Math.sin(ang) * F.rimR);
      if (i === 0) ctx.moveTo(q.sx, q.sy);
      else ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
    // net
    const strands = 12;
    ctx.lineWidth = 2;
    for (let i = 0; i < strands; i += 1) {
      const ang = (i / strands) * Math.PI * 2;
      const wob = Math.sin(swing * 9 + i) * swing * 0.035;
      const topPt = p(Math.cos(ang) * F.rimR, F.rimY, F.rimZ + Math.sin(ang) * F.rimR);
      const botPt = p(Math.cos(ang) * F.netR + wob, F.rimY - F.netDrop, F.rimZ + Math.sin(ang) * F.netR + wob);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.2 * Math.abs(Math.cos(ang))})`;
      ctx.beginPath();
      ctx.moveTo(topPt.sx, topPt.sy);
      ctx.lineTo(botPt.sx, botPt.sy);
      ctx.stroke();
    }
    for (let r = 1; r <= 2; r += 1) {
      const k = r / 3;
      ctx.strokeStyle = `rgba(255,255,255,${0.22 - k * 0.05})`;
      ctx.beginPath();
      for (let i = 0; i <= 28; i += 1) {
        const ang = (i / 28) * Math.PI * 2;
        const rr = lerp(F.rimR, F.netR, k);
        const q = p(Math.cos(ang) * rr, F.rimY - F.netDrop * k, F.rimZ + Math.sin(ang) * rr);
        if (i === 0) ctx.moveTo(q.sx, q.sy);
        else ctx.lineTo(q.sx, q.sy);
      }
      ctx.stroke();
    }
    return;
  }
  // front half of the rim (drawn over the ball so it drops "through")
  const p0 = project(0, F.rimY, F.rimZ);
  ctx.save();
  if (flash > 0) {
    ctx.shadowColor = "rgba(255,170,60,0.95)";
    ctx.shadowBlur = 26 * flash;
  }
  ctx.strokeStyle = flash > 0 ? "#ffb04a" : "#ff7a18";
  ctx.lineWidth = Math.max(4, p0.s * 0.03);
  ctx.beginPath();
  for (let i = 0; i <= 40; i += 1) {
    const ang = (i / 40) * Math.PI;
    const q = p(Math.cos(ang) * F.rimR, F.rimY, F.rimZ + Math.sin(ang) * F.rimR);
    if (i === 0) ctx.moveTo(q.sx, q.sy);
    else ctx.lineTo(q.sx, q.sy);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawFrontBall(ctx: Ctx, b: FrontBall, glow: number) {
  const p = project(b.x, b.y, b.z);
  const r = Math.max(6, F.ballR * p.s);
  // floor shadow
  const sh = project(b.x, 0.001, b.z);
  ctx.save();
  ctx.globalAlpha = clamp(0.5 - b.y * 0.09, 0.05, 0.45);
  ctx.fillStyle = "#02060d";
  ctx.beginPath();
  ctx.ellipse(sh.sx, sh.sy, r * 1.05, r * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = `rgba(255,148,40,${0.3 + glow * 0.55})`;
    ctx.shadowBlur = 20 + glow * 32;
  }
  ctx.translate(p.sx, p.sy);
  ctx.rotate(b.angle);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
  g.addColorStop(0, "#ffc888");
  g.addColorStop(0.45, "#f97e1b");
  g.addColorStop(1, "#a63f06");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(60,20,4,0.85)";
  ctx.lineWidth = Math.max(1.4, r * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.5, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return { p, r };
}

export function drawFrontGuide(
  ctx: Ctx,
  path: Proj[],
  onTarget: boolean,
  ball: { sx: number; sy: number },
) {
  const color = onTarget ? "rgba(125,232,176,0.95)" : "rgba(90,215,255,0.9)";
  const rim = project(0, F.rimY, F.rimZ);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(ball.sx, ball.sy);
  ctx.lineTo(rim.sx, rim.sy);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  for (let i = 0; i < path.length; i += 3) {
    const k = 1 - i / path.length;
    ctx.globalAlpha = 0.12 + k * 0.75;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(path[i].sx, path[i].sy, Math.max(1.6, 6 * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // landing marker on the floor
  const last = path[path.length - 1];
  if (last) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(last.sx, last.sy, 16, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawFrontTarget(ctx: Ctx, onTarget: boolean, t: number, flash: number) {
  const p = project(0, F.rimY, F.rimZ);
  const r = F.rimR * p.s;
  ctx.save();
  ctx.globalAlpha = onTarget ? 0.9 : 0.4;
  ctx.strokeStyle = onTarget ? "#7de8b0" : "#ffd166";
  ctx.lineWidth = onTarget ? 4 : 2.5;
  ctx.setLineDash([10, 10]);
  ctx.lineDashOffset = -t * 0.03;
  ctx.beginPath();
  ctx.ellipse(p.sx, p.sy, r * (2.1 + Math.sin(t * 0.004) * 0.08), r * (0.95 + Math.sin(t * 0.004) * 0.05), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = "rgba(255,209,102,0.35)";
    ctx.beginPath();
    ctx.ellipse(p.sx, p.sy, r * 2.6, r * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFrontPower(ctx: Ctx, charge: number, onTarget: boolean, sweet: number) {
  const w = 420;
  const h = 24;
  const x = WORLD.w / 2 - w / 2;
  const y = WORLD.h - 92;
  ctx.save();
  ctx.fillStyle = "rgba(4,10,20,0.82)";
  ctx.beginPath();
  ctx.roundRect(x - 10, y - 10, w + 20, h + 20, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,210,255,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "#38bdf8");
  g.addColorStop(0.5, "#ffd166");
  g.addColorStop(0.8, "#ff8a2b");
  g.addColorStop(1, "#ff4d4d");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * clamp(charge, 0, 1), h);
  if (sweet >= 0) {
    ctx.fillStyle = "rgba(125,232,176,0.95)";
    ctx.fillRect(x + w * clamp(sweet, 0, 1) - 2, y - 8, 4, h + 16);
  }
  ctx.fillStyle = onTarget ? "#7de8b0" : "rgba(226,240,255,0.85)";
  ctx.font = "900 20px 'Trebuchet MS', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(onTarget ? "ON TARGET — RELEASE!" : `POWER ${Math.round(charge * 100)}%`, WORLD.w / 2, y - 18);
  ctx.textAlign = "left";
  ctx.restore();
}

export function frontDepthFade(z: number) {
  return clamp(1 - (z - F.holdZ) / (F.outZ - F.holdZ), 0.25, 1);
}

export { frontPath as buildPath };
