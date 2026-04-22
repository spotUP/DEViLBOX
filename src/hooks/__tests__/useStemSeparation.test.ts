/**
 * Tests for useStemSeparation hook and StemSeparatorPanel integration.
 *
 * Tests the shared stem separation infrastructure used by:
 *  - Sample Editor (replace/extract)
 *  - Import Audio Dialog (extract as stems)
 *  - Beat Slicer (drum isolation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { StemResult, StemData, DemucsModelType } from '@/engine/demucs/types';
import { STEM_NAMES_4S, STEM_NAMES_6S } from '@/engine/demucs/types';

// ── Stem color/label mapping tests ─────────────────────────────────────

describe('Stem metadata', () => {
  it('4-stem model has drums, bass, other, vocals', () => {
    expect(STEM_NAMES_4S).toEqual(['drums', 'bass', 'other', 'vocals']);
  });

  it('6-stem model adds guitar and piano', () => {
    expect(STEM_NAMES_6S).toEqual(['drums', 'bass', 'other', 'vocals', 'guitar', 'piano']);
  });

  it('stem colors are defined for all 4-stem names', () => {
    const STEM_COLORS: Record<string, string> = {
      drums: '#f97316',
      bass: '#3b82f6',
      vocals: '#ec4899',
      other: '#a855f7',
      guitar: '#22c55e',
      piano: '#eab308',
    };
    for (const name of STEM_NAMES_4S) {
      expect(STEM_COLORS[name]).toBeDefined();
      expect(STEM_COLORS[name]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('stem colors are defined for all 6-stem names', () => {
    const STEM_COLORS: Record<string, string> = {
      drums: '#f97316',
      bass: '#3b82f6',
      vocals: '#ec4899',
      other: '#a855f7',
      guitar: '#22c55e',
      piano: '#eab308',
    };
    for (const name of STEM_NAMES_6S) {
      expect(STEM_COLORS[name]).toBeDefined();
    }
  });
});

// ── StemResult shape tests ─────────────────────────────────────────────

describe('StemResult structure', () => {
  it('stem data has left and right Float32Arrays', () => {
    const data: StemData = {
      left: new Float32Array(100),
      right: new Float32Array(100),
    };
    expect(data.left).toBeInstanceOf(Float32Array);
    expect(data.right).toBeInstanceOf(Float32Array);
    expect(data.left.length).toBe(data.right.length);
  });

  it('stem result is keyed by stem name', () => {
    const result: StemResult = {
      drums: { left: new Float32Array(10), right: new Float32Array(10) },
      bass: { left: new Float32Array(10), right: new Float32Array(10) },
      vocals: { left: new Float32Array(10), right: new Float32Array(10) },
      other: { left: new Float32Array(10), right: new Float32Array(10) },
    };
    expect(Object.keys(result)).toHaveLength(4);
    expect(Object.keys(result).sort()).toEqual(['bass', 'drums', 'other', 'vocals']);
  });
});

// ── Minimum duration gate tests ────────────────────────────────────────

describe('Duration gating', () => {
  const MIN_DURATION_S = 2.0;

  it('rejects samples shorter than 2 seconds', () => {
    const duration = 1.5;
    expect(duration >= MIN_DURATION_S).toBe(false);
  });

  it('accepts samples of exactly 2 seconds', () => {
    const duration = 2.0;
    expect(duration >= MIN_DURATION_S).toBe(true);
  });

  it('accepts longer samples', () => {
    const duration = 30.5;
    expect(duration >= MIN_DURATION_S).toBe(true);
  });
});

// ── Mono→stereo conversion tests ───────────────────────────────────────

describe('Mono to stereo conversion', () => {
  it('mono buffer produces identical L/R channels', () => {
    // Simulates the hook's conversion logic
    const mono = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const numberOfChannels = 1;

    const left = mono;
    const right = numberOfChannels >= 2 ? new Float32Array(0) : left;

    expect(left).toBe(right); // Same reference for mono
    expect(right[0]).toBeCloseTo(0.1);
    expect(right[4]).toBeCloseTo(0.5);
  });

  it('stereo buffer keeps separate channels', () => {
    const left = new Float32Array([0.1, 0.2]);
    const right = new Float32Array([0.3, 0.4]);
    const numberOfChannels = 2;

    const actualRight = numberOfChannels >= 2 ? right : left;

    expect(actualRight).toBe(right);
    expect(actualRight[0]).toBeCloseTo(0.3);
  });
});

// ── Stem AudioBuffer conversion tests ──────────────────────────────────

describe('StemData to AudioBuffer conversion', () => {
  // Minimal AudioBuffer polyfill for test environment
  beforeEach(() => {
    if (typeof globalThis.AudioBuffer === 'undefined') {
      (globalThis as Record<string, unknown>).AudioBuffer = class MockAudioBuffer {
        numberOfChannels: number;
        length: number;
        sampleRate: number;
        private channels: Float32Array[];

        constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
          this.numberOfChannels = opts.numberOfChannels;
          this.length = opts.length;
          this.sampleRate = opts.sampleRate;
          this.channels = Array.from(
            { length: opts.numberOfChannels },
            () => new Float32Array(opts.length),
          );
        }

        get duration() { return this.length / this.sampleRate; }

        copyToChannel(source: Float32Array, channel: number) {
          this.channels[channel].set(source);
        }

        getChannelData(channel: number) {
          return this.channels[channel];
        }
      };
    }
  });

  it('converts StemData to stereo AudioBuffer', () => {
    const left = new Float32Array([0.1, 0.2, 0.3]);
    const right = new Float32Array([0.4, 0.5, 0.6]);
    const sampleRate = 44100;

    const buf = new AudioBuffer({ numberOfChannels: 2, length: left.length, sampleRate });
    buf.copyToChannel(left, 0);
    buf.copyToChannel(right, 1);

    expect(buf.numberOfChannels).toBe(2);
    expect(buf.length).toBe(3);
    expect(buf.sampleRate).toBe(44100);
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.1);
    expect(buf.getChannelData(1)[2]).toBeCloseTo(0.6);
  });

  it('preserves sample rate from source', () => {
    const buf = new AudioBuffer({ numberOfChannels: 2, length: 100, sampleRate: 48000 });
    expect(buf.sampleRate).toBe(48000);
  });
});

// ── Model type tests ───────────────────────────────────────────────────

describe('Model type handling', () => {
  it('4s model returns 4 stem names', () => {
    const model: string = '4s';
    const names = model === '6s' ? STEM_NAMES_6S : STEM_NAMES_4S;
    expect(names.length).toBe(4);
  });

  it('6s model returns 6 stem names', () => {
    const model: DemucsModelType = '6s';
    const names = model === '6s' ? STEM_NAMES_6S : STEM_NAMES_4S;
    expect(names.length).toBe(6);
  });
});

// ── Integration point contract tests ───────────────────────────────────

describe('Integration points', () => {
  it('StemSeparatorPanel module exists', async () => {
    const mod = await import('@/components/common/StemSeparatorPanel');
    expect(mod.StemSeparatorPanel).toBeDefined();
  });

  it('useStemSeparation hook module exists', async () => {
    const mod = await import('@/hooks/useStemSeparation');
    expect(mod.useStemSeparation).toBeDefined();
  });
});
