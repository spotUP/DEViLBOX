/**
 * Where the playing voice sits on each klystrack curve: a live voice report in, an x position in the curve's own
 * units out. Pure, so the mapping is tested without a canvas or an engine.
 *
 *  - Volume envelope: the point of the stage the engine reports whose gain equals the reported level (the report
 *    carries the stage and the level, not the time inside the release, so the time is found from the level).
 *  - Filter response: the engine's effective cutoff (after the program and the envelope) as the filter's corner
 *    frequency, so the marker slides along the curve as the program sweeps the filter.
 *  - Vibrato / pulse width LFO: the phase from the ticks since the note began (the LFO position moves by `speed`
 *    every tick, music.c:1399), on the same two-cycle x axis the curve is drawn on.
 */
import type { KlysVoiceMarker } from '@/engine/klystrack/klysVoiceStatus';
import { adsrEnvelope, envelopeGain, filterStageCornerHz, ENVELOPE_MAX } from './klysCurveModels';

const VIB_TAB_SIZE = 128; // music.c:43

export function envelopeMarkerX(
  a: number, d: number, s: number, r: number, sampleRate: number, voice: KlysVoiceMarker,
): number {
  const env = adsrEnvelope(a, d, s, r, sampleRate);
  const { attackSeconds, decaySeconds } = env;
  const decayEnd = attackSeconds + decaySeconds;
  const inRange = (lo: number, hi: number) => env.points.filter((p) => p.x >= lo - 1e-9 && p.x <= hi + 1e-9);
  const nearest = (pts: { x: number; y: number }[], gain: number): number => {
    let best = pts[0], bestErr = Infinity;
    for (const p of pts) { const err = Math.abs(p.y - gain); if (err < bestErr) { best = p; bestErr = err; } }
    return best.x;
  };
  // The report holds the 24-bit accumulator shifted right by 8 as a fraction of 65535.
  const gain = envelopeGain(Math.min(ENVELOPE_MAX, voice.level * 65535 * 256), voice.stage === 'attack');
  switch (voice.stage) {
    case 'attack': return nearest(inRange(0, attackSeconds), gain);
    case 'decay': return nearest(inRange(attackSeconds, decayEnd), gain);
    case 'sustain': return (decayEnd + env.releaseAtSeconds) / 2;
    case 'release': {
      const tail = inRange(env.releaseAtSeconds, env.totalSeconds + 1e9);
      return tail.length > 0 ? nearest(tail, gain) : env.releaseAtSeconds;
    }
    default: return env.totalSeconds;
  }
}

/** The filter marker's x (Hz); null when the filter is not on. */
export function filterMarkerX(filterOn: boolean, voice: KlysVoiceMarker, sampleRate: number): number | null {
  return filterOn ? filterStageCornerHz(voice.cutoff, sampleRate) : null;
}

/** The LFO marker's x on the curve's 0..1 axis (two cycles); null when the LFO does not move. */
export function lfoMarkerX(speed: number, voice: KlysVoiceMarker, tickRate: number): number | null {
  if (speed <= 0) return null;
  const ticks = voice.elapsedSeconds * tickRate;
  const cycles = (ticks * speed) / (2 * VIB_TAB_SIZE);
  return (cycles % 2) / 2;
}
