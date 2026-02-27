/**
 * Envelope Converter
 * Converts point-based XM/IT envelopes to ADSR envelopes for playback
 *
 * XM envelopes are point-based with arbitrary shapes, while our synth uses ADSR.
 * This converter analyzes the envelope curve and extracts best-fit ADSR parameters.
 * Original envelope points are preserved in metadata for future point-based editor.
 */

import type { EnvelopePoints, EnvelopePoint } from '../../types/tracker';
import type { EnvelopeConfig } from '../../types/instrument';

/**
 * Convert point-based envelope to ADSR approximation
 */
export function convertEnvelopeToADSR(
  envelope: EnvelopePoints | undefined,
  defaultSustain: number = 0
): EnvelopeConfig {
  // Default tracker-style envelope (fast attack, decay to silence)
  const defaultEnvelope: EnvelopeConfig = {
    attack: 10,
    decay: 500,
    sustain: defaultSustain,
    release: 100,
  };

  if (!envelope || !envelope.enabled || envelope.points.length < 2) {
    return defaultEnvelope;
  }

  const points = envelope.points;

  try {
    // Extract ADSR segments from point curve
    const attack = calculateAttackTime(points);
    const { decay, sustain } = calculateDecayAndSustain(
      points,
      attack,
      envelope.sustainPoint
    );
    const release = calculateReleaseTime(points, envelope.sustainPoint);

    return {
      attack: Math.max(0, Math.min(2000, attack)),
      decay: Math.max(0, Math.min(2000, decay)),
      sustain: Math.max(0, Math.min(100, sustain)),
      release: Math.max(0, Math.min(5000, release)),
    };
  } catch (error) {
    console.warn('Failed to convert envelope, using default:', error);
    return defaultEnvelope;
  }
}

/**
 * Calculate attack time (0 to peak)
 * Attack is the time from first point to the highest point in the initial rise
 */
function calculateAttackTime(points: EnvelopePoint[]): number {
  if (points.length === 0) return 10;

  const firstPoint = points[0];
  let peakIdx = 0;
  let peakValue = points[0].value;

  // Find first peak
  for (let i = 1; i < points.length; i++) {
    if (points[i].value > peakValue) {
      peakValue = points[i].value;
      peakIdx = i;
    } else if (points[i].value < peakValue - 5) {
      // Started declining, peak found
      break;
    }
  }

  const peakPoint = points[peakIdx];
  const attackTicks = peakPoint.tick - firstPoint.tick;

  // Convert ticks to milliseconds
  // At 125 BPM, 6 ticks/row: tick rate = (125 * 2.5) / 60 = 5.208 Hz
  // 1 tick ≈ 192ms at speed 6
  const tickToMs = 192 / 6; // Approximate ms per tick
  return Math.max(1, attackTicks * tickToMs);
}

/**
 * Calculate decay time and sustain level
 * Decay is from peak to sustain point (or steady state)
 */
function calculateDecayAndSustain(
  points: EnvelopePoint[],
  _attackTime: number,
  sustainPointIdx: number | null
): { decay: number; sustain: number } {
  if (points.length === 0) return { decay: 500, sustain: 0 };

  // Find peak value
  let peakIdx = 0;
  let peakValue = points[0].value;
  for (let i = 0; i < points.length; i++) {
    if (points[i].value > peakValue) {
      peakValue = points[i].value;
      peakIdx = i;
    }
  }

  // Find sustain point or steady state
  // Guard: treat negative sustainPointIdx (e.g. -1 from IT when disabled) as absent
  const validSustainIdx = (sustainPointIdx !== null && sustainPointIdx >= 0 && sustainPointIdx < points.length)
    ? sustainPointIdx : null;
  let sustainIdx = validSustainIdx ?? peakIdx;
  let sustainValue = points[sustainIdx]?.value ?? peakValue;

  // If sustain point is specified, use it
  if (validSustainIdx !== null) {
    sustainValue = points[validSustainIdx].value;
  } else {
    // Find where envelope stabilizes (change < 10%)
    for (let i = peakIdx + 1; i < points.length; i++) {
      const change = Math.abs(points[i].value - points[i - 1].value);
      if (change < 6) {
        // Stable
        sustainIdx = i;
        sustainValue = points[i].value;
        break;
      }
    }
  }

  // Calculate decay time
  const decayTicks = (sustainIdx < points.length ? points[sustainIdx].tick : points[peakIdx].tick) - points[peakIdx].tick;
  const tickToMs = 192 / 6;
  const decay = Math.max(0, decayTicks * tickToMs);

  // Calculate sustain level (0-100%)
  const sustain = (sustainValue / 64) * 100;

  return { decay, sustain };
}

/**
 * Calculate release time
 * Release is from sustain point to end (value 0) or last point
 */
function calculateReleaseTime(
  points: EnvelopePoint[],
  sustainPointIdx: number | null
): number {
  if (points.length === 0) return 100;

  // Start from sustain point or last stable point
  const startIdx = sustainPointIdx ?? Math.max(0, points.length - 2);

  if (startIdx >= points.length - 1) {
    return 100; // Default release
  }

  // Find where envelope reaches near-zero or end
  let endIdx = points.length - 1;
  for (let i = startIdx + 1; i < points.length; i++) {
    if (points[i].value < 5) {
      endIdx = i;
      break;
    }
  }

  const releaseTicks = points[endIdx].tick - points[startIdx].tick;
  const tickToMs = 192 / 6;
  return Math.max(10, releaseTicks * tickToMs);
}

/**
 * Analyze envelope shape and suggest parameters
 * Provides hints for sample analysis when converting to synths
 */
export function analyzeEnvelopeShape(
  envelope: EnvelopePoints | undefined
): {
  type: 'pluck' | 'pad' | 'percussive' | 'sustained' | 'unknown';
  hasQuickAttack: boolean;
  hasSustain: boolean;
  hasLongRelease: boolean;
} {
  if (!envelope || !envelope.enabled || envelope.points.length < 2) {
    return {
      type: 'unknown',
      hasQuickAttack: false,
      hasSustain: false,
      hasLongRelease: false,
    };
  }

  const adsr = convertEnvelopeToADSR(envelope);

  const hasQuickAttack = adsr.attack < 20;
  const hasSustain = adsr.sustain > 20;
  const hasLongRelease = adsr.release > 500;

  let type: 'pluck' | 'pad' | 'percussive' | 'sustained' | 'unknown' = 'unknown';

  if (hasQuickAttack && !hasSustain && adsr.decay < 300) {
    type = 'pluck'; // Quick attack, fast decay, no sustain
  } else if (hasQuickAttack && !hasSustain && adsr.decay < 100) {
    type = 'percussive'; // Very fast decay
  } else if (!hasQuickAttack && hasSustain) {
    type = 'pad'; // Slow attack, sustained
  } else if (hasQuickAttack && hasSustain) {
    type = 'sustained'; // Quick attack but sustained
  }

  return {
    type,
    hasQuickAttack,
    hasSustain,
    hasLongRelease,
  };
}

/**
 * Generate point-based envelope from ADSR
 * Useful for creating envelopes for synth instruments that will be exported to XM
 */
export function adsrToEnvelopePoints(adsr: EnvelopeConfig): EnvelopePoints {
  const points: EnvelopePoint[] = [];
  const tickToMs = 192 / 6; // Approximate tick duration

  // Point 0: Start at 0
  points.push({ tick: 0, value: 0 });

  // Point 1: Attack peak
  const attackTicks = Math.round(adsr.attack / tickToMs);
  points.push({ tick: attackTicks, value: 64 });

  // Point 2: Decay to sustain
  const decayTicks = Math.round(adsr.decay / tickToMs);
  const sustainValue = Math.round((adsr.sustain / 100) * 64);
  points.push({ tick: attackTicks + decayTicks, value: sustainValue });

  // Point 3: Sustain hold (arbitrary duration)
  const sustainTicks = 50; // Hold for 50 ticks
  points.push({
    tick: attackTicks + decayTicks + sustainTicks,
    value: sustainValue,
  });

  // Point 4: Release to 0
  const releaseTicks = Math.round(adsr.release / tickToMs);
  points.push({
    tick: attackTicks + decayTicks + sustainTicks + releaseTicks,
    value: 0,
  });

  return {
    enabled: true,
    points,
    sustainPoint: 2, // Index of sustain point
    loopStartPoint: null,
    loopEndPoint: null,
  };
}

/**
 * Interpolate envelope value at specific tick
 * Used for real-time envelope processing in future point-based playback
 */
export function interpolateEnvelopeValue(
  envelope: EnvelopePoints,
  tick: number
): number {
  if (!envelope.enabled || envelope.points.length === 0) {
    return 64; // Full volume
  }

  const points = envelope.points;

  // Before first point
  if (tick <= points[0].tick) {
    return points[0].value;
  }

  // After last point
  if (tick >= points[points.length - 1].tick) {
    return points[points.length - 1].value;
  }

  // Find surrounding points
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (tick >= p1.tick && tick <= p2.tick) {
      // Linear interpolation
      const t = (tick - p1.tick) / (p2.tick - p1.tick);
      return p1.value + (p2.value - p1.value) * t;
    }
  }

  return 64;
}
