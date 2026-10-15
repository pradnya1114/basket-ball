import { AIR_DRAG, BALL_R, COURT_FLOOR_Y, GRAVITY, HOOP, PHYSICS, WORLD, clamp } from "./constants";

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
}

export type HitKind = "floor" | "board" | "rim" | "wall" | "none";

export interface StepEvents {
  hits: HitKind[];
  scored: boolean;
  /** true while the ball is inside the cylinder, used for net animation */
  inNet: boolean;
}

export interface ShotTrack {
  scored: boolean;
  touchedRim: boolean;
  touchedBoard: boolean;
  /** launch power (0..1.1) — decides the deep/3-point reward in the front view */
  power: number;
  startX: number;
  elapsed: number;
  restTime: number;
  bounces: number;
  finished: boolean;
  made: boolean;
}

export function createShotTrack(startX: number, power = 0): ShotTrack {
  return {
    scored: false,
    touchedRim: false,
    touchedBoard: false,
    power,
    startX,
    elapsed: 0,
    restTime: 0,
    bounces: 0,
    finished: false,
    made: false,
  };
}

/**
 * Ballistic speed that makes a shot launched at `angle` from (x, y) pass down
 * through the ring. Returns null when the target cannot be reached at that angle.
 */
export function idealSpeedFor(x: number, y: number, angle: number): number | null {
  const dx = Math.max(120, HOOP.rimCenterX - x);
  const rise = y - (HOOP.rimY - 6);
  const tan = Math.tan(angle);
  const cos = Math.cos(angle);
  const denom = 2 * cos * cos * (dx * tan - rise);
  if (!(denom > 4)) return null;
  const v2 = (GRAVITY * dx * dx) / denom;
  if (!Number.isFinite(v2) || v2 <= 0) return null;
  return Math.sqrt(v2);
}

function reflectOffPoint(ball: Ball, px: number, py: number, radius: number, restitution: number): boolean {
  const dx = ball.x - px;
  const dy = ball.y - py;
  const dist = Math.hypot(dx, dy);
  const minDist = radius + BALL_R;
  if (dist === 0 || dist > minDist) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  // push out of the rim node
  ball.x = px + nx * minDist;
  ball.y = py + ny * minDist;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + restitution) * vn * nx;
    ball.vy -= (1 + restitution) * vn * ny;
    // a rim that "eats" a little energy, like a real ring
    ball.vx *= 0.94;
    ball.vy *= 0.94;
    return true;
  }
  return false;
}

/**
 * Integrates the ball one fixed step and resolves collisions with the court,
 * backboard and both rim nodes. Returns collision events plus scoring state.
 */
export function stepBall(ball: Ball, shot: ShotTrack, dt: number): StepEvents {
  const events: StepEvents = { hits: [], scored: false, inNet: false };
  if (shot.finished) return events;

  const prevY = ball.y;
  const prevX = ball.x;

  ball.vy += GRAVITY * dt;
  // drag expressed per 1/60s so it is independent of the substep size
  const drag = Math.pow(AIR_DRAG, dt * 60);
  ball.vx *= drag;
  ball.vy *= drag;
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > PHYSICS.maxSpeed) {
    ball.vx = (ball.vx / speed) * PHYSICS.maxSpeed;
    ball.vy = (ball.vy / speed) * PHYSICS.maxSpeed;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.angle += ball.spin * dt;

  // ---- scoring: downward crossing of the rim plane inside the ring ------
  const insideRingX = ball.x > HOOP.rimFrontX + 5 && ball.x < HOOP.rimBackX - 5;
  if (!shot.scored && ball.vy > 0 && prevY <= HOOP.rimY && ball.y > HOOP.rimY && insideRingX) {
    shot.scored = true;
    shot.made = true;
    shot.finished = true;
    events.scored = true;
  }
  events.inNet =
    ball.y > HOOP.rimY - 6 && ball.y < HOOP.rimY + HOOP.netDepth && Math.abs(ball.x - HOOP.rimCenterX) < 74;

  // ---- backboard (only from the left / play side, or underside) ----------
  if (
    ball.x + BALL_R > HOOP.boardX &&
    ball.y > HOOP.boardTop - BALL_R &&
    ball.y < HOOP.boardBottom + BALL_R * 0.5
  ) {
    if (ball.vx > 0 && prevX + BALL_R <= HOOP.boardX + 6) {
      ball.x = HOOP.boardX - BALL_R;
      ball.vx = -ball.vx * PHYSICS.boardRestitution;
      ball.vy *= 0.94;
      ball.spin = -ball.spin * 0.5;
      shot.touchedBoard = true;
      events.hits.push("board");
    } else if (ball.y < HOOP.boardBottom && ball.vy > 0 && prevY + BALL_R <= HOOP.boardTop) {
      ball.y = HOOP.boardTop - BALL_R;
      ball.vy = -ball.vy * 0.4;
      shot.touchedBoard = true;
      events.hits.push("board");
    }
  }

  // ---- rim nodes ---------------------------------------------------------
  for (const node of [
    { x: HOOP.rimFrontX, y: HOOP.rimY },
    { x: HOOP.rimBackX, y: HOOP.rimY },
  ]) {
    if (reflectOffPoint(ball, node.x, node.y, HOOP.rimNodeR, PHYSICS.rimRestitution)) {
      shot.touchedRim = true;
      events.hits.push("rim");
    }
  }

  // ---- court floor -------------------------------------------------------
  if (ball.y + BALL_R > COURT_FLOOR_Y) {
    ball.y = COURT_FLOOR_Y - BALL_R;
    if (ball.vy > 0) {
      ball.vy = -ball.vy * PHYSICS.floorRestitution;
      ball.vx *= PHYSICS.floorFriction;
      ball.spin = (ball.vx / BALL_R) * 0.7;
      if (Math.abs(ball.vy) > 60) {
        shot.bounces += 1;
        events.hits.push("floor");
      } else {
        ball.vy = 0;
      }
    }
    if (Math.abs(ball.vy) < 24) {
      ball.vx *= 0.94;
      shot.restTime += dt;
    }
  }

  // ---- side walls --------------------------------------------------------
  if (ball.x - BALL_R < 0) {
    ball.x = BALL_R;
    ball.vx = Math.abs(ball.vx) * 0.55;
    events.hits.push("wall");
  }
  if (ball.x + BALL_R > WORLD.w) {
    ball.x = WORLD.w - BALL_R;
    ball.vx = -Math.abs(ball.vx) * 0.55;
    events.hits.push("wall");
  }

  shot.elapsed += dt;
  return events;
}

/** Fast, deterministic simulation used to preview the shot trajectory. */
export function simulateTrajectory(x: number, y: number, vx: number, vy: number, steps = 96, step = 1 / 40) {
  const pts: { x: number; y: number }[] = [];
  let px = x;
  let py = y;
  let pvx = vx;
  let pvy = vy;
  for (let i = 0; i < steps; i += 1) {
    pvy += GRAVITY * step;
    px += pvx * step;
    py += pvy * step;
    pts.push({ x: px, y: py });
    if (py > COURT_FLOOR_Y - BALL_R || px > WORLD.w + 40) break;
  }
  return pts;
}

/** Would this launch drop through the ring? Used to light up the aim guide. */
export function predictsMake(x: number, y: number, vx: number, vy: number) {
  let px = x;
  let py = y;
  let pvx = vx;
  let pvy = vy;
  const step = 1 / 120;
  let prevY = py;
  for (let i = 0; i < 420; i += 1) {
    pvy += GRAVITY * step;
    prevY = py;
    px += pvx * step;
    py += pvy * step;
    if (py > COURT_FLOOR_Y - BALL_R) return false;
    if (px - BALL_R > WORLD.w) return false;
    if (pvy > 0 && prevY <= HOOP.rimY && py > HOOP.rimY) {
      return px > HOOP.rimFrontX + 6 && px < HOOP.rimBackX - 6;
    }
  }
  return false;
}

export function clampToField(ball: Ball) {
  ball.x = clamp(ball.x, BALL_R, WORLD.w - BALL_R);
  ball.y = clamp(ball.y, BALL_R, COURT_FLOOR_Y - BALL_R);
}
