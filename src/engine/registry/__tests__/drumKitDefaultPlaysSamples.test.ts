/**
 * Owner 2026-10-20: "drum kit plays silent". Nothing in the app ever handed
 * DrumKitSynth a sample loader, so preloadSamples() returned at once and every
 * note logged "No buffer loaded for sample"; preload also stored buffers under
 * mapping.id while notes looked them up by sampleId. A new Drum Kit also had an
 * empty keymap. The synth now fetches its own samples from each mapping's
 * sampleUrl, keyed the way notes look them up, and a new kit starts with the
 * Drumnibus Analog keymap (owner's choice).
 *
 * Drives the real InstrumentFactory with the config a new Drum Kit gets, against
 * a fake AudioContext and fetch, and checks a note starts a buffer source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../sdk/misc';
import { InstrumentFactory } from '../../InstrumentFactory';
import { getInitialConfig } from '@stores/instrument/presetOps';
import { setDevilboxAudioContext } from '@/utils/audio-context';
import type { InstrumentConfig } from '@/types/instrument';

const started: AudioBuffer[] = [];
const fetched: string[] = [];

function node() {
  return { gain: { value: 1 }, pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
}

function fakeContext() {
  return {
    currentTime: 0,
    createGain: () => node(),
    createStereoPanner: () => node(),
    createBufferSource: () => {
      const src = { ...node(), buffer: null as AudioBuffer | null, playbackRate: { value: 1 }, stop: vi.fn(), onended: null,
        start: vi.fn(() => { if (src.buffer) started.push(src.buffer); }) };
      return src;
    },
    decodeAudioData: vi.fn(async () => ({ duration: 0.5, sampleRate: 48000, length: 24000 }) as unknown as AudioBuffer),
  } as unknown as AudioContext;
}

describe('a new Drum Kit plays its samples', () => {
  beforeEach(() => {
    started.length = 0;
    fetched.length = 0;
    setDevilboxAudioContext(fakeContext());
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response;
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('C-2 (MIDI 36) on a default kit starts the kick sample', async () => {
    const config = { id: 1, name: 'Drum Kit', type: 'synth', volume: 0, pan: 0, effects: [], ...getInitialConfig('DrumKit') } as InstrumentConfig;
    expect(config.drumKit!.keymap.length).toBeGreaterThan(0);

    const synth = InstrumentFactory.createInstrument(config) as unknown as {
      ensureInitialized(): Promise<void>; triggerAttack(note: string, time?: number, velocity?: number): void;
    };
    await synth.ensureInitialized();

    expect(fetched.some((u) => u.endsWith('kicks/BD_808A1200.wav'))).toBe(true);
    synth.triggerAttack('C2', 0, 1);
    expect(started).toHaveLength(1);
  });
});
