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
  /**
   * Largest downward pitch move the instrument makes to itself, in semitones.
   *
   * This is how a kick is built on a chip: not with noise, but with a pitched
   * waveform swept hard downwards over a few frames. An AHX instrument does it
   * through the note column of its performance list, or with a downward period
   * slide, and neither leaves any trace in the envelope or the waveform mix.
   */
  pitchDropSemitones: number;
}

/**
 * Waveform numbers as HivelyPerfEntryConfig defines them: 0=triangle,
 * 1=sawtooth, 2=square, 3=noise, +4 for the filtered variants. Brightness is
 * ordinal, not measured — a square is brighter than a triangle, and noise is
 * broadband.
 */
const WAVEFORM_BRIGHTNESS = [0.2, 0.6, 0.75, 1.0];

/**
 * How far a sound must fall to read as a drum rather than a melodic gesture.
 *
 * Measured across amanda.ahx and jennipha.ahx, every Hively instrument:
 *
 *     drop 55  80ms  noise 0.50   amanda  inst 8    the kick
 *     drop 39 140ms  noise 0.17   jennipha inst 1   the kick
 *     drop 34 140ms  noise 0.17   jennipha inst 7   a tom
 *     drop 12 460ms  noise 0.25   jennipha inst 8-10  melodic
 *     drop  9 160ms  noise 0      jennipha inst 2   melodic
 *     drop  5 140ms  noise 0      jennipha inst 3   melodic
 *     drop  0  ...                everything else
 *
 * Two octaves sits in the gap between 12 and 34 with room on both sides. A
 * melodic part can leap an octave; nothing melodic falls two octaves inside a
 * few frames and then stops.
 */
const KICK_DROP_SEMITONES = 24;

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

  // Largest fall from the instrument's first sounded note to any later one.
  // `ple_Note` of 0 means "no change" in the replayer (hvl_replay.c:1540), so
  // those entries are skipped rather than read as a drop to zero.
  let firstNote: number | null = null;
  let lowest = 0;
  let pitchDropSemitones = 0;
  for (const e of entries) {
    const n = e?.note ?? 0;
    if (!n) continue;
    if (firstNote === null) { firstNote = n; lowest = n; continue; }
    if (n < lowest) lowest = n;
    pitchDropSemitones = Math.max(pitchDropSemitones, firstNote - lowest);
  }

  // The other way to fall: a downward period slide. FX 2 sets
  // `vc_PeriodPerfSlideSpeed = -FXParam`, and `vc_PeriodPerfSlidePeriod -=
  // speed` (hvl_replay.c:1247, 1558), so the period RISES and the pitch falls.
  // FX 1 is the same mechanism upwards. The double negative is why this was
  // worth reading rather than assuming.
  const slidesDown = entries.some(e => Array.isArray(e?.fx) && e.fx.includes(2));
  if (slidesDown) pitchDropSemitones = Math.max(pitchDropSemitones, KICK_DROP_SEMITONES);

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
    pitchDropSemitones,
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
    // The native synths express the same gesture as a pitch envelope, whose
    // `amount` is in semitones and negative when it falls.
    pitchDropSemitones: inst.pitchEnvelope?.enabled
      ? Math.max(0, -(inst.pitchEnvelope.amount ?? 0))
      : 0,
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
  // A hard pitch drop in a short sound is a drum, and specifically the one
  // that noise cannot identify: a chip kick is a pitched waveform swept
  // downwards, with little or no noise in it. Checked before the noise branch
  // because a kick often has both, and "kick" is the more useful answer.
  if (ev.pitchDropSemitones >= KICK_DROP_SEMITONES && ev.articulation === 'percussive') {
    return { role: 'percussion', subrole: 'kick', confidence: 0.85 };
  }

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
