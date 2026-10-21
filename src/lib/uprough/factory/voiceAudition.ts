/**
 * Voice audition (R2f-15): the local drum bank of the song being generated, kept so each finished voice can be played.
 * The wire carries no audio, so on a host Generate the bank is rebuilt locally at the same style and seed (same bytes as
 * the host by the parity suite).
 */
import { STYLE_DRUMS, type DrumBank } from '@/engine/uprough/drumBank';
import { getDevilboxAudioContext } from '@/utils/audio-context';

/** The bank of the current Generate and the rate it was built at; empty until act 1 runs. */
const factoryAudio = new Map<string, Float64Array>();
let factoryRate = 0;

/** Voices play at full level; the factory cues (factorySfx CUE_GAIN) sit about 10 dB under them. */
export const VOICE_GAIN = 1;

/** Hat pool variant name on the wire (`hatpool` event) and in the map: hat_0 .. hat_7. */
export const hatVariantName = (k: number): string => `hat_${k}`;

export function keepBank(bank: DrumBank, rate: number, hatPool: readonly Float64Array[] = []): void {
  factoryAudio.clear();
  for (const [voice, samples] of Object.entries(bank)) factoryAudio.set(voice, samples);
  hatPool.forEach((variant, k) => factoryAudio.set(hatVariantName(k), variant));
  factoryRate = rate;
}

/** Forgets the kept bank (a style with no local bank has nothing to play). */
export function clearBank(): void {
  factoryAudio.clear();
  factoryRate = 0;
}

/** True when the local TS bank can be built for this style (the only source of audition audio). */
export const hasLocalPreview = (style: string): boolean => style in STYLE_DRUMS;

/** The kept one-shot for a voice, with its rate, or undefined when the bank has no such voice. */
export function bankVoice(voice: string): { samples: Float64Array; rate: number } | undefined {
  const samples = factoryAudio.get(voice);
  return samples ? { samples, rate: factoryRate } : undefined;
}

/** A mono AudioBuffer holding `samples` at `rate`. */
export function oneShotBuffer(ctx: BaseAudioContext, samples: ArrayLike<number>, rate: number): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, rate);
  buf.copyToChannel(Float32Array.from(samples), 0);
  return buf;
}

/** Plays a kept one-shot (a bank voice, snare accent or ghost, or hat_N) at voice level. False when there is none. */
export function playVoice(voice: string): boolean {
  const kept = bankVoice(voice);
  if (!kept) return false;
  try {
    const ctx = getDevilboxAudioContext();
    const buf = oneShotBuffer(ctx, kept.samples, kept.rate);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = VOICE_GAIN;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}
