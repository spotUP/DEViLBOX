/**
 * A release must cancel an attack that is still waiting for the player.
 *
 * Reported 2026-09-23: "i loaded amanda.ahx from a clean devilbox enabled dub
 * bus and now i hear a ringing sound that dont go away. i have not clicked
 * play yet." The log showed one `[HivelyWorklet] noteOn handle=0 note=60
 * vel=64` right after `player created`, and no noteOff — ever.
 *
 * The sequence: ToneEngine pre-warms every WASM synth on song load with
 * `triggerAttack('C4')` and a `triggerRelease()` 50 ms later. HivelySynth's
 * player is created asynchronously, so the attack was QUEUED behind setup.
 * The release arrived while `_playerHandle` was still -1, took the
 * song-mode branch (`engine.stop()`) and sent no noteOff. Then setup
 * finished, the queued attack fired, and the note rang until the page died.
 *
 * The invariant: a release cancels whatever attack is still pending, and an
 * attack whose release has already come never reaches the worklet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Msg = Record<string, unknown>;

const sent: Msg[] = [];
let resolveHandle: ((h: number) => void) | null = null;

const engine = {
  output: { connect: vi.fn() },
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
const noteOffs = () => sent.filter((m) => m.type === 'noteOff');

async function settle(): Promise<void> {
  // The queued attack runs on `_setupPromise.then`; a few microtask turns.
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  sent.length = 0;
  resolveHandle = null;
  engine.stop.mockClear();
});

describe('HivelySynth: a release cancels an attack still waiting for its player', () => {
  it('does not fire the pre-warm note after its release already came (the amanda.ahx ring)', async () => {
    const synth = new HivelySynth();
    void synth.setInstrument(config);
    await Promise.resolve(); // let _doSetInstrument pass engine.ready()

    // ToneEngine's pre-warm: attack now, release 50 ms later — both before
    // the worklet has answered with a player handle.
    synth.triggerAttack('C4', undefined, 0.01);
    synth.triggerRelease();

    // Now the player arrives.
    expect(resolveHandle).not.toBeNull();
    resolveHandle!(0);
    await settle();

    expect(noteOns(), 'a released note must not reach the worklet').toHaveLength(0);
    expect(engine.stop, 'an instrument release is not a song stop').not.toHaveBeenCalled();
  });

  it('still plays a note whose release has not come yet, and releases it', async () => {
    const synth = new HivelySynth();
    void synth.setInstrument(config);
    await Promise.resolve();

    synth.triggerAttack('C4', undefined, 1);
    resolveHandle!(0);
    await settle();

    expect(noteOns()).toHaveLength(1);
    expect(noteOns()[0]).toMatchObject({ handle: 0, note: 60 });

    synth.triggerRelease();
    expect(noteOffs()).toHaveLength(1);
  });

  it('plays and releases directly once the player exists', async () => {
    const synth = new HivelySynth();
    void synth.setInstrument(config);
    await Promise.resolve();
    resolveHandle!(0);
    await settle();

    synth.triggerAttack('C4');
    synth.triggerRelease();
    expect(noteOns()).toHaveLength(1);
    expect(noteOffs()).toHaveLength(1);
  });
});
