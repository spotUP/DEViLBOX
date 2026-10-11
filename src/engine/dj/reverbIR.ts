/**
 * Synthetic room impulse response: exponentially decaying white noise. One
 * generator for the deck scratch reverb (`DeckEngine`) and the scratch bus
 * (`scratch/scratchBus.ts`, owner scratch plan section 42).
 *
 * The noise is seeded (xorshift32) so two renders of the same chain sound the
 * same: a test can measure the bus and an export can be reproduced.
 *
 * @param durationSec  IR length.
 * @param decayHz      Decay rate: the envelope is exp(-t x decayHz), so the
 *                     time constant is 1 / decayHz seconds.
 */
export function createReverbIR(ctx: BaseAudioContext, durationSec: number, decayHz: number, seed = 0x9e3779b9): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = next() * Math.exp(-i / (ctx.sampleRate / decayHz));
    }
  }
  return ir;
}
