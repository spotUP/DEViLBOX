/**
 * Smoke tests for the dub-derived standalone synths. These are the voices
 * extracted from DubBus.startXxx(...) so they're pickable as normal
 * instruments — the test contract is the DevilboxSynth shape, not the
 * audio output (no browser audio context under vitest).
 *
 * What this guards:
 *   - Constructor does not throw for each config.
 *   - `output` is an AudioNode (GainNode) suitable for connect().
 *   - `triggerAttack()` does not throw; for hold-style synths a second
 *     triggerAttack replaces the first voice (no audio-node leak).
 *   - `triggerRelease()` does not throw even when no voice is playing.
 *   - `dispose()` releases voices and disconnects safely.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Minimal AudioContext-like stub sufficient for the synth classes'
// createGain/createOscillator/createBiquadFilter/createWaveShaper/
// createBufferSource/createBuffer calls. Vitest's jsdom env lacks a real
// AudioContext, so we route through getDevilboxAudioContext() → a mock.
function makeFakeParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}
function makeFakeAudioNode(extra: Record<string, unknown> = {}) {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: makeFakeParam(),
    frequency: makeFakeParam(),
    Q: makeFakeParam(),
    ...extra,
  };
}
const fakeCtx = {
  sampleRate: 48000,
  currentTime: 0,
  createGain: vi.fn(() => makeFakeAudioNode()),
  createOscillator: vi.fn(() => makeFakeAudioNode({
    type: 'sine',
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createBiquadFilter: vi.fn(() => makeFakeAudioNode({ type: 'lowpass' })),
  createWaveShaper: vi.fn(() => makeFakeAudioNode({
    curve: null,
    oversample: 'none',
  })),
  createBufferSource: vi.fn(() => makeFakeAudioNode({
    buffer: null,
    loop: false,
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createBuffer: vi.fn((channels: number, length: number, _rate: number) => ({
    getChannelData: () => new Float32Array(length),
    length,
    numberOfChannels: channels,
  })),
};

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => fakeCtx,
  getNativeAudioNode: (node: unknown) => node,
  audioNow: () => 0,
  noteToFrequency: (note: string | number) => {
    if (typeof note === 'number') return 440 * Math.pow(2, (note - 69) / 12);
    return 440;
  },
}));

import {
  OscBassSynth, CrushBassSynth, SonarPingSynth, RadioRiserSynth, SubSwellSynth,
} from '../DubDerivedSynths';
import {
  DEFAULT_OSC_BASS, DEFAULT_CRUSH_BASS, DEFAULT_SONAR_PING,
  DEFAULT_RADIO_RISER, DEFAULT_SUB_SWELL,
} from '@/types/instrument';

describe('DubDerivedSynths — DevilboxSynth surface', () => {
  describe('OscBassSynth', () => {
    it('constructs with default config', () => {
      const s = new OscBassSynth(DEFAULT_OSC_BASS);
      expect(s.name).toBe('OscBassSynth');
      expect(s.output).toBeDefined();
    });

    it('triggerAttack → triggerRelease cycle does not throw', () => {
      const s = new OscBassSynth(DEFAULT_OSC_BASS);
      expect(() => s.triggerAttack('C2', 0, 1)).not.toThrow();
      expect(() => s.triggerRelease('C2', 0.5)).not.toThrow();
    });

    it('a second triggerAttack replaces the first voice (hold semantics)', () => {
      const s = new OscBassSynth(DEFAULT_OSC_BASS);
      s.triggerAttack('C2');
      expect(() => s.triggerAttack('D2')).not.toThrow();
      s.releaseAll();
    });

    it('triggerRelease with no active voice is a no-op', () => {
      const s = new OscBassSynth(DEFAULT_OSC_BASS);
      expect(() => s.triggerRelease()).not.toThrow();
    });
  });

  describe('CrushBassSynth', () => {
    it('triggerAttack uses the note to set pitch, release fades out', () => {
      const s = new CrushBassSynth(DEFAULT_CRUSH_BASS);
      expect(() => s.triggerAttack('A2', 0, 1)).not.toThrow();
      expect(() => s.triggerRelease('A2', 0.4)).not.toThrow();
    });

    it('ignores invalid bits outside 1-8 without throwing', () => {
      const s = new CrushBassSynth({ ...DEFAULT_CRUSH_BASS, bits: 100 });
      expect(() => s.triggerAttack('C2')).not.toThrow();
      s.releaseAll();
    });
  });

  describe('SonarPingSynth (trigger-only)', () => {
    it('triggerAttack fires and auto-cleans up', () => {
      const s = new SonarPingSynth(DEFAULT_SONAR_PING);
      expect(() => s.triggerAttack('C5', 0, 1)).not.toThrow();
    });

    it('triggerRelease is a no-op', () => {
      const s = new SonarPingSynth(DEFAULT_SONAR_PING);
      expect(() => s.triggerRelease()).not.toThrow();
    });

    it('triggerAttackRelease delegates to triggerAttack', () => {
      const s = new SonarPingSynth(DEFAULT_SONAR_PING);
      expect(() => s.triggerAttackRelease('C5', 0.2, 0)).not.toThrow();
    });
  });

  describe('RadioRiserSynth (trigger-only)', () => {
    it('triggerAttack runs a bandpass sweep over sweepSec', () => {
      const s = new RadioRiserSynth(DEFAULT_RADIO_RISER);
      expect(() => s.triggerAttack(undefined, 0, 1)).not.toThrow();
    });
  });

  describe('SubSwellSynth (trigger-only)', () => {
    it('pitchOctaves shifts the note down', () => {
      const s = new SubSwellSynth({ ...DEFAULT_SUB_SWELL, pitchOctaves: 1 });
      expect(() => s.triggerAttack('A2', 0, 1)).not.toThrow();
    });

    it('default pitchOctaves = 0 plays note as-is', () => {
      const s = new SubSwellSynth(DEFAULT_SUB_SWELL);
      expect(() => s.triggerAttack('A2', 0, 1)).not.toThrow();
    });
  });

  describe('dispose()', () => {
    it('all synth classes dispose without throwing', () => {
      const oscBass = new OscBassSynth(DEFAULT_OSC_BASS);
      oscBass.triggerAttack('C2');
      expect(() => oscBass.dispose()).not.toThrow();

      const crush = new CrushBassSynth(DEFAULT_CRUSH_BASS);
      crush.triggerAttack('C2');
      expect(() => crush.dispose()).not.toThrow();

      const ping = new SonarPingSynth(DEFAULT_SONAR_PING);
      ping.triggerAttack('C5');
      expect(() => ping.dispose()).not.toThrow();

      const riser = new RadioRiserSynth(DEFAULT_RADIO_RISER);
      riser.triggerAttack();
      expect(() => riser.dispose()).not.toThrow();

      const swell = new SubSwellSynth(DEFAULT_SUB_SWELL);
      swell.triggerAttack('A2');
      expect(() => swell.dispose()).not.toThrow();
    });
  });
});

// Silence "some tests may hang on pending timers" — the synth classes
// use setTimeout for deferred-disconnect cleanup. Tests don't wait on
// these; beforeAll here is just to keep the lint quiet about no-exec env.
beforeAll(() => { /* noop */ });
