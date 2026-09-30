/**
 * An instrument created while its tune is loaded plays the instrument, not the tune.
 *
 * Owner, 2026-09-30: "regression in ahx? when i play an insrument the whole
 * song plays". InstrumentFactory skipped setInstrument while a tune was loaded
 * (setting up a player per instrument interfered with the tune), so the synth
 * had no config and a note fell through to triggerAttack's song-mode branch:
 * engine.play(), the whole song. The config is now kept pending, and the first
 * note sets up the instrument's own player.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Msg = Record<string, unknown>;

const sent: Msg[] = [];
let resolveHandle: ((h: number) => void) | null = null;

const engine = {
  output: { connect: vi.fn() },
  instrumentOutput: { connect: vi.fn(), disconnect: vi.fn() },
  ready: vi.fn(async () => {}),
  sendMessage: vi.fn((msg: Msg) => { sent.push(msg); }),
  waitForPlayerHandle: vi.fn(() => new Promise<number>((resolve) => { resolveHandle = resolve; })),
  play: vi.fn(),
  stop: vi.fn(),
};

vi.mock('../HivelyEngine', () => ({
  HivelyEngine: { getInstance: () => engine },
}));

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
  }),
  noteToMidi: (n: string) => (n === 'C4' ? 60 : 36),
}));

import { HivelySynth } from '../HivelySynth';
import type { HivelyConfig } from '@/types/instrument';

const config = {
  volume: 64, filterSpeed: 0, waveLength: 0,
  envelope: { aFrames: 1, aVolume: 64, dFrames: 1, dVolume: 64, sFrames: 1, rFrames: 1, rVolume: 0 },
  filterLowerLimit: 0, vibratoDelay: 0, hardCutRelease: false, hardCutReleaseFrames: 0,
  vibratoDepth: 0, vibratoSpeed: 0, squareLowerLimit: 0, squareUpperLimit: 0, squareSpeed: 0,
  filterUpperLimit: 0,
  performanceList: { speed: 0, entries: [] },
} as unknown as HivelyConfig;

const noteOns = () => sent.filter((m) => m.type === 'noteOn');

async function settle(): Promise<void> {
  // The queued attack runs on `_setupPromise.then`; a few microtask turns.
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  sent.length = 0;
  resolveHandle = null;
  engine.play.mockClear();
});

describe('HivelySynth with a pending instrument', () => {
  it('a note sets up the instrument player and never starts the song', async () => {
    const synth = new HivelySynth();
    synth.setPendingInstrument(config);
    synth.triggerAttack('C4', undefined, 1);
    await settle();
    expect(engine.play, 'a note must not play the whole song').not.toHaveBeenCalled();
    expect(sent.some((m) => m.type === 'createPlayer')).toBe(true);
    resolveHandle!(0);
    await settle();
    expect(noteOns()).toHaveLength(1);
    expect(noteOns()[0]).toMatchObject({ handle: 0, note: 60 });
  });

  it('a synth with no instrument still starts the song (the tune player)', () => {
    const synth = new HivelySynth();
    synth.triggerAttack();
    expect(engine.play).toHaveBeenCalled();
  });

  it('the factory keeps the config pending while a tune is loaded', () => {
    const factory = readFileSync(join(process.cwd(), 'src/engine/InstrumentFactory.ts'), 'utf8');
    expect(factory).toContain('hvlSynth.setPendingInstrument(config.hively);');
  });
});
