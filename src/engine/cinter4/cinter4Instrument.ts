/**
 * cinter4Instrument.ts — bridge between the Cinter synth and DEViLBOX instruments
 *
 * A Cinter instrument is a SAMPLE instrument whose PCM is synth-generated rather
 * than loaded. This module renders the waveform from the 12 params (via the synth
 * core) and packages it as a SampleConfig so it plays through the normal Amiga
 * sample path — while keeping the params on the instrument so the editor can
 * re-render it live and the exporter can write the param-encoded sample name.
 *
 * Lengths follow the MOD convention: `lengthWords`/`replenWords` are in 16-bit
 * words; the synth works in 8-bit samples (= 2 × words).
 */

import { createWavFile, arrayBufferToBase64 } from '../../lib/import/InstrumentConverter';
import type { SampleConfig, InstrumentConfig } from '../../types/instrument/defaults';
import {
  cinter4ParamsToSampleName,
  type Cinter4Version,
} from '../../lib/import/formats/cinter4Params';
import { renderCinter4Sample } from './cinter4SynthCore';

/** Amiga C-2 playback rate — the natural rate Cinter/ProTracker samples assume. */
export const CINTER4_SAMPLE_RATE = 8363;

export interface Cinter4InstrumentParams {
  /** 12 user params (idx 0-7 ∈ [0,100], 8-11 ∈ [0,10]). */
  params: number[];
  /** sample length in 16-bit words (MOD convention). */
  lengthWords: number;
  /** loop length in words (0 = one-shot). */
  replenWords: number;
  version: Cinter4Version;
}

/** Render the Cinter voice and wrap it as a playable SampleConfig. */
export function buildCinter4SampleConfig(p: Cinter4InstrumentParams, baseNote = 'C4'): SampleConfig {
  const lengthSamples = Math.max(2, p.lengthWords * 2);
  const repeatStart = p.replenWords > 0 ? (p.lengthWords - p.replenWords) * 2 : null;

  const pcm = renderCinter4Sample(p.params, lengthSamples, repeatStart, p.version);

  // 8-bit signed → 16-bit for the WAV container (same scaling as MOD sample import)
  const samples16 = new Int16Array(lengthSamples);
  for (let i = 0; i < lengthSamples; i++) samples16[i] = pcm[i] * 256;

  const loop = repeatStart != null;
  const loopInfo = loop ? { start: repeatStart, end: lengthSamples } : undefined;
  const wav = createWavFile(samples16, CINTER4_SAMPLE_RATE, loopInfo);
  const url = `data:audio/wav;base64,${arrayBufferToBase64(wav)}`;

  return {
    audioBuffer: wav,
    url,
    baseNote,
    detune: 0,
    loop,
    loopType: loop ? 'forward' : 'off',
    loopStart: repeatStart ?? 0,
    loopEnd: lengthSamples,
    sampleRate: CINTER4_SAMPLE_RATE,
    reverse: false,
    playbackRate: 1.0,
  };
}

/**
 * Build a full Cinter instrument config: a sample-playable voice that also carries
 * its synth params (and the param-encoded sample name) for editing and export.
 */
export function buildCinter4Instrument(
  id: number,
  name: string,
  p: Cinter4InstrumentParams,
): InstrumentConfig {
  const sample = buildCinter4SampleConfig(p);
  return {
    id,
    name,
    // A first-class synth voice (Cinter4Synth renders PCM from the params live).
    // The baked `sample` below is retained as an export fallback — MOD/XM export
    // and any sample-path consumer still read it — but audition/preset playback
    // goes through the Cinter4Synth registry voice.
    type: 'synth',
    synthType: 'Cinter4Synth',
    effects: [],
    volume: 0,
    pan: 0,
    sample,
    // Cinter voices are Amiga samples — the retained sample plays period-based so
    // notes track the ProTracker period table (the Player path), like the .mod.
    metadata: {
      modPlayback: { usePeriodPlayback: true, periodMultiplier: 3546895, finetune: 0 },
    },
    parameters: {
      cinter: 1,
      version: p.version,
      lengthWords: p.lengthWords,
      replenWords: p.replenWords,
      // the 12 editable params
      p0: p.params[0], p1: p.params[1], p2: p.params[2], p3: p.params[3],
      p4: p.params[4], p5: p.params[5], p6: p.params[6], p7: p.params[7],
      p8: p.params[8], p9: p.params[9], p10: p.params[10], p11: p.params[11],
      // the encoded ProTracker sample name (v4 form) the Amiga reads
      sampleName: cinter4ParamsToSampleName(p.params),
    } as unknown as Record<string, unknown>,
  } as InstrumentConfig;
}

// Cinter detection lives in the lightweight cinter4Recognize module (no audio
// deps) so it can run from the instrument store; re-exported here for callers
// that already import from this module.
export { recognizeCinter4Instruments } from './cinter4Recognize';

/** Extract the 12 params + geometry back out of a Cinter instrument config. */
export function readCinter4InstrumentParams(config: InstrumentConfig): Cinter4InstrumentParams | null {
  const pr = config.parameters as Record<string, unknown> | undefined;
  if (!pr || pr.cinter !== 1) return null;
  const params: number[] = [];
  for (let i = 0; i < 12; i++) params.push(Number(pr[`p${i}`] ?? 0));
  return {
    params,
    lengthWords: Number(pr.lengthWords ?? 0),
    replenWords: Number(pr.replenWords ?? 0),
    version: (Number(pr.version) === 3 ? 3 : 4) as Cinter4Version,
  };
}
