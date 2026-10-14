/**
 * How far along the record the tonearm sits (0 = outer groove, 1 = run-out
 * groove), for any deck. One definition for every turntable view.
 *
 * Audio decks: heard position over the track duration. Tracker decks have no
 * duration in the store (only audio decks write durationMs), so they show
 * the song's place in its order list. Never a made-up default duration.
 */
export interface TonearmDeck {
  playbackMode: 'audio' | 'tracker';
  durationMs: number;
  songPos: number;
  totalPositions: number;
}

export function tonearmProgress(deck: TonearmDeck, heardPositionSec: number): number {
  let progress = 0;
  if (deck.durationMs > 0) progress = heardPositionSec / (deck.durationMs / 1000);
  else if (deck.playbackMode === 'tracker' && deck.totalPositions > 0) progress = deck.songPos / deck.totalPositions;
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

// ── Arm calibration ──────────────────────────────────────────────────────────
//
// The arm angle for a progress value is SOLVED from the geometry, not tuned by
// eye: the needle tip travels on a circle around the arm pivot; the start and
// end angles are where that circle meets the lead-in and run-out groove
// circles of the record. Both turntable views describe their arm in a 2D frame
// where a positive angle is the standard rotation (u' = u cos - v sin,
// v' = u sin + v cos) and share the solver below.

/** Lead-in groove radius, as a fraction of the record radius (just inside the edge). */
export const LEAD_IN_RADIUS = 0.95;
/** Run-out groove radius, as a fraction of the record radius (just outside the label). */
export const RUN_OUT_RADIUS = 0.34;

export interface Vec2 { u: number; v: number }

export interface ArmGeometry {
  /** Arm pivot, in the view's frame. */
  pivot: Vec2;
  /** Needle tip with the arm at angle 0, same frame. */
  tip: Vec2;
  /** Record centre, same frame. */
  center: Vec2;
  /** Record radius, same units. */
  recordRadius: number;
}

/** Needle tip position for an arm rotated by angleRad about its pivot. */
export function tipAt(g: ArmGeometry, angleRad: number): Vec2 {
  const du = g.tip.u - g.pivot.u;
  const dv = g.tip.v - g.pivot.v;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { u: g.pivot.u + du * c - dv * s, v: g.pivot.v + du * s + dv * c };
}

/** Distance of the needle tip from the record centre, as a fraction of the record radius. */
export function tipRadius(g: ArmGeometry, angleRad: number): number {
  const t = tipAt(g, angleRad);
  return Math.hypot(t.u - g.center.u, t.v - g.center.v) / g.recordRadius;
}

/**
 * The arm angle (radians, nearest the rest position 0) that puts the needle
 * tip at radiusFraction of the record radius. Law of cosines on the triangle
 * pivot - record centre - tip.
 */
export function solveArmAngle(g: ArmGeometry, radiusFraction: number): number {
  const r = radiusFraction * g.recordRadius;
  const armU = g.tip.u - g.pivot.u;
  const armV = g.tip.v - g.pivot.v;
  const toU = g.center.u - g.pivot.u;
  const toV = g.center.v - g.pivot.v;
  const L = Math.hypot(armU, armV);
  const D = Math.hypot(toU, toV);
  const cosA = (L * L + D * D - r * r) / (2 * L * D);
  if (Math.abs(cosA) > 1) throw new Error('tonearm cannot reach radius ' + radiusFraction);
  const base = Math.atan2(toV, toU) - Math.atan2(armV, armU);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const a1 = wrap(base + Math.acos(cosA));
  const a2 = wrap(base - Math.acos(cosA));
  return Math.abs(a1) <= Math.abs(a2) ? a1 : a2;
}

export interface ArmRange { startRad: number; endRad: number }

/** Start (lead-in groove) and end (run-out groove) angles for an arm. */
export function armRange(g: ArmGeometry): ArmRange {
  return { startRad: solveArmAngle(g, LEAD_IN_RADIUS), endRad: solveArmAngle(g, RUN_OUT_RADIUS) };
}

/** Arm angle for a progress value from tonearmProgress. */
export function armAngle(range: ArmRange, progress: number): number {
  return range.startRad + progress * (range.endRad - range.startRad);
}

// ── CSS turntable (DeckCssTurntable.css) ─────────────────────────────────────
// Frame: the 1256 x 1010 artwork, origin at the top-left of .tt-bd, v down.
// Every number is the CSS percentage in DeckCssTurntable.css; tipPx is the
// stylus point in tt_arm.png (317 x 833, measured from the alpha channel).

const ART_W = 1256;
const ART_H = 1010;
const BD_W = 0.8815 * ART_W;
const BD_H = 0.8225 * ART_H;
const ARM_IMG_W = 317;
const ARM_IMG_H = 833;
const ARM_TIP_PX = { u: 104, v: 783 };
const HOLDER_W = 0.2855 * BD_W;
const HOLDER_H = 0.9975 * BD_H;
const HOLDER_LEFT = BD_W - 0.0275 * BD_W - HOLDER_W;
const HOLDER_TOP = -0.04 * BD_W; // a percentage margin is relative to the width
const ARM_IMG_SCALE = Math.min(HOLDER_W / ARM_IMG_W, HOLDER_H / ARM_IMG_H);

export const CSS_ARM_GEOMETRY: ArmGeometry = {
  pivot: { u: HOLDER_LEFT + 0.54 * HOLDER_W, v: HOLDER_TOP + 0.27 * HOLDER_H },
  tip: { u: HOLDER_LEFT + ARM_TIP_PX.u * ARM_IMG_SCALE, v: HOLDER_TOP + ARM_TIP_PX.v * ARM_IMG_SCALE },
  center: { u: (0.0835 + 0.662 / 2) * BD_W, v: (0.0619 + 0.8823 / 2) * BD_H },
  recordRadius: (0.662 * BD_W) / 2,
};

export const CSS_ARM_RANGE: ArmRange = armRange(CSS_ARM_GEOMETRY);

// ── 3D turntable (public/models/turntable.glb) ───────────────────────────────
// Frame: (u, v) = (x, -z) of the model in centimetres, so that
// makeRotationY(a) is the standard rotation by a. Pivot = centre of the
// Swivle.001 bounding box, centre = centre of the Vinyl.001 bounding box,
// radius = half its width, tip = the stylus cluster of the Cartridge mesh
// (lowest vertices), all read from the GLB accessors.

export const VINYL3D_ARM_GEOMETRY: ArmGeometry = {
  pivot: { u: 16.008, v: 9.951 },
  tip: { u: 3.595, v: -10.906 },
  center: { u: -4.937, v: 1.028 },
  recordRadius: 15.947,
};

export const VINYL3D_ARM_RANGE: ArmRange = armRange(VINYL3D_ARM_GEOMETRY);
