/**
 * Factory eye and fidget motion (R2f). Pure functions of (timeSec, slot seed): the same inputs give the same output, so
 * nothing here uses Math.random and tests are stable. Each slot has its own seed (its index), so slots blink, glance and
 * fidget out of step with each other.
 */

/** Deterministic hash of (seed, n) into [0, 1). */
export function hash01(seed: number, n: number): number {
  let h = Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(n + 0x7f4a7c15, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const easeOut = (x: number): number => { const t = Math.min(1, Math.max(0, x)); return 1 - (1 - t) * (1 - t); };

// ---- Blink -------------------------------------------------------------------------------------------------------

export const BLINK_SECONDS = 0.14;
const DOUBLE_BLINK_GAP = 0.28;
const DOUBLE_BLINK_CHANCE = 0.2;

/** Blink window length for a slot: 3 to 4.5 s, so every slot has its own rhythm. */
export function blinkWindow(seed: number): number { return 3 + 1.5 * hash01(seed, -1); }

/** Start times (seconds) of the blinks in window `k` of a slot: one blink at a random point, sometimes followed by a second. */
export function blinkStarts(seed: number, k: number): number[] {
  const w = blinkWindow(seed);
  const first = k * w + hash01(seed, k) * (w - 2 * DOUBLE_BLINK_GAP - BLINK_SECONDS);
  return hash01(seed, k + 100000) < DOUBLE_BLINK_CHANCE ? [first, first + DOUBLE_BLINK_GAP] : [first];
}

/** True while the slot's eyes are shut by a blink at `timeSec`. */
export function isBlinking(timeSec: number, seed: number): boolean {
  const w = blinkWindow(seed);
  const k = Math.floor(timeSec / w);
  return blinkStarts(seed, k).some((s) => timeSec >= s && timeSec < s + BLINK_SECONDS);
}

// ---- Gaze --------------------------------------------------------------------------------------------------------

export interface Gaze { x: number; y: number }
export interface GazeScene {
  /** This slot's index in the grid and the grid's column count. */
  slotIndex: number; cols: number;
  /** Index of the slot that is building right now, if any. */
  buildingIndex?: number;
  /** The slot's own playhead 0..1 while its audition plays. */
  playhead?: number;
  /** A chip is riding the conveyor. */
  chipRiding?: boolean;
}

/** Unit-ish direction from slot `from` toward slot `to` in a grid with `cols` columns (x right, y down). */
export function directionToSlot(from: number, to: number, cols: number): Gaze {
  const dx = (to % cols) - (from % cols);
  const dy = Math.floor(to / cols) - Math.floor(from / cols);
  const m = Math.max(Math.abs(dx), Math.abs(dy), 1);
  return { x: dx / m, y: dy / m };
}

/**
 * What the slot's eyes are drawn to, in priority order: its own playhead sweep, the slot that is building (or its own
 * wave when it is the one building), the conveyor chip (looking up). Undefined means nothing holds its attention.
 */
export function gazeFocus(scene: GazeScene): Gaze | undefined {
  if (scene.playhead !== undefined) return { x: -1 + 2 * scene.playhead, y: 0.7 };
  if (scene.buildingIndex !== undefined) {
    return scene.buildingIndex === scene.slotIndex ? { x: 0, y: 0.7 } : directionToSlot(scene.slotIndex, scene.buildingIndex, scene.cols);
  }
  if (scene.chipRiding) return { x: 0.8, y: -1 };
  return undefined;
}

export const GAZE_HOLD_SECONDS = 1.6;
export const SACCADE_SECONDS = 0.12;

/** Gaze for window `k`: the focus (with a small wobble) most of the time, otherwise a random glance. */
function windowTarget(seed: number, k: number, focus: Gaze | undefined): Gaze {
  const wobble = (n: number): number => (hash01(seed, k * 7 + n) - 0.5) * 0.25;
  if (focus && hash01(seed, k * 7 + 3) < 0.8) return { x: focus.x + wobble(1), y: focus.y + wobble(2) };
  return { x: hash01(seed, k * 7 + 4) * 2 - 1, y: (hash01(seed, k * 7 + 5) * 2 - 1) * 0.7 };
}

/** Gaze direction (each axis -1..1) at `timeSec`: a short ease (saccade) to the window's target, then a hold. */
export function gazeAt(timeSec: number, seed: number, focus?: Gaze): Gaze {
  const hold = GAZE_HOLD_SECONDS * (0.7 + 0.6 * hash01(seed, -2));
  const k = Math.floor(timeSec / hold);
  const from = windowTarget(seed, k - 1, focus);
  const to = windowTarget(seed, k, focus);
  const e = easeOut((timeSec - k * hold) / SACCADE_SECONDS);
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return { x: clamp(from.x + (to.x - from.x) * e), y: clamp(from.y + (to.y - from.y) * e) };
}

// ---- Fidget ------------------------------------------------------------------------------------------------------

export interface Fidget { x: number; y: number; rot: number }
export const FIDGET_MAX_PX = 3;
export const FIDGET_MAX_DEG = 0.7;
const FIDGET_MOVE = 1.0;

/**
 * Small offset of a card at `timeSec`: now and then it shifts a few px and tilts slightly, eases there, holds, eases
 * back, and sits still (exactly zero) until the next move. Pure translate/rotate, so layout size never changes.
 */
export function fidgetOffset(timeSec: number, seed: number): Fidget {
  const w = 2.5 + 2 * hash01(seed, -3);
  const k = Math.floor(timeSec / w);
  if (hash01(seed, k + 200000) > 0.65) return { x: 0, y: 0, rot: 0 };
  const start = k * w + 0.2 + hash01(seed, k + 300000) * (w - FIDGET_MOVE - 0.4);
  const p = (timeSec - start) / FIDGET_MOVE;
  if (p <= 0 || p >= 1) return { x: 0, y: 0, rot: 0 };
  const env = p < 0.35 ? smooth(p / 0.35) : p < 0.65 ? 1 : smooth((1 - p) / 0.35);
  const s = (n: number): number => (hash01(seed, k * 5 + n + 400000) * 2 - 1);
  return { x: s(1) * FIDGET_MAX_PX * env, y: s(2) * FIDGET_MAX_PX * 0.6 * env, rot: s(3) * FIDGET_MAX_DEG * env };
}
