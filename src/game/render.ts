import { BALL_R, COURT_FLOOR_Y, HAND_ZONE, HOOP, THREE_PT_X, WORLD, clamp } from "./constants";
import type { Ball } from "./physics";

export type Ctx = CanvasRenderingContext2D;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: "dot" | "shard" | "ring";
}

export interface FloatText {
  text: string;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  vy: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  r: number;
}

/* ------------------------------------------------------------------ crowd */
type CrowdRow = { x: number; y: number; r: number; color: string; phase: number };
let crowdCache: CrowdRow[] | null = null;
const CROWD_COLORS = ["#1b3a63", "#24538a", "#2f6fb0", "#38a7d8", "#f2a54b", "#e8e8f0", "#173049"];

function crowd(): CrowdRow[] {
  if (crowdCache) return crowdCache;
  const rows: CrowdRow[] = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let r = 0; r < 6; r += 1) {
    const y = 150 + r * 34;
    const count = 42 + r * 3;
    for (let i = 0; i < count; i += 1) {
      rows.push({
        x: (i / count) * (WORLD.w + 60) - 30 + rnd() * 14,
        y: y + rnd() * 5,
        r: 9 + r * 0.9 + rnd() * 2,
        color: CROWD_COLORS[Math.floor(rnd() * CROWD_COLORS.length)],
        phase: rnd() * Math.PI * 2,
      });
    }
  }
  crowdCache = rows;
  return crowdCache;
}

/* ------------------------------------------------------------------- arena */
export function drawArena(ctx: Ctx, t: number, hype: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  sky.addColorStop(0, "#04070f");
  sky.addColorStop(0.32, "#0a1730");
  sky.addColorStop(0.62, "#0d2342");
  sky.addColorStop(1, "#061021");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // rotating spotlights
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i += 1) {
    const cx = 200 + i * 400;
    const sway = Math.sin(t * 0.0006 + i * 1.7) * 0.35;
    ctx.save();
    ctx.translate(cx, 46);
    ctx.rotate(sway);
    const g = ctx.createLinearGradient(0, 0, 0, 700);
    const alpha = 0.1 + 0.045 * Math.sin(t * 0.002 + i) + hype * 0.12;
    g.addColorStop(0, `rgba(120,200,255,${alpha.toFixed(3)})`);
    g.addColorStop(1, "rgba(120,200,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.lineTo(150, 700);
    ctx.lineTo(-150, 700);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // lamp housing
    ctx.fillStyle = "#0b1424";
    ctx.fillRect(cx - 30, 12, 60, 20);
    ctx.fillStyle = `rgba(255,244,200,${0.55 + hype * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(cx, 34, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // stands bowl
  const stand = ctx.createLinearGradient(0, 110, 0, 430);
  stand.addColorStop(0, "rgba(3,7,15,0.94)");
  stand.addColorStop(1, "rgba(9,26,48,0.6)");
  ctx.fillStyle = stand;
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.lineTo(WORLD.w, 110);
  ctx.lineTo(WORLD.w, 396);
  ctx.quadraticCurveTo(WORLD.w / 2, 452, 0, 396);
  ctx.closePath();
  ctx.fill();

  // audience
  for (const p of crowd()) {
    const bob = Math.sin(t * 0.004 + p.phase) * (2.5 + hype * 9);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob + p.r * 1.5, p.r * 1.35, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (hype > 0.35 && Math.sin(t * 0.02 + p.phase * 4) > 0.985) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(p.x + p.r, p.y + bob - p.r, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // LED ribbon board
  const ribbonY = 404;
  ctx.fillStyle = "#050a14";
  ctx.fillRect(0, ribbonY, WORLD.w, 40);
  ctx.font = "700 26px 'Trebuchet MS', 'Arial Black', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const msg = "AIR BASKETBALL   •   GRAB  •  AIM  •  SHOOT  •  SCORE  •   ";
  const msgW = ctx.measureText(msg).width;
  const off = -((t * 0.13) % msgW);
  for (let i = 0; i < 8; i += 1) {
    const alpha = 0.55 + 0.25 * Math.sin(t * 0.003 + i);
    ctx.fillStyle = `rgba(255,146,40,${alpha})`;
    ctx.fillText(msg, off + i * msgW, ribbonY + 21);
  }
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, ribbonY + 38, WORLD.w, 4);
}

/* ------------------------------------------------------------------- court */
export function drawCourt(ctx: Ctx, t: number) {
  const floor = ctx.createLinearGradient(0, COURT_FLOOR_Y - 130, 0, WORLD.h);
  floor.addColorStop(0, "#1a2c47");
  floor.addColorStop(0.25, "#132339");
  floor.addColorStop(1, "#070f1c");
  ctx.fillStyle = floor;
  ctx.fillRect(0, COURT_FLOOR_Y - 130, WORLD.w, WORLD.h - COURT_FLOOR_Y + 130);

  // perspective floorboards
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  for (let i = -6; i < 40; i += 1) {
    ctx.beginPath();
    ctx.moveTo(WORLD.w / 2 + i * 62, COURT_FLOOR_Y - 130);
    ctx.lineTo(WORLD.w / 2 + i * 168, WORLD.h);
    ctx.stroke();
  }
  // glossy reflection of the play area
  ctx.save();
  ctx.globalAlpha = 0.16;
  const refl = ctx.createLinearGradient(0, COURT_FLOOR_Y, 0, WORLD.h);
  refl.addColorStop(0, "rgba(90,190,255,0.55)");
  refl.addColorStop(1, "rgba(90,190,255,0)");
  ctx.fillStyle = refl;
  ctx.fillRect(0, COURT_FLOOR_Y, WORLD.w, 90);
  ctx.restore();

  // court line
  ctx.strokeStyle = "rgba(125,211,252,0.5)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, COURT_FLOOR_Y);
  ctx.lineTo(WORLD.w, COURT_FLOOR_Y);
  ctx.stroke();

  // three point zone marker on the floor
  ctx.save();
  ctx.strokeStyle = "rgba(255,166,60,0.75)";
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);
  ctx.lineDashOffset = -t * 0.02;
  ctx.beginPath();
  ctx.moveTo(THREE_PT_X, COURT_FLOOR_Y);
  ctx.quadraticCurveTo(THREE_PT_X - 60, COURT_FLOOR_Y - 78, THREE_PT_X - 40, COURT_FLOOR_Y - 152);
  ctx.stroke();
  ctx.restore();

  ctx.font = "800 22px 'Trebuchet MS', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,166,60,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("3PT ZONE", THREE_PT_X - 96, COURT_FLOOR_Y - 40);
  ctx.fillStyle = "rgba(148,197,255,0.28)";
  ctx.font = "900 68px 'Trebuchet MS', system-ui, sans-serif";
  ctx.fillText("AIR BASKETBALL", WORLD.w * 0.36, COURT_FLOOR_Y + 78);
  ctx.textAlign = "left";
}

/* -------------------------------------------------------------------- hoop */
export function drawHoopBack(ctx: Ctx, t: number, flash: number) {
  // support arm + pole
  ctx.fillStyle = "#111d30";
  ctx.fillRect(HOOP.boardX + HOOP.boardW, 300, 46, 40);
  ctx.fillRect(HOOP.boardX + HOOP.boardW + 30, 300, 26, COURT_FLOOR_Y - 300);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(HOOP.boardX + HOOP.boardW + 30, 300, 8, COURT_FLOOR_Y - 300);

  // backboard
  const g = ctx.createLinearGradient(HOOP.boardX, HOOP.boardTop, HOOP.boardX + 120, HOOP.boardBottom);
  g.addColorStop(0, "rgba(180,225,255,0.3)");
  g.addColorStop(1, "rgba(70,120,180,0.16)");
  ctx.fillStyle = g;
  ctx.strokeStyle = flash > 0 ? `rgba(255,214,120,${0.5 + flash})` : "rgba(196,232,255,0.85)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(HOOP.boardX - 4, HOOP.boardTop, HOOP.boardW + 8, HOOP.boardBottom - HOOP.boardTop, 6);
  ctx.fill();
  ctx.stroke();
  // shooter's square
  ctx.strokeStyle = flash > 0 ? "rgba(255,196,90,0.95)" : "rgba(255,150,50,0.9)";
  ctx.lineWidth = 6;
  ctx.strokeRect(HOOP.boardX - 30, HOOP.rimY - 92, 30, 66);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(HOOP.boardX - 4, HOOP.boardBottom - 8, HOOP.boardW + 8, 8);

  // rim: back half (drawn behind the ball)
  ctx.strokeStyle = "#ff7a18";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(HOOP.rimCenterX, HOOP.rimY, (HOOP.rimBackX - HOOP.rimFrontX) / 2, 13, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  void t;
}

export function drawNet(ctx: Ctx, swing: number, topY = HOOP.rimY) {
  const strands = 11;
  const rows = 5;
  const halfW = (HOOP.rimBackX - HOOP.rimFrontX) / 2;
  ctx.lineWidth = 2.2;
  for (let i = 0; i < strands; i += 1) {
    const a = (i / strands) * Math.PI * 2;
    const sx = HOOP.rimCenterX + Math.cos(a) * halfW;
    const sy = topY + Math.sin(a) * 12;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.25 * Math.abs(Math.cos(a))})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let r = 1; r <= rows; r += 1) {
      const k = r / rows;
      const squeeze = 1 - k * 0.42;
      const wobble = Math.sin(swing * 12 - r * 0.9 + i) * swing * 16 * k;
      ctx.lineTo(HOOP.rimCenterX + Math.cos(a) * halfW * squeeze + wobble, topY + k * HOOP.netDepth + Math.sin(a) * 12 * (1 - k * 0.6));
    }
    ctx.stroke();
  }
  // horizontal hoops of the net
  for (let r = 1; r <= 3; r += 1) {
    const k = r / 5;
    ctx.strokeStyle = `rgba(255,255,255,${0.3 - k * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(HOOP.rimCenterX, topY + k * HOOP.netDepth, halfW * (1 - k * 0.42), 12 * (1 - k * 0.6), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawHoopFront(ctx: Ctx, flash: number) {
  const halfW = (HOOP.rimBackX - HOOP.rimFrontX) / 2;
  ctx.save();
  if (flash > 0) {
    ctx.shadowColor = "rgba(255,170,60,0.95)";
    ctx.shadowBlur = 30 * flash;
  }
  ctx.strokeStyle = flash > 0 ? "#ffb04a" : "#ff7a18";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(HOOP.rimCenterX, HOOP.rimY, halfW, 13, 0, 0, Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#ff8a2b";
  for (const x of [HOOP.rimFrontX, HOOP.rimBackX]) {
    ctx.beginPath();
    ctx.arc(x, HOOP.rimY, HOOP.rimNodeR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* -------------------------------------------------------------------- ball */
export function drawBall(ctx: Ctx, ball: Ball, glow: number, scale = 1) {
  const r = BALL_R * scale;
  ctx.save();
  ctx.translate(ball.x, ball.y);
  if (glow > 0) {
    ctx.shadowColor = `rgba(255,148,40,${0.35 + glow * 0.6})`;
    ctx.shadowBlur = 26 + glow * 34;
  }
  ctx.rotate(ball.angle);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
  g.addColorStop(0, "#ffc079");
  g.addColorStop(0.45, "#f97e1b");
  g.addColorStop(1, "#b34708");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(60,20,4,0.85)";
  ctx.lineWidth = Math.max(1.6, r * 0.075);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.52, r, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.52, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawBallShadow(ctx: Ctx, x: number, y: number) {
  const k = clamp(1 - (COURT_FLOOR_Y - y) / 520, 0.12, 1);
  ctx.save();
  ctx.globalAlpha = 0.42 * k;
  ctx.fillStyle = "#02060d";
  ctx.beginPath();
  ctx.ellipse(x, COURT_FLOOR_Y + 6, 40 * k + 12, 11 * k + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawTrail(ctx: Ctx, trail: TrailPoint[], hot: boolean) {
  for (let i = 0; i < trail.length; i += 1) {
    const p = trail[i];
    const k = i / Math.max(1, trail.length - 1);
    ctx.globalAlpha = k * 0.45;
    ctx.fillStyle = hot ? "#ffcf6b" : "#ff8f36";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.35 + k * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* -------------------------------------------------------- gesture overlays */
export function drawHandCursor(ctx: Ctx, hand: { x: number; y: number; pinch: number; present: boolean }, t: number) {
  if (!hand.present) return;
  const pulse = 1 + Math.sin(t * 0.008) * 0.06;
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.strokeStyle = hand.pinch > 0.5 ? "rgba(255,190,90,0.95)" : "rgba(90,220,255,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(0, 0, 46 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(14, 0);
  ctx.moveTo(0, -14);
  ctx.lineTo(0, 14);
  ctx.stroke();
  ctx.restore();
}

export function drawGrabZone(ctx: Ctx, ball: Ball, t: number, active: boolean) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = -t * 0.03;
  ctx.strokeStyle = active ? "rgba(120,235,255,0.85)" : "rgba(120,235,255,0.32)";
  ctx.lineWidth = active ? 3.5 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R + 26 + Math.sin(t * 0.005) * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawAimGuide(
  ctx: Ctx,
  ball: Ball,
  aim: { x: number; y: number },
  trajectory: { x: number; y: number }[],
  onTarget: boolean,
) {
  const color = onTarget ? "rgba(120,255,190,0.95)" : "rgba(90,215,255,0.9)";
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(aim.x, aim.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  for (let i = 0; i < trajectory.length; i += 2) {
    const p = trajectory[i];
    const k = 1 - i / trajectory.length;
    ctx.globalAlpha = 0.15 + k * 0.7;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.6 * k + 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPowerMeter(ctx: Ctx, x: number, y: number, charge: number, sweetSpot: number) {
  const w = 250;
  const h = 26;
  const bx = clamp(x - w / 2, 20, WORLD.w - w - 20);
  const by = clamp(y, 40, WORLD.h - 60);
  ctx.save();
  ctx.fillStyle = "rgba(4,10,20,0.8)";
  ctx.beginPath();
  ctx.roundRect(bx - 6, by - 6, w + 12, h + 12, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,210,255,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
  g.addColorStop(0, "#38bdf8");
  g.addColorStop(0.5, "#ffd166");
  g.addColorStop(0.8, "#ff8a2b");
  g.addColorStop(1, "#ff4d4d");
  ctx.fillStyle = g;
  ctx.fillRect(bx, by, w * clamp(charge, 0, 1), h);

  // sweet spot marker driven by the live prediction
  ctx.fillStyle = "rgba(120,255,190,0.95)";
  ctx.fillRect(bx + w * clamp(sweetSpot, 0, 1) - 2, by - 8, 4, h + 16);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "800 17px 'Trebuchet MS', system-ui, sans-serif";
  ctx.fillText(`POWER ${Math.round(charge * 100)}%`, bx, by - 14);
  ctx.restore();
}

export function drawParticles(ctx: Ctx, particles: Particle[]) {
  for (const p of particles) {
    const k = p.life / p.maxLife;
    ctx.globalAlpha = clamp(k, 0, 1);
    ctx.fillStyle = p.color;
    if (p.shape === "shard") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 0.02 + p.x);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else if (p.shape === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3 * k + 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - k), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function drawFloatTexts(ctx: Ctx, texts: FloatText[]) {
  for (const f of texts) {
    const k = f.life / f.maxLife;
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.4, 0, 1);
    ctx.translate(f.x, f.y);
    const grow = 1 + (1 - k) * 0.18;
    ctx.scale(grow, grow);
    ctx.font = `900 ${f.size}px 'Trebuchet MS', 'Arial Black', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(2,6,14,0.85)";
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  ctx.textAlign = "left";
}

export function drawTargetHighlight(ctx: Ctx, flash: number) {
  if (flash <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(flash, 0, 1);
  const g = ctx.createRadialGradient(HOOP.rimCenterX, HOOP.rimY, 20, HOOP.rimCenterX, HOOP.rimY, 340);
  g.addColorStop(0, "rgba(255,190,80,0.55)");
  g.addColorStop(1, "rgba(255,190,80,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(HOOP.rimCenterX, HOOP.rimY, 340, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawVignette(ctx: Ctx) {
  const g = ctx.createRadialGradient(WORLD.w / 2, WORLD.h / 2, WORLD.h * 0.42, WORLD.w / 2, WORLD.h / 2, WORLD.h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
}

export function drawPausedOverlay(ctx: Ctx, message: string, sub: string) {
  ctx.save();
  ctx.fillStyle = "rgba(3,8,18,0.72)";
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.textAlign = "center";
  ctx.fillStyle = "#e7f4ff";
  ctx.font = "900 62px 'Trebuchet MS', system-ui, sans-serif";
  ctx.fillText(message, WORLD.w / 2, WORLD.h / 2 - 20);
  ctx.font = "600 26px 'Trebuchet MS', system-ui, sans-serif";
  ctx.fillStyle = "rgba(180,220,255,0.85)";
  ctx.fillText(sub, WORLD.w / 2, WORLD.h / 2 + 34);
  ctx.restore();
  ctx.textAlign = "left";
}

export function drawCalibrationFrame(ctx: Ctx, t: number) {
  ctx.save();
  ctx.strokeStyle = `rgba(90,220,255,${0.35 + 0.25 * Math.sin(t * 0.006)})`;
  ctx.lineWidth = 3;
  const m = 26;
  const corners = [
    [m, m, 1, 1],
    [WORLD.w - m, m, -1, 1],
    [m, WORLD.h - m, 1, -1],
    [WORLD.w - m, WORLD.h - m, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * 60, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * 60);
    ctx.stroke();
  }
  ctx.font = "700 18px 'Trebuchet MS', system-ui, sans-serif";
  ctx.fillStyle = "rgba(150,225,255,0.75)";
  ctx.fillText("TRACKING AREA", m + 12, WORLD.h - m - 12);
  ctx.restore();
  void HAND_ZONE;
}
