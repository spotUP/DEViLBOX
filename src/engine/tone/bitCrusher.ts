/**
 * Bit-depth reduction on DEViLBOX's audio context.
 *
 * Tone.BitCrusher cannot run here. It is an AudioWorklet node, and Tone
 * builds worklet nodes through standardized-audio-context, which only
 * accepts contexts it created itself. DEViLBOX hands Tone a raw native
 * AudioContext (ToneEngine, Tone.setContext), so every Tone.BitCrusher
 * rejects with InvalidStateError when its worklet is created and its wet
 * path stays silent for good — the crushed signal never reaches the output.
 *
 * This crusher is a Tone.Distortion whose WaveShaper curve is a staircase
 * of 2^bits levels: the same quantisation, synchronous, on any context.
 */
import * as Tone from 'tone';

type Shaper = { setMap: (fn: (v: number) => number, len?: number) => void };
type CrusherTags = { _isBitCrusher?: boolean; _bitsValue?: number; _shaper?: Shaper };

export type BitCrusherNode = Tone.Distortion;

const tags = (node: unknown): CrusherTags => node as CrusherTags;

/** Rounds a signal in -1..1 to the nearest of 2^bits levels. */
export function quantiseToBits(value: number, bits: number): number {
  const step = Math.pow(0.5, bits - 1);
  return step * Math.floor(value / step + 0.5);
}

export function createBitCrusher(bits: number, wet = 1): BitCrusherNode {
  const crusher = new Tone.Distortion({ distortion: 0, wet, oversample: 'none' });
  tags(crusher)._isBitCrusher = true;
  setBitCrusherBits(crusher, bits);
  return crusher;
}

export function isBitCrusher(node: unknown): node is BitCrusherNode {
  return !!node && !!tags(node)._isBitCrusher;
}

export function setBitCrusherBits(crusher: BitCrusherNode, bits: number): void {
  const b = Math.max(1, Math.floor(Number(bits) || 4));
  tags(crusher)._bitsValue = b;
  tags(crusher)._shaper?.setMap((v: number) => quantiseToBits(v, b), 4096);
}
