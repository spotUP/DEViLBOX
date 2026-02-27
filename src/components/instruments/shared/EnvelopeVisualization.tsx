/**
 * EnvelopeVisualization - Furnace-inspired ADSR/volume envelope curve
 *
 * Draws a visual representation of an ADSR-style volume envelope, modelled
 * after Furnace tracker's drawFMEnv / drawGBEnv pattern (insEdit.cpp:1789).
 *
 * Supports two modes:
 *  - 'adsr':  standard 4-stage attack/decay/sustain/release with rate-based timing
 *  - 'steps': explicit volume steps (SoundMon-style: attackVol, decayVol, etc.)
 *
 * Usage:
 *   // FM-style (rate-based):
 *   <EnvelopeVisualization mode="adsr" ar={20} dr={15} d2r={0} rr={8} sl={6} tl={0} maxTl={127} />
 *
 *   // SoundMon-style (volume+speed per stage):
 *   <EnvelopeVisualization
 *     mode="steps"
 *     attackVol={60} attackSpeed={4}
 *     decayVol={40}  decaySpeed={3}
 *     sustainVol={32} sustainLen={16}
 *     releaseVol={0} releaseSpeed={6}
 *     maxVol={64}
 *   />
 */

import React, { useRef, useEffect, useCallback } from 'react';

// ── Shared style constants ─────────────────────────────────────────────────────

const COLOR_ENV        = '#7dd3fc';   // sky-300  – main envelope line
const COLOR_SUSTAIN    = 'rgba(125, 211, 252, 0.35)'; // sustain region fill
const COLOR_RELEASE    = 'rgba(239, 68, 68, 0.18)';   // release region fill
const COLOR_GRID       = '#1e2a3a';
const COLOR_BACKGROUND = '#0d1117';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ADSRProps {
  mode: 'adsr';
  /** Attack rate  0-31 (higher = faster) */
  ar: number;
  /** Decay rate   0-31 */
  dr: number;
  /** Decay-2 rate 0-31 (sustain decay) */
  d2r?: number;
  /** Release rate 0-15 */
  rr: number;
  /** Sustain level 0-15 (0 = silent, 15 = max) */
  sl: number;
  /** Total level (attenuation): 0 = loudest. Range depends on chip. */
  tl: number;
  maxTl?: number;   // Default: 127
  maxRate?: number; // Default: 31
  width?: number;
  height?: number;
  color?: string;
}

interface LinearProps {
  mode: 'linear';
  /** Attack time 0–1 (0 = instant, 1 = maximum) */
  attack: number;
  /** Decay time 0–1 */
  decay: number;
  /** Sustain level 0–1 (0 = silent, 1 = full volume) */
  sustain: number;
  /** Release time 0–1 */
  release: number;
  width?: number;
  height?: number;
  color?: string;
}

interface StepsProps {
  mode: 'steps';
  /** Volume after attack phase (0–maxVol) */
  attackVol: number;
  /** Steps / ticks for attack ramp */
  attackSpeed: number;
  /** Volume after decay phase */
  decayVol: number;
  /** Steps for decay ramp */
  decaySpeed: number;
  /** Sustain hold volume */
  sustainVol: number;
  /** Ticks to hold sustain */
  sustainLen: number;
  /** Target volume of release (typically 0) */
  releaseVol?: number;
  /** Steps for release ramp */
  releaseSpeed: number;
  /** Max volume value (e.g. 64 for SoundMon) */
  maxVol: number;
  width?: number;
  height?: number;
  color?: string;
}

export type EnvelopeVisualizationProps = ADSRProps | LinearProps | StepsProps;

// ── Component ──────────────────────────────────────────────────────────────────

export const EnvelopeVisualization: React.FC<EnvelopeVisualizationProps> = (props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const w = props.width  ?? 280;
  const h = props.height ?? 72;
  const strokeColor = props.color ?? COLOR_ENV;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width        = w * dpr;
    canvas.height       = h * dpr;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // Background + grid
    ctx.fillStyle = COLOR_BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth   = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (props.mode === 'adsr') {
      drawADSR(ctx, w, h, props, strokeColor);
    } else if (props.mode === 'linear') {
      drawLinear(ctx, w, h, props, strokeColor);
    } else {
      drawSteps(ctx, w, h, props, strokeColor);
    }
  }, [props, w, h, strokeColor]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}
    />
  );
};

// ── ADSR mode (FM-style rate-based) ───────────────────────────────────────────

function drawADSR(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: ADSRProps,
  color: string,
) {
  const maxTl   = p.maxTl   ?? 127;
  const maxRate = p.maxRate  ?? 31;
  const d2r     = p.d2r     ?? 0;

  // Normalised amplitude (0 = silent = bottom, 1 = peak = top)
  const amp = 1.0 - p.tl / maxTl;       // peak amplitude after attack

  // Normalised x-positions (0..1 across canvas)
  // Attack rate: 0 = instant, maxRate = silent forever
  const arFrac  = (maxRate - p.ar) / maxRate;         // 0 = instant attack
  const drFrac  = (p.sl / 15) * ((maxRate - p.dr) / maxRate); // decay portion
  const d2rFrac = ((15 - p.sl) / 15) * ((31 - d2r) / 31);
  const rrFrac  = (15 - p.rr) / 15;

  // Compress A/D section to left half, R to right half
  const xA  = arFrac  * 0.45;          // peak of AR
  const xD  = xA + drFrac * 0.45;     // end of DR (sustain start)
  const xD2 = xD + d2rFrac * 0.45;    // end of D2R
  const xR  = rrFrac;                  // release end (in right half)

  // Y positions (canvas: 0 = top = loud, h = bottom = silent)
  const yPeak    = (1 - amp) * h;                // height of attack peak
  const ySustain = (1 - (amp * (p.sl / 15))) * h; // sustain level Y

  // Release region (shaded triangle)
  ctx.fillStyle = COLOR_RELEASE;
  ctx.beginPath();
  ctx.moveTo(0, yPeak);
  ctx.lineTo(xR * w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Sustain guide lines
  if (p.sl < 15) {
    ctx.strokeStyle = COLOR_SUSTAIN;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xD * w, ySustain); ctx.lineTo(w, ySustain); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Envelope curve
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, h);                // start: silence

  if (p.ar === 0) {
    // AR = 0: never attacks, stays silent
    ctx.lineTo(w, h);
  } else {
    ctx.lineTo(xA * w, yPeak);    // Attack
    ctx.lineTo(xD * w, ySustain); // Decay

    if (d2r > 0) {
      ctx.lineTo(xD2 * w, h);    // D2R to silence
    } else {
      ctx.lineTo(w, ySustain);   // Hold sustain forever
    }
  }
  ctx.stroke();

  // Axis labels
  ctx.fillStyle   = 'rgba(255,255,255,0.3)';
  ctx.font        = '8px monospace';
  ctx.fillText('A', xA * w + 2, yPeak - 3 > 8 ? yPeak - 3 : yPeak + 9);
  ctx.fillText('D', xD * w + 2, ySustain - 3 > 8 ? ySustain - 3 : 9);
  ctx.fillText('R', 2, h - 4);
}

// ── Linear mode (normalised 0-1 A/D/S/R times + sustain level) ────────────────

function drawLinear(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: LinearProps,
  color: string,
) {
  const a = Math.max(0, Math.min(1, p.attack));
  const d = Math.max(0, Math.min(1, p.decay));
  const s = Math.max(0, Math.min(1, p.sustain));
  const r = Math.max(0, Math.min(1, p.release));

  // Time-proportional layout with a fixed sustain-hold fraction for display
  const HOLD  = 0.25;
  const total = a + d + HOLD + r;
  const toX = (t: number) => (t / total) * w;

  const xA = toX(a);
  const xD = toX(a + d);
  const xS = toX(a + d + HOLD); // xR = w

  const yTop = 2;
  const ySus = yTop + (1 - s) * (h - yTop - 2);

  // Sustain region fill
  ctx.fillStyle = COLOR_SUSTAIN;
  ctx.fillRect(xD, 0, xS - xD, h);

  // Envelope curve
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(xA, yTop);
  ctx.lineTo(xD, ySus);
  ctx.lineTo(xS, ySus);
  ctx.lineTo(w, h);
  ctx.stroke();

  // Phase labels
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font      = '8px monospace';
  ctx.textAlign = 'center';
  const mid = (x1: number, x2: number) => (x1 + x2) / 2;
  if (xA > 10) ctx.fillText('A', mid(0,  xA), h - 4);
  ctx.fillText('D', mid(xA, xD), h - 4);
  ctx.fillText('S', mid(xD, xS), h - 4);
  ctx.fillText('R', mid(xS, w),  h - 4);
  ctx.textAlign = 'left';
}

// ── Steps mode (SoundMon-style explicit volume+speed) ─────────────────────────

function drawSteps(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: StepsProps,
  color: string,
) {
  const { attackVol, attackSpeed, decayVol, decaySpeed,
          sustainVol, sustainLen, releaseSpeed, maxVol } = p;
  const releaseVol = p.releaseVol ?? 0;

  // Normalise all speeds/lengths to proportional widths
  // Use a log-ish scale so very different speeds are still visible
  const atkW  = Math.max(1, attackSpeed  + 1);
  const decW  = Math.max(1, decaySpeed   + 1);
  const susW  = Math.max(1, Math.min(sustainLen, 48)); // cap sustain display
  const relW  = Math.max(1, releaseSpeed + 1);
  const total = atkW + decW + susW + relW;

  const toX = (x: number) => (x / total) * w;
  const toY = (v: number) => h - (v / maxVol) * h;

  // Sustain region fill
  const xSusStart = toX(atkW + decW);
  const xSusEnd   = toX(atkW + decW + susW);
  ctx.fillStyle = COLOR_SUSTAIN;
  ctx.fillRect(xSusStart, 0, xSusEnd - xSusStart, h);

  // Envelope line
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(0, h);                              // origin: silence

  const x1 = toX(atkW);
  const x2 = toX(atkW + decW);
  const x3 = xSusEnd;
  const x4 = toX(total);

  ctx.lineTo(x1, toY(attackVol));               // Attack peak
  ctx.lineTo(x2, toY(decayVol));                // End of decay
  ctx.lineTo(x3, toY(sustainVol));              // End of sustain (may differ from decay end)
  ctx.lineTo(x4, toY(releaseVol));              // End of release
  ctx.stroke();

  // Phase labels
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font      = '8px monospace';
  ctx.fillText('A', 2,    h - 4);
  ctx.fillText('D', x1 + 2, h - 4);
  ctx.fillText('S', xSusStart + 3, h - 4);
  ctx.fillText('R', x3 + 2, h - 4);

  // Sustain level dashed guide
  ctx.strokeStyle  = COLOR_SUSTAIN;
  ctx.lineWidth    = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(x2, toY(sustainVol)); ctx.lineTo(w, toY(sustainVol)); ctx.stroke();
  ctx.setLineDash([]);
}

export default EnvelopeVisualization;
