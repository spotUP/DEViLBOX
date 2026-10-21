/**
 * Owner report 2026-10-21: "generated a song it plays silent now" while the instruments played. The player connected its
 * native AudioBufferSourceNode to Tone.getDestination().input, a Tone wrapper, and the browser threw "Failed to execute
 * 'connect' on 'AudioNode': Overload resolution failed." This test runs the player's real audio() path (no
 * setPlayerAudioForTests): a native source that only accepts native nodes, like the browser, must land on the native node
 * behind ToneEngine.nativeInput, the input every whole-song engine uses.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

class FakeAudioNode { readonly connected: unknown[] = []; }
class FakeSource extends FakeAudioNode {
  buffer: unknown = null;
  loop = false;
  started = 0;
  connect(target: unknown): void {
    if (!(target instanceof FakeAudioNode)) throw new TypeError("Failed to execute 'connect' on 'AudioNode': Overload resolution failed.");
    this.connected.push(target);
  }
  start(): void { this.started++; }
  stop(): void { /* recorded by started only */ }
  disconnect(): void { /* nothing to undo */ }
}

const sources: FakeSource[] = [];
const fakeContext = {
  currentTime: 0,
  createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
  createBufferSource: () => { const s = new FakeSource(); sources.push(s); return s; },
};
/** The engine's native input: a Tone-style wrapper whose `input` is the native node. */
const nativeNode = new FakeAudioNode();
const engine = { nativeInput: { input: nativeNode } };

vi.mock('tone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tone')>()),
  getContext: () => ({ rawContext: fakeContext }),
  getDestination: () => ({ input: { name: 'Tone Volume wrapper' } }),
}));
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => engine, ToneEngine: { getInstance: () => engine } }));
vi.mock('@/lib/uprough/upRoughSongService', () => ({
  ensureUpRoughSong: () => Promise.resolve({ mix: new Float64Array(64), rate: 22050, bpm: 120 }),
  onUpRoughSongRendered: () => () => undefined,
  onUpRoughSongPartial: () => () => undefined,
  currentPartialMix: () => null,
  currentPartialRate: () => 22050,
}));

import { isUpRoughSongPlaying, startUpRoughSong, stopUpRoughSong } from '@/lib/uprough/upRoughSongPlayer';
import { useTrackerStore } from '@stores/useTrackerStore';

describe('a generated Up Rough song is audible', () => {
  const g = globalThis as { AudioNode?: unknown };
  const saved = g.AudioNode;
  beforeAll(() => { g.AudioNode = FakeAudioNode; });
  afterAll(() => { stopUpRoughSong(); g.AudioNode = saved; });

  it('plays the rendered mix into the engine native input, not the Tone destination wrapper', async () => {
    useTrackerStore.setState({ patterns: [{ length: 64 }] as never, patternOrder: [0] });
    await startUpRoughSong(0, 0);
    expect(isUpRoughSongPlaying()).toBe(true);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.connected).toEqual([nativeNode]);
    expect(sources[0]!.started).toBe(1);
  });
});
