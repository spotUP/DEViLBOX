/**
 * Timbre evidence from SYNTH PARAMETERS, for instruments that have no sample.
 *
 * `SampleSpectrum` answers "what does this sound like" by measuring PCM, and it
 * covers more formats than it first appears: a Future Composer module arrives
 * with its replayer waveforms materialised as `data:audio/wav` samples, so
 * `classifyInstrument` already returns percussion / bass / chord / pad for one.
 * Measured 2026-09-22 on `anthrox.fc`: four channels, four different roles.
 *
 * The formats it cannot help are the ones that stay synthesised — AHX and HVL
 * through `HivelySynth`, SID, and DEViLBOX's own synths. There is no PCM to
 * measure, and the name slot holds the musician's greetings rather than a
 * description, so every channel of an AHX tune collapsed to `bass` and
 * `riddimSection` had nothing melodic to mute.
 *
 * But the parameters describe the sound directly, and better than a spectrum
 * can: an AHX instrument whose performance list is all noise waveform IS
 * percussion, with no inference required. This module reads that.
 *
 * Evidence only — it reports articulation, brightness and noisiness, and a
 * role where the parameters genuinely settle one. Register and musical function
 * need the note data, which lives elsewhere and is blended by
 * `musicalChannelProfile`.
 */

import type { InstrumentConfig } from '@typedefs/instrument';
import type { ChannelRole } from './MusicAnalysis';
import type { ChannelSubrole } from './ChannelNaming';

/** Amiga video frame rate. Hively envelope times are counted in frames. */
const FRAMES_PER_SEC = 50;

export type Articulation = 'percussive' | 'plucked' | 'sustained' | 'swelling' | 'unknown';

export interface SynthTimbreEvidence {
  /** Which parameter block this came from, for attribution. */
  source: 'hively' | 'envelope' | 'oscillator';
  articulation: Articulation;
  /** 0..1, from waveform content. Triangle dark, noise brightest. */
  brightness: number;
  /** 0..1 share of the timbre that is noise. 1 = pure noise. */
  noisiness: number;
  attackMs: number;
  decayMs: number;
  releaseMs: number;
  /** True when the instrument sweeps its filter or pulse width — a moving
   *  timbre, which reads as lead or FX far more often than as a bass. */
  sweeping: boolean;
  /** True when the instrument vibratos, which a bass or a pad rarely does. */
  vibrato: boolean;
}

/**
 * Waveform numbers as HivelyPerfEntryConfig defines them: 0=triangle,
 * 1=sawtooth, 2=square, 3=noise, +4 for the filtered variants. Brightness is
 * ordinal, not measured — a square is brighter than a triangle, and noise is
 * broadband.
 */
const WAVEFORM_BRIGHTNESS = [0.2, 0.6, 0.75, 1.0];

/**
 * Total sound length below which nothing can meaningfully sustain, whatever
 * the sustain parameters claim.
 *
 * Measured on amanda.ahx: its noise instruments run attack 20 ms, decay 20 ms,
 * release 20 ms — 60 ms end to end — while `dVolume` sits high enough to set
 * the sustain flag. Checking that flag first called them `sustained`, which
 * dropped their confidence below the threshold that overrides note statistics,
 * and four hi-hat-like instruments went on being counted as bass.
 *
 * A sound that is over in 60 ms is a hit.
 */
const PERCUSSIVE_TOTAL_MS = 250;

function articulationFrom(
  attackMs: number,
  decayMs: number,
  releaseMs: number,
  sustains: boolean,
): Articulation {
  if (attackMs >= 250) return 'swelling';
  // Length first: a high sustain level on a sound that lasts 60 ms describes
  // the shape of the decay, not a sound that holds.
  if (attackMs + decayMs + releaseMs < PERCUSSIVE_TOTAL_MS) return 'percussive';
  if (sustains) return 'sustained';
  if (decayMs > 0 && decayMs < 250) return 'percussive';
  if (decayMs > 0 && decayMs < 900) return 'plucked';
  return 'sustained';
}

/**
 * Hively / AHX. The richest of these blocks and the one that matters most,
 * because AHX and HVL are exactly the formats where nothing else works.
 */
function fromHively(inst: InstrumentConfig): SynthTimbreEvidence | null {
  const h = inst.hively;
  if (!h) return null;
  const env = h.envelope;

  const attackMs = ((env?.aFrames ?? 0) / FRAMES_PER_SEC) * 1000;
  const decayMs = ((env?.dFrames ?? 0) / FRAMES_PER_SEC) * 1000;
  const releaseMs = ((env?.rFrames ?? 0) / FRAMES_PER_SEC) * 1000;
  // A note that holds its level rather than decaying away. `dVolume` is where
  // the decay lands, so a high one means the sound stays present.
  const sustains = (env?.dVolume ?? 0) >= 32 || (env?.sFrames ?? 0) > 8;

  const entries = h.performanceList?.entries ?? [];
  let noise = 0;
  let brightnessSum = 0;
  let counted = 0;
  for (const e of entries) {
    // The +4 variants are the same waveforms through the filter.
    const w = (e?.waveform ?? 0) % 4;
    brightnessSum += WAVEFORM_BRIGHTNESS[w] ?? 0.5;
    if (w === 3) noise++;
    counted++;
  }
  const noisiness = counted > 0 ? noise / counted : 0;
  const brightness = counted > 0 ? brightnessSum / counted : 0.5;

  // A filter or pulse-width sweep that actually moves. Equal limits mean the
  // parameter is parked, whatever the speed says.
  const filterSweeps = (h.filterSpeed ?? 0) > 0 && (h.filterUpperLimit ?? 0) > (h.filterLowerLimit ?? 0);
  const squareSweeps = (h.squareSpeed ?? 0) > 0 && (h.squareUpperLimit ?? 0) > (h.squareLowerLimit ?? 0);

  return {
    source: 'hively',
    articulation: articulationFrom(attackMs, decayMs, releaseMs, sustains),
    brightness,
    noisiness,
    attackMs,
    decayMs,
    releaseMs,
    sweeping: filterSweeps || squareSweeps,
    vibrato: (h.vibratoDepth ?? 0) > 0 && (h.vibratoSpeed ?? 0) > 0,
  };
}

/** The generic Tone-style envelope, in milliseconds, shared by most of the
 *  native synths. Carries no waveform information on its own. */
function fromEnvelope(inst: InstrumentConfig): SynthTimbreEvidence | null {
  const env = inst.envelope;
  if (!env) return null;
  const attackMs = env.attack ?? 0;
  const decayMs = env.decay ?? 0;
  const releaseMs = env.release ?? 0;
  const sustains = (env.sustain ?? 0) > 0.25;

  const oscType = inst.oscillator?.type ?? '';
  const noisiness = /noise/i.test(oscType) ? 1 : 0;
  const brightness = /noise/i.test(oscType) ? 1
    : /square|pulse/i.test(oscType) ? 0.75
    : /saw/i.test(oscType) ? 0.6
    : /sine|triangle/i.test(oscType) ? 0.2
    : 0.5;

  return {
    source: inst.oscillator ? 'oscillator' : 'envelope',
    articulation: articulationFrom(attackMs, decayMs, releaseMs, sustains),
    brightness,
    noisiness,
    attackMs,
    decayMs,
    releaseMs,
    // A filter envelope that actually opens the filter: `octaves` is how far
    // it travels, so zero is a filter envelope in name only.
    sweeping: (inst.filterEnvelope?.octaves ?? 0) > 0,
    vibrato: false,
  };
}

/** Timbre evidence from whichever parameter block this instrument carries. */
export function extractSynthTimbre(
  inst: InstrumentConfig | null | undefined,
): SynthTimbreEvidence | null {
  if (!inst) return null;
  return fromHively(inst) ?? fromEnvelope(inst);
}

/**
 * A role, where the parameters settle one on their own.
 *
 * Conservative on purpose. Parameters describe TIMBRE; they say nothing about
 * register or musical function, so this reports percussion, pad and lead — the
 * distinctions a timbre can carry — and stays quiet otherwise rather than
 * guessing at bass, which needs the note data.
 *
 * Confidences are chosen against the thresholds in `classifyInstrument`: 0.8
 * and above overrides note statistics in `classifyChannelWithInstruments`, so
 * only the noise cases reach it.
 */
export function classifyBySynthParams(ev: SynthTimbreEvidence): {
  role: ChannelRole; subrole?: ChannelSubrole; confidence: number;
} {
  // Noise plus a short envelope is percussion, not an inference. Nothing else
  // in a tracker sounds like that.
  if (ev.noisiness >= 0.5 && ev.articulation === 'percussive') {
    // Bright and very short reads as a hat; darker or longer as a snare. A
    // kick is not separable here — an AHX kick is usually a pitched triangle
    // with a pitch drop, which lives in the performance list's effects rather
    // than in its waveforms.
    const subrole: ChannelSubrole = ev.brightness >= 0.85 && ev.decayMs <= 120 ? 'hat' : 'snare';
    return { role: 'percussion', subrole, confidence: 0.85 };
  }
  if (ev.noisiness >= 0.5) {
    return { role: 'percussion', subrole: 'perc', confidence: 0.7 };
  }
  // Any noise at all in a short sound still suggests percussion, weakly.
  if (ev.noisiness > 0 && ev.articulation === 'percussive') {
    return { role: 'percussion', subrole: 'perc', confidence: 0.55 };
  }

  if (ev.articulation === 'swelling') {
    return { role: 'pad', confidence: 0.7 };
  }
  if (ev.articulation === 'sustained' && ev.releaseMs >= 300) {
    return { role: 'pad', confidence: 0.55 };
  }
  // A moving timbre — swept filter or pulse width, or vibrato — is how a lead
  // is built on these chips. Deliberately below the override threshold: it is
  // a tendency, not a fact, and the note data should still get a say.
  if (ev.sweeping || ev.vibrato) {
    return { role: 'lead', subrole: 'synth', confidence: 0.5 };
  }

  return { role: 'empty', confidence: 0 };
}
