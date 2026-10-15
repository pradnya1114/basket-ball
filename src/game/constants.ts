/** Logical world size. All gameplay math happens in these units, then is scaled to the canvas. */
export const WORLD = { w: 1600, h: 900 } as const;

export const BALL_R = 34;
export const COURT_FLOOR_Y = 792;
export const GRAVITY = 1400;
/**
 * Air drag per 1/60s. Kept at 1 so the drawn trajectory preview is *exactly* the
 * path the ball flies (the preview integrator and the physics integrator match).
 */
export const AIR_DRAG = 1;

/** Hoop geometry (backboard + rim + net) on the right side of the arena. */
export const HOOP = {
  boardX: 1302,
  boardTop: 250,
  boardBottom: 452,
  boardW: 22,
  rimY: 472,
  rimFrontX: 1176,
  rimBackX: 1298,
  rimNodeR: 9,
  netDepth: 92,
  rimCenterX: (1176 + 1298) / 2,
};

/** At/before this x (further from the hoop) a made basket is worth 3 points. */
export const THREE_PT_X = 742;

export const BALL_SPAWN = { x: 296, y: COURT_FLOOR_Y - BALL_R };

/** Mapping of normalized hand landmark space into world space (hand zone never covers the hoop). */
export const HAND_ZONE = {
  xFrom: 0.06,
  xTo: 0.92,
  yFrom: 0.12,
  yTo: 0.94,
  worldMinX: 110,
  worldMaxX: 1058,
  worldMinY: 232,
  worldMaxY: 716,
};

export const PHYSICS = {
  floorRestitution: 0.6,
  boardRestitution: 0.52,
  rimRestitution: 0.44,
  floorFriction: 0.86,
  maxSpeed: 2100,
};

/**
 * Shot launch tuning. The release angle follows a reference arc (steeper when the
 * hoop is close and high), and the launch speed is derived from the ballistic speed
 * that would drop through the ring from where the player is standing, scaled by the
 * charge. That leaves a readable ~25% power window: under-charge is short, over-charge
 * is long, and the live trajectory preview shows exactly which one you are in.
 */
export const SHOT = {
  minReleaseVx: 110,
  minCharge: 0.12,
  arcAngle: 0.93,
  closeArcBoost: 0.45,
  minArc: 0.62,
  maxArc: 1.45,
  angleNudge: 0.2,
  speedRef: 1250,
  distanceAssist: 0.85,
  powerAtZero: 0.84,
  powerSpan: 0.36,
  flickWeight: 0.3,
  flickDivisor: 1400,
  speedFloor: 760,
  speedCeiling: 1720,
  pullBackRangeX: 280,
  pullBackRangeY: 190,
  grabDistance: 235,
  /** Exponential smoothing applied to tracked hand velocity. */
  smoothing: 0.45,
};

export const PINCH = {
  /** Pinch distance normalized by hand size, so it works near and far from the camera. */
  on: 0.42,
  off: 0.66,
  framesToGrab: 2,
  lostGraceMs: 340,
};

export const TIMING = {
  singlePlayerSec: 60,
  shotLockoutMs: 750,
  respawnMs: 520,
};

export function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
