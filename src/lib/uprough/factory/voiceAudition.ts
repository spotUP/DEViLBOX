/**
 * Voice audition (R2f-15): the local drum bank of the song being generated, kept so each finished voice can be played.
 * The wire carries no audio, so on a host Generate the bank is rebuilt locally at the same style and seed (same bytes as
 * the host by the parity suite).
 */
import type { DrumBank } from '@/engine/uprough/drumBank';

/** The bank of the current Generate and the rate it was built at; empty until act 1 runs. */
const factoryAudio = new Map<string, Float64Array>();
let factoryRate = 0;

export function keepBank(bank: DrumBank, rate: number): void {
  factoryAudio.clear();
  for (const [voice, samples] of Object.entries(bank)) factoryAudio.set(voice, samples);
  factoryRate = rate;
}

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
