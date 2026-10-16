/**
 * A SID's player clock: how often the C64 calls its music player. A SID tune
 * advances one step every whole number of player calls (VIC raster IRQ at the
 * PAL / NTSC frame rate, or a CIA timer the tune programs itself), so the call
 * rate is the unit its tempo is made of - like a module's ticks.
 *
 * WebSID counts IRQ handler entries (emu_get_irq_calls) and stamps the system
 * cycle of the latest one (emu_get_irq_last_cycle), third-party/websid "DEViLBOX:"
 * changes. The render samples both after every chunk; the steady rate is read
 * here, past the tune's start-up (an RSID runs the kernal's 60 Hz timer before
 * it installs its own).
 *
 * Pure.
 */
import { PLAUSIBLE_BPM_MIN, PLAUSIBLE_BPM_MAX } from './autodj/beatGrid';

/** WebSID's player call counter after a render chunk. */
export interface PlayerCallSample {
  /** IRQ handler entries since the tune started. */
  calls: number;
  /** System cycle (uint32) of the latest entry. */
  lastCallCycle: number;
}

/** The share of the render skipped before the rate is read (the tune's start-up). */
export const PLAYER_CLOCK_SETTLE_FRACTION = 0.2;
/** The two halves of the read window must agree this closely, or the rate is not steady. */
export const PLAYER_CLOCK_STEADY_TOLERANCE = 0.001;
/** Fewer calls than this in the window say nothing. */
const MIN_CALLS = 50;

function periodCycles(a: PlayerCallSample, b: PlayerCallSample): number | undefined {
  const calls = b.calls - a.calls;
  if (calls < MIN_CALLS / 2) return undefined;
  return ((b.lastCallCycle - a.lastCallCycle) >>> 0) / calls;
}

/**
 * The tune's steady player call rate in Hz, or undefined when the tune makes
 * no steady IRQ calls (no player IRQ, a rate that changes over the render).
 */
export function steadyPlayerCallHz(samples: PlayerCallSample[], clockHz: number): number | undefined {
  if (!(clockHz > 0) || samples.length < 3) return undefined;
  const tail = samples.slice(Math.floor(samples.length * PLAYER_CLOCK_SETTLE_FRACTION));
  const first = tail[0], mid = tail[Math.floor(tail.length / 2)], last = tail[tail.length - 1];
  if (last.calls - first.calls < MIN_CALLS) return undefined;
  const whole = periodCycles(first, last);
  const a = periodCycles(first, mid), b = periodCycles(mid, last);
  if (!whole || !a || !b || Math.abs(a - b) / whole > PLAYER_CLOCK_STEADY_TOLERANCE) return undefined;
  return clockHz / whole;
}

/** The audio beats must lock to the whole-call grid at least this well (mean resultant length of their phases). */
export const SID_GRID_MIN_COHERENCE = 0.7;

export interface SidPlayerBeatGrid {
  /** Seconds on the rendered audio, every `callsPerBeat` player calls. */
  beats: number[];
  bpm: number;
  callsPerBeat: number;
  /** How well the detected beats lock to the grid (0-1): its phase and level, the period itself is exact. */
  coherence: number;
}

/** Mean resultant length and phase of the beat times on a period: 1 = every beat on the grid. */
function lock(beats: number[], period: number): { coherence: number; offset: number } {
  let c = 0, s = 0;
  for (const t of beats) { const a = (2 * Math.PI * t) / period; c += Math.cos(a); s += Math.sin(a); }
  const coherence = beats.length ? Math.hypot(c, s) / beats.length : 0;
  const offset = ((((Math.atan2(s, c) / (2 * Math.PI)) * period) % period) + period) % period;
  return { coherence, offset };
}

/**
 * A SID's beat grid from its player clock, like a module's from its rows: a
 * beat is a whole number of player calls. The level (how many calls) and the
 * phase come from the audio detector's beats - the whole-call period nearest
 * its tempo that its beats lock to best - and the period is then exact.
 * Venus_Falling_SCC_Extended: the detector heard 124.18 BPM and its beats
 * drift off that tempo (lock 0.09); they lock to 24 PAL frames (125.31 BPM) at
 * 0.98. Null when no whole-call period holds the beats (a free-running tune).
 */
export function sidPlayerBeatGrid(audio: { beats: number[]; bpm: number }, playerCallHz: number, durationSec: number): SidPlayerBeatGrid | null {
  if (!(playerCallHz > 0) || !(audio.bpm > 0) || audio.beats.length < 8 || !(durationSec > 0)) return null;
  const heard = (playerCallHz * 60) / audio.bpm;
  let best: { calls: number; coherence: number; offset: number } | null = null;
  for (const calls of [Math.round(heard) - 1, Math.round(heard), Math.round(heard) + 1]) {
    if (calls < 1) continue;
    const bpm = (playerCallHz * 60) / calls;
    if (bpm < PLAUSIBLE_BPM_MIN || bpm > PLAUSIBLE_BPM_MAX) continue;
    const l = lock(audio.beats, calls / playerCallHz);
    if (!best || l.coherence > best.coherence) best = { calls, ...l };
  }
  if (!best || best.coherence < SID_GRID_MIN_COHERENCE) return null;
  const period = best.calls / playerCallHz;
  const beats: number[] = [];
  for (let k = 0; best.offset + k * period < durationSec; k++) beats.push(best.offset + k * period);
  return { beats, bpm: (playerCallHz * 60) / best.calls, callsPerBeat: best.calls, coherence: best.coherence };
}
