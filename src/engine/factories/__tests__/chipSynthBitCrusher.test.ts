/**
 * ChipSynth's 8-bit character.
 *
 * ChipSynth ran through Tone.BitCrusher, an AudioWorklet node Tone cannot
 * build on DEViLBOX's native AudioContext: each ChipSynth logged an
 * "UnhandledRejection: InvalidStateError" and the crusher's wet path stayed
 * silent, so it was set to wet 0 — and the BITS knob moved nothing. The
 * synth now crushes through the WaveShaper crusher the effect chain uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const made = vi.hoisted(() => ({ worklets: 0, shapers: [] as Array<(v: number) => number> }));

vi.mock('tone', () => {
  class Node {
    volume = { value: 0 };
    connect = vi.fn(); disconnect = vi.fn(); dispose = vi.fn(); set = vi.fn();
    releaseAll = vi.fn(); triggerAttack = vi.fn(); triggerRelease = vi.fn(); triggerAttackRelease = vi.fn();
  }
  class Distortion extends Node {
    wet: { value: number };
    _shaper = { setMap: (fn: (v: number) => number) => { made.shapers.push(fn); } };
    constructor(o: { wet: number }) { super(); this.wet = { value: o.wet }; }
  }
  class BitCrusher extends Node { constructor() { super(); made.worklets++; } }
  return {
    ToneAudioNode: Node, Synth: Node, PolySynth: Node, NoiseSynth: Node,
    Distortion, BitCrusher,
  };
});

import { createChipSynth } from '../ToneJSSynthFactory';
import type { InstrumentConfig } from '@/types/instrument';

const chip = (bitDepth: number, channel = 'pulse1') => ({
  id: 1, name: 'Chip', type: 'synth', synthType: 'ChipSynth', volume: -6,
  chipSynth: {
    channel, bitDepth,
    envelope: { attack: 5, decay: 100, sustain: 50, release: 50 },
  },
}) as unknown as InstrumentConfig;

beforeEach(() => { made.worklets = 0; made.shapers.length = 0; });

describe('ChipSynth bit depth', () => {
  it('builds no AudioWorklet crusher, which cannot run on the native context', () => {
    createChipSynth(chip(8));
    createChipSynth(chip(8, 'noise'));
    expect(made.worklets).toBe(0);
  });

  it('crushes to the bit depth it is set to, and follows the BITS knob', () => {
    const synth = createChipSynth(chip(4)) as unknown as { applyConfig(c: Record<string, unknown>): void };
    const levels = (fn: (v: number) => number) =>
      new Set(Array.from({ length: 2001 }, (_, i) => fn(i / 1000 - 1))).size;
    expect(levels(made.shapers.at(-1)!)).toBe(17);   // 2^4 steps across -1..1, both ends included

    synth.applyConfig({ bitDepth: 2, envelope: { attack: 5, decay: 100, sustain: 50, release: 50 } });
    expect(levels(made.shapers.at(-1)!)).toBe(5);
  });
});
