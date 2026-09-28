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
  source: 'hively' | 'replayer' | 'envelope' | 'oscillator';
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

/**
 * The generic Tone-style envelope, in milliseconds, shared by most of the
 * native synths. Carries no waveform information on its own.
 *
 * Refuses to read a SAMPLE-based instrument, because for those the envelope is
 * not the music. Measured 2026-09-22 on `a sleep so deep.mod`: all eleven
 * instruments carry the identical `{ attack: 10, decay: 500, sustain: 0,
 * release: 100 }`, which is the app's default applied at import — the same
 * numbers for a bass, a snare, a bell and a piano. Reading it would manufacture
 * confident timbre evidence out of a constant, for the formats that need it
 * least: a sample instrument already has PCM, and `SampleSpectrum` measures
 * what it actually sounds like.
 */
function fromEnvelope(inst: InstrumentConfig): SynthTimbreEvidence | null {
  if (inst.type === 'sample' || inst.sample?.url) return null;
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

/**
 * The Amiga replayer families: FutureComposer, SoundMon, Sonic Arranger,
 * Hippel-CoSo and the rest.
 *
 * These are the formats the classifier was blindest to. Their instruments are
 * synthesised inside the replayer, so there is no PCM for the spectrum path and
 * no envelope in the Tone.js shape either; the only description of the sound is
 * the replayer's own parameter block. Without this, every channel of an FC or
 * Sonic Arranger tune fell through to note statistics and the name — and the
 * names are greetings. See [[reference-sample-names-are-messages]].
 *
 * They differ in field names and in what they can express, but they share a
 * shape: a volume envelope counted in VIDEO FRAMES, and a vibrato delay/speed/
 * depth triple. That much is enough for articulation and vibrato, which is what
 * `classifyBySynthParams` actually reads. Where a format says nothing about a
 * field, it stays at the neutral value rather than being guessed at.
 *
 * Brightness is left mid-scale on purpose. These formats index a waveform BANK
 * whose contents are song data, so a waveform number says nothing about
 * timbre the way Hively's fixed 0-3 does — claiming otherwise would be
 * inventing evidence.
 */
function fromAmigaReplayer(inst: InstrumentConfig): SynthTimbreEvidence | null {
  /** frames -> ms, the unit every one of these replayers counts in. */
  const ms = (frames: number | undefined): number =>
    Math.max(0, Math.round(((frames ?? 0) / FRAMES_PER_SEC) * 1000));

  let attackMs = 0;
  let decayMs = 0;
  let releaseMs = 0;
  let sustains = false;
  let vibrato = false;
  /** A waveform SEQUENCE that keeps moving is a timbre that sweeps. */
  let sweeping = false;

  const fc = inst.fc;
  const sm = inst.soundMon;
  const sa = inst.sonicArranger;
  const hc = inst.hippelCoso;

  if (fc) {
    attackMs = ms(fc.atkLength);
    decayMs = ms(fc.decLength);
    releaseMs = ms(fc.relLength);
    sustains = (fc.sustVolume ?? 0) > 16; // of 64
    vibrato = (fc.vibDepth ?? 0) > 0 && (fc.vibSpeed ?? 0) > 0;
    // A synth macro that visits more than one waveform is a moving timbre.
    sweeping = new Set((fc.synthTable ?? []).map(e => e.waveNum)).size > 1;
  } else if (sm && sm.type === 'synth') {
    // SoundMon counts SPEED, not length: a bigger number is a faster ramp.
    // Inverting it keeps the units honest — speed 0 means "no ramp", which is
    // an instant edge, not an infinitely long one.
    const fromSpeed = (speed: number | undefined): number =>
      !speed ? 0 : ms(64 / speed);
    attackMs = fromSpeed(sm.attackSpeed);
    decayMs = fromSpeed(sm.decaySpeed);
    releaseMs = fromSpeed(sm.releaseSpeed);
    sustains = (sm.sustainVolume ?? 0) > 16 && (sm.sustainLength ?? 0) > 0;
    vibrato = (sm.vibratoDepth ?? 0) > 0 && (sm.vibratoSpeed ?? 0) > 0;
    sweeping = (sm.waveSpeed ?? 0) > 0;
  } else if (sa) {
    // Sonic Arranger keeps its envelope in a separate ADSR table that the
    // instrument only POINTS at, so the shape is not readable from here. The
    // lengths that are readable describe the amplitude modulation table.
    attackMs = ms(sa.adsrDelay);
    decayMs = ms(sa.adsrLength);
    releaseMs = 0;
    sustains = (sa.sustainDelay ?? 0) > 0 || (sa.sustainPoint ?? 0) > 0;
    vibrato = (sa.vibratoLevel ?? 0) > 0 && (sa.vibratoSpeed ?? 0) > 0;
    sweeping = (sa.amfLength ?? 0) > 0; // an amplitude/filter table that runs
  } else if (hc) {
    // Hippel-CoSo has no ADSR at all: volume is a sequence stepped at
    // `volSpeed`, so its LENGTH is the sound's length.
    const steps = hc.vseq?.length ?? 0;
    const speed = Math.max(1, hc.volSpeed ?? 1);
    decayMs = ms(steps * speed);
    sustains = steps === 0;
    vibrato = (hc.vibDepth ?? 0) > 0 && (hc.vibSpeed ?? 0) > 0;
    sweeping = new Set(hc.fseq ?? []).size > 1;
  } else {
    return null;
  }

  return {
    source: 'replayer',
    articulation: articulationFrom(attackMs, decayMs, releaseMs, sustains),
    // Unknown, and said so rather than guessed: these formats index a waveform
    // bank that is song data, not a fixed table.
    brightness: 0.5,
    noisiness: 0,
    attackMs,
    decayMs,
    releaseMs,
    sweeping,
    vibrato,
    // None of these blocks describes a pitch drop as a parameter — where they
    // do it, it is through the arpeggio/frequency sequence, which is note data
    // rather than timbre.
    pitchDropSemitones: 0,
  };
}

/** Timbre evidence from whichever parameter block this instrument carries. */
export function extractSynthTimbre(
  inst: InstrumentConfig | null | undefined,
): SynthTimbreEvidence | null {
  if (!inst) return null;
  return fromHively(inst) ?? fromAmigaReplayer(inst) ?? fromEnvelope(inst);
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

// ─── Native synths: what the synth states about itself ──────────────────────

/** The TB-303 and its clones: an acid bass by construction. */
const ACID_BASS_SYNTHS: ReadonlySet<string> = new Set(['TB303', 'Buzz3o3', 'Buzz3o3DF']);

/**
 * A role for DEViLBOX's own synths, from what they ARE rather than from how
 * they sound (plan section 13, "native synth metadata should beat CED": the
 * synth already knows what it is, and an audio guess must not overrule it).
 *
 * Only identities that settle a role are answered; everything else - a
 * generic PolySynth, an FM patch - returns null so the sample, parameter,
 * name and note evidence below decide. Confidences sit under the 0.8 at which
 * `classifyChannelWithInstruments` lets an instrument overrule the notes,
 * except where the identity leaves no doubt: a 303 played high is an acid
 * lead, so the register still gets a say, but a noise channel is a drum.
 */
export function classifyByNativeSynth(inst: InstrumentConfig): {
  role: ChannelRole; subrole?: ChannelSubrole; confidence: number;
} | null {
  if (ACID_BASS_SYNTHS.has(inst.synthType)) return { role: 'bass', subrole: 'synth', confidence: 0.75 };
  if (inst.synthType === 'ChipSynth') {
    // The NES channel model: the noise channel is the drum kit, the triangle
    // carries the bass line by convention, the pulses say nothing on their own.
    const channel = inst.chipSynth?.channel;
    if (channel === 'noise') return { role: 'percussion', subrole: 'perc', confidence: 0.85 };
    if (channel === 'triangle') return { role: 'bass', subrole: 'synth', confidence: 0.5 };
    return null;
  }
  // A SID voice whose only waveform is noise is the drum voice: C64 hats,
  // snares and noise kicks are all written that way. Any tonal waveform
  // switched on beside it says nothing on its own.
  const sid = inst.furnace?.c64;
  if (sid && sid.noiseOn && !sid.triOn && !sid.sawOn && !sid.pulseOn) {
    return { role: 'percussion', subrole: 'perc', confidence: 0.85 };
  }
  if (inst.synthType === 'StringMachine') return { role: 'pad', confidence: 0.7 };
  if (inst.synthType === 'Organ') return { role: 'chord', confidence: 0.55 };
  return null;
}

// ─── Native synths: the pitch they sound at ────────────────────────────────

/**
 * Bytes each Hippel CoSo sound-sequence command occupies, the command byte
 * included, as libtfmxaudiodecoder's COSO player reads them
 * (Jochen/Instrument.cpp; COSO.cpp installs the E1 wave-mod and E7
 * set-different-wave variants). E0 (loop) and E1 end the sequence's first
 * pass.
 */
const COSO_SEQ_COMMAND_BYTES: Readonly<Record<number, number>> = {
  0xE2: 2, 0xE3: 3, 0xE4: 2, 0xE5: 9, 0xE6: 6, 0xE7: 2, 0xE8: 2, 0xE9: 3, 0xEA: 2,
};

/**
 * Semitones a Hippel CoSo frequency sequence adds to the written note, as
 * the median of its first pass: a byte below 0x80 is a transpose added to the
 * note; one from 0x80 to 0xDF plays a fixed pitch whatever the note (skipped
 * here - it is no offset); E0 and up are commands. Null when the sequence
 * holds no transpose.
 */
export function cosoSequenceTranspose(fseq: readonly number[]): number | null {
  const transposes: number[] = [];
  for (let i = 0; i < fseq.length;) {
    const b = fseq[i] & 0xFF;
    if (b >= 0xE0) {
      const len = COSO_SEQ_COMMAND_BYTES[b];
      if (!len) break;               // E0, E1, or a command this player lacks
      i += len;
    } else {
      if (b < 0x80) transposes.push(b);
      i++;
    }
  }
  if (transposes.length === 0) return null;
  transposes.sort((a, b) => a - b);
  return transposes[transposes.length >> 1];
}

/**
 * How many semitones above its written note an instrument sounds.
 *
 * A tracker note is what the pattern says, not always what is heard: a Hippel
 * CoSo instrument's frequency sequence transposes every note it plays, often
 * by one or two octaves, so a song can write all four voices in one low
 * register while only one of them is the bass (prehistoric_tale.hipc: three
 * voices written at B-2..E-3 all classified as bass). Pitch evidence reads
 * notes through this. 0 for an instrument that states nothing.
 */
export function soundingSemitones(inst: InstrumentConfig | undefined): number {
  const fseq = (inst as { hippelCoso?: { fseq?: number[] } } | undefined)?.hippelCoso?.fseq;
  if (fseq) return cosoSequenceTranspose(fseq) ?? 0;
  return 0;
}

/**
 * The notes a channel sounds, in order: each written note plus the playing
 * instrument's offset. A cell without an instrument keeps the last one, as a
 * tracker does.
 */
export function soundingNotes(
  rows: ReadonlyArray<{ note: number; instrument: number } | null | undefined>,
  instruments?: ReadonlyMap<number, InstrumentConfig>,
): number[] {
  const notes: number[] = [];
  let offset = 0;
  for (const cell of rows) {
    if (!cell) continue;
    if (cell.instrument > 0 && instruments) offset = soundingSemitones(instruments.get(cell.instrument));
    if (cell.note >= 1 && cell.note <= 96) notes.push(Math.min(96, cell.note + offset));
  }
  return notes;
}
