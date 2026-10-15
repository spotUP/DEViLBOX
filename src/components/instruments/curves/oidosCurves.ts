/**
 * oidosCurves.ts - the Oidos additive engine (oidos-wasm/src/lib.rs) as curves. Oidos is a modal synth: a note is the sum
 * of modes x fat decaying sinusoids whose frequencies, starting amplitudes and phases come from a fixed random table
 * addressed by the seed. This module replays the voice set-up (OidosVoice::init) exactly, so the spectrum and the decay
 * it draws are the engine's partials, not a sketch.
 *
 * Layout values are the 0..1 knobs; set_parameter maps them: seed round(v 100), modes round(v 100), fat round(v 100),
 * width v^5 100 semitones, overtones round(v 100), sharpness 5v - 4, harmonicity 2v - 1, decay low v, decay high sets
 * the span (high - low), filter edge (2v - 1) 120 semitones, slope (1 - v)^3, sweep (v - 0.5)^3 12000 semitones per
 * second, gain 4096^(v - 0.25), attack time v^2 seconds (0 is instant), release time v seconds (0 is instant).
 *
 *  - Partial i: ptone = tone + reltone + rand * width; frequency 440 * 2^((ptone - 57) / 12) Hz; amplitude
 *    mamp * ampmul^n with ampmul = decay^(1 / (4096 / 44100) / fs) per sample, so the level falls by `decay` every 92.9 ms.
 *  - The partial gain is min(low, high, 1) clipped at 0, low = 1 - slopeLow (fLow + t sweepLow - rel) and high =
 *    1 - slopeHigh (rel - fHigh - t sweepHigh), rel = ptone - tone: a window in semitones around the note whose edges
 *    move at the sweep rates.
 *  - Output = s * sqrt(gain / (n + (gain - 1) s^2)) * envelope: for a small s that is linear in s, which is how the level
 *    curve is drawn (relative to its own start); the soft clip only bends it for hot patches.
 *
 * Not modelled (named): voice stealing (the 17th note takes voice 0) and the soft clip's bend.
 */
import type { CurveDescriptor } from '@/types/synthPanel';
import { audioSampleRate, envelopeDomain, envelopeMarkerX, logGrid, num, voiceMarker, FILTER_DB_MIN, type StagedEnvelope } from './wasmSubtractiveModels';
import { fmtMs } from './commonCurveModels';

export const OIDOS_SYNTH_TYPE = 'OidosSynth';
const NOISESIZE = 64;
const TOTAL_SEMITONES = 120;
const DECAY_TIME = 4096 / 44100;
type Get = (key: string) => number;

// ---- the engine's random table --------------------------------------------------------------------------

let randomTable: Uint32Array | null = null;
/** generate_random_data(): 64^3 words from the fixed seed. */
export function oidosRandomData(): Uint32Array {
  if (randomTable) return randomTable;
  const out = new Uint32Array(NOISESIZE ** 3);
  const state = new Uint32Array([0x6f15aaf2, 0x4e89d208, 0x9548b49a, 0x9c4fd335]);
  for (let n = 0; n < out.length; n++) {
    let r = 0;
    for (let s = 0; s < 3; s++) {
      const k = state[s] & 31;
      const rotated = k === 0 ? state[s] : ((state[s] >>> k) | (state[s] << (32 - k))) >>> 0;
      state[s] = (rotated + state[s + 1]) >>> 0;
      r = (r ^ state[s]) >>> 0;
    }
    out[n] = r;
  }
  randomTable = out;
  return out;
}

// ---- parameters -----------------------------------------------------------------------------------------

export interface OidosEngineParams {
  seed: number; modes: number; fat: number; width: number; overtones: number; sharpness: number; harmonicity: number;
  decayLow: number; decayDiff: number; fLow: number; slopeLow: number; sweepLow: number; fHigh: number; slopeHigh: number;
  sweepHigh: number; gain: number; attack: number; release: number;
}
const clampInt = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.floor(v * 100 + 0.5)));

/** OidosSynth::set_parameter for the whole knob set. */
export function oidosParams(get: Get): OidosEngineParams {
  const decayLow = num(get('decayLow'), 1);
  return {
    seed: clampInt(num(get('seed'), 0.5), 0, 99),
    modes: clampInt(num(get('modes'), 0.4), 1, 100),
    fat: clampInt(num(get('fat'), 0.1), 1, 100),
    width: num(get('width'), 0.34) ** 5 * 100,
    overtones: clampInt(num(get('overtones'), 0.27), 0, 100),
    sharpness: num(get('sharpness'), 0.9) * 5 - 4,
    harmonicity: num(get('harmonicity'), 1) * 2 - 1,
    decayLow,
    decayDiff: num(get('decayHigh'), 1) - decayLow,
    fLow: (num(get('filterLow')) * 2 - 1) * TOTAL_SEMITONES,
    slopeLow: (1 - num(get('filterSlopeLow'))) ** 3,
    sweepLow: (num(get('filterSweepLow'), 0.5) - 0.5) ** 3 * TOTAL_SEMITONES * 100,
    fHigh: (num(get('filterHigh'), 1) * 2 - 1) * TOTAL_SEMITONES,
    slopeHigh: (1 - num(get('filterSlopeHigh'))) ** 3,
    sweepHigh: (num(get('filterSweepHigh'), 0.5) - 0.5) ** 3 * TOTAL_SEMITONES * 100,
    gain: 4096 ** (num(get('gain'), 0.25) - 0.25),
    attack: num(get('attack'), 0.25),
    release: num(get('release'), 0.5),
  };
}

export interface OidosPartial {
  /** semitones from the played note */
  rel: number;
  hz: number;
  amplitude: number;
  /** level multiplier per second */
  decayPerSecond: number;
}

/** OidosVoice::init for a played tone (the engine's own note number). */
export function oidosPartials(p: OidosEngineParams, tone: number): OidosPartial[] {
  const data = oidosRandomData();
  const partials: OidosPartial[] = [];
  for (let m = 0; m < p.modes; m++) {
    let index = m * 256 + p.seed;
    const rnd = (): number => { const r = data[index % data.length]; index++; return (r | 0) / 2147483648; };
    const subtone = Math.abs(rnd());
    const reltoneRaw = subtone * p.overtones;
    const decay = p.decayLow + subtone * p.decayDiff;
    const relfreq = 2 ** (reltoneRaw / 12);
    const relfreqOt = Math.floor(relfreq + 0.5);
    const relfreqH = relfreq + (relfreqOt - relfreq) * p.harmonicity;
    const reltone = (Math.log(relfreqH) / Math.LN2) * 12;
    const mtone = tone + reltone;
    const mamp = rnd() * 2 ** ((reltone * p.sharpness) / 12);
    for (let f = 0; f < p.fat; f++) {
      const ptone = mtone + rnd() * p.width;
      rnd(); // the starting phase
      partials.push({
        rel: ptone - tone,
        hz: 440 * 2 ** ((ptone - 57) / 12),
        amplitude: Math.abs(mamp),
        decayPerSecond: decay ** (1 / DECAY_TIME),
      });
    }
  }
  return partials;
}

/** The partial gain at `t` seconds (the filter window with its moving edges). */
export function oidosPartialGain(p: OidosEngineParams, rel: number, t: number): number {
  const low = 1 - p.slopeLow * (p.fLow + t * p.sweepLow - rel);
  const high = 1 - p.slopeHigh * (rel - p.fHigh - t * p.sweepHigh);
  return Math.min(1, Math.max(0, Math.min(low, high)));
}

/** Output level of the voice at `t` seconds, relative units: RMS of the incoherent partial sum, times the gain law. */
export function oidosLevel(p: OidosEngineParams, partials: readonly OidosPartial[], t: number): number {
  let power = 0;
  for (const q of partials) {
    const a = q.amplitude * oidosPartialGain(p, q.rel, t) * q.decayPerSecond ** t;
    power += a * a;
  }
  return Math.sqrt(power / 2) * Math.sqrt(p.gain / Math.max(1, partials.length));
}

// ---- envelope -------------------------------------------------------------------------------------------

/** Attack: linear in attack^2 seconds; release: linear in `release` seconds. Level stays at 1 between (decay is in the modes). */
export function oidosEnvelope(attack: number, release: number, hold = 0.25): StagedEnvelope {
  const a = attack * attack;
  const attackEnd = a;
  const releaseAt = attackEnd + hold;
  const points: Array<[number, number]> = [[0, a === 0 ? 1 : 0], [attackEnd, 1], [releaseAt, 1], [releaseAt + release, 0]];
  return { points, attackEnd, decayEnd: attackEnd, releaseAt, total: releaseAt + release };
}

// ---- curve descriptors ----------------------------------------------------------------------------------

/** The window over time the filter curves and the decay curve share: long enough for the slowest mode to fall 60 dB, capped. */
export function oidosWindowSeconds(p: OidosEngineParams): number {
  const slowest = Math.max(p.decayLow, p.decayLow + p.decayDiff);
  if (slowest >= 0.9999) return 8;
  if (slowest <= 0) return 0.5;
  return Math.min(8, Math.max(0.5, (Math.log(0.001) / Math.log(slowest)) * DECAY_TIME));
}

const MIDDLE_C = 60;

export function oidosCurves(sampleRate: () => number = audioSampleRate): Record<'envelope' | 'decay' | 'window' | 'spectrum', CurveDescriptor> {
  void sampleRate;
  return {
    envelope: {
      label: 'Envelope', xUnit: 's', yDomain: [0, 1],
      xDomain: (get) => envelopeDomain(oidosEnvelope(num(get('attack'), 0.25), num(get('release'), 0.5))),
      series: (get) => [{ points: oidosEnvelope(num(get('attack'), 0.25), num(get('release'), 0.5)).points, fill: true }],
      readout: (get) => `A ${fmtMs(num(get('attack'), 0.25) ** 2 * 1000)}  R ${fmtMs(num(get('release'), 0.5) * 1000)}`,
      marker: voiceMarker(OIDOS_SYNTH_TYPE, (v, get) => envelopeMarkerX(oidosEnvelope(num(get('attack'), 0.25), num(get('release'), 0.5)), v.stage, v.level)),
    },
    decay: {
      label: 'Mode Decay (level over time)', xUnit: 's', yDomain: [0, 1],
      xDomain: (get) => [0, oidosWindowSeconds(oidosParams(get))],
      series: (get) => {
        const p = oidosParams(get);
        const partials = oidosPartials(p, MIDDLE_C);
        const window = oidosWindowSeconds(p);
        const levels = Array.from({ length: 80 }, (_, i) => oidosLevel(p, partials, (i / 79) * window));
        const peak = Math.max(1e-12, ...levels);
        return [{ points: levels.map((l, i) => [(i / 79) * window, l / peak] as [number, number]), fill: true }];
      },
      readout: (get) => { const p = oidosParams(get); return `${p.modes} modes x ${p.fat}  decay ${p.decayLow.toFixed(2)} to ${(p.decayLow + p.decayDiff).toFixed(2)} per ${(DECAY_TIME * 1000).toFixed(0)} ms`; },
      marker: voiceMarker(OIDOS_SYNTH_TYPE, (v, get) => Math.min(v.elapsedSeconds, oidosWindowSeconds(oidosParams(get)))),
    },
    window: {
      label: 'Filter Window (semitones from the note)', xUnit: 's', yUnit: 'semitones', yDomain: [-TOTAL_SEMITONES, TOTAL_SEMITONES],
      xDomain: (get) => [0, oidosWindowSeconds(oidosParams(get))],
      series: (get) => {
        const p = oidosParams(get);
        const window = oidosWindowSeconds(p);
        // the semitone where the gain reaches 1 on each side, then clipped to the plot
        const edge = (t: number, side: 'low' | 'high'): number => Math.max(-TOTAL_SEMITONES, Math.min(TOTAL_SEMITONES, side === 'low' ? p.fLow + t * p.sweepLow : p.fHigh + t * p.sweepHigh));
        const ts = Array.from({ length: 60 }, (_, i) => (i / 59) * window);
        return [
          { points: ts.map((t) => [t, edge(t, 'low')] as [number, number]) },
          { points: ts.map((t) => [t, edge(t, 'high')] as [number, number]), color: 'rgba(255,255,255,0.55)' },
        ];
      },
      readout: (get) => { const p = oidosParams(get); return `low ${p.fLow.toFixed(0)} st ${p.sweepLow >= 0 ? '+' : ''}${p.sweepLow.toFixed(0)}/s  high ${p.fHigh.toFixed(0)} st ${p.sweepHigh >= 0 ? '+' : ''}${p.sweepHigh.toFixed(0)}/s`; },
      marker: voiceMarker(OIDOS_SYNTH_TYPE, (v, get) => Math.min(v.elapsedSeconds, oidosWindowSeconds(oidosParams(get)))),
    },
    spectrum: {
      label: 'Spectrum at the start (middle C)', xScale: 'log', xDomain: [20, 20000], yDomain: [FILTER_DB_MIN, 6], xUnit: 'Hz', yUnit: 'dB',
      series: (get) => {
        const p = oidosParams(get);
        const partials = oidosPartials(p, MIDDLE_C);
        const grid = logGrid(120);
        const bins = new Array<number>(grid.length).fill(0);
        let peak = 1e-12;
        for (const q of partials) {
          const a = q.amplitude * oidosPartialGain(p, q.rel, 0);
          if (a <= 0 || q.hz < 20 || q.hz > 20000) continue;
          const k = Math.min(grid.length - 1, Math.max(0, Math.round((Math.log(q.hz / 20) / Math.log(1000)) * (grid.length - 1))));
          bins[k] = Math.max(bins[k], a);
          peak = Math.max(peak, a);
        }
        return [{ points: grid.map((hz, i) => [hz, bins[i] > 0 ? Math.max(FILTER_DB_MIN, 20 * Math.log10(bins[i] / peak)) : FILTER_DB_MIN] as [number, number]), fill: true }];
      },
      readout: (get) => `${oidosPartials(oidosParams(get), MIDDLE_C).length} partials`,
    },
  };
}
