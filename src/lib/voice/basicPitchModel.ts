/**
 * basicPitchModel.ts - the neural pitch model (Spotify Basic Pitch, TF.js) behind
 * one interface, plus the resampler both callers need.
 */
import { BasicPitch } from '@spotify/basic-pitch';
import { PITCH_SAMPLE_RATE, type PitchModelOutput } from './pitchNotes';

const MODEL_URL = '/basic-pitch/model.json';

/** Anything that turns 22050 Hz mono samples into model frames. */
export interface PitchModel {
  evaluate(samples: Float32Array, onProgress?: (fraction: number) => void): Promise<PitchModelOutput>;
}

let shared: BasicPitch | null = null;
function getBasicPitch(): BasicPitch {
  // Bundled in the repo, loaded on first use
  if (!shared) shared = new BasicPitch(MODEL_URL);
  return shared;
}

/** Run Basic Pitch over an AudioBuffer that is already 22050 Hz mono. The output carries the samples. */
export async function evaluateBuffer(
  buffer: AudioBuffer,
  onProgress?: (fraction: number) => void,
): Promise<PitchModelOutput> {
  const frames: number[][] = [];
  const onsets: number[][] = [];
  const contours: number[][] = [];
  await getBasicPitch().evaluateModel(
    buffer,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (pct) => onProgress?.(pct),
  );
  // The audio rides along so note extraction can check it (voicing.ts)
  return { frames, onsets, contours, audio: new Float32Array(buffer.getChannelData(0)) };
}

/** Resample an AudioBuffer to 22050 Hz mono. */
export async function resampleToMono22050(buffer: AudioBuffer): Promise<AudioBuffer> {
  const length = Math.ceil((buffer.length / buffer.sampleRate) * PITCH_SAMPLE_RATE);
  const ctx = new OfflineAudioContext(1, length, PITCH_SAMPLE_RATE);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  return ctx.startRendering();
}

export const basicPitchModel: PitchModel = {
  async evaluate(samples, onProgress) {
    const buffer = new AudioBuffer({ length: samples.length, sampleRate: PITCH_SAMPLE_RATE });
    buffer.copyToChannel(new Float32Array(samples), 0);
    return evaluateBuffer(buffer, onProgress);
  },
};
