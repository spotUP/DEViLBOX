/**
 * A Buzz generator plays the note that started its WASM init.
 *
 * Owner, 2026-09-30: "the jeskola buss synths dont fire on the first key
 * press". The first note starts the engine's async init, and triggerAttack
 * returned early while the worklet did not exist yet - the note was dropped.
 * Notes (and a quick tap's release) are now queued and played on ready.
 */
import { describe, it, expect, vi } from 'vitest';

const posted: Array<Record<string, unknown>> = [];
let releaseInit: () => void = () => {};
const gain = () => ({ gain: { value: 1, setValueAtTime() {} }, connect() {}, disconnect() {} });

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({ createGain: gain, destination: {}, currentTime: 0, sampleRate: 48000 }),
  noteToFrequency: () => 440,
  audioNow: () => 0,
  timeToSeconds: (t: number) => t,
}));
vi.mock('../../../stores/useSynthErrorStore', () => ({ reportSynthError: () => {} }));
vi.mock('../BuzzmachineEngine', async () => {
  const actual = await vi.importActual<typeof import('../BuzzmachineEngine')>('../BuzzmachineEngine');
  return {
    ...actual,
    BuzzmachineEngine: {
      getInstance: () => ({
        init: () => new Promise<void>((r) => { releaseInit = r; }),
        createMachineNode: async () => ({ connect() {}, port: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }),
      }),
    },
  };
});

describe('Buzz generator first note', () => {
  it('plays a note pressed while the engine is still loading, then its release', async () => {
    const { BuzzmachineGenerator } = await import('../BuzzmachineGenerator');
    const { BuzzmachineType } = await import('../BuzzmachineEngine');
    const synth = new BuzzmachineGenerator(Object.values(BuzzmachineType)[0] as never);
    synth.triggerAttack('C4');
    synth.triggerRelease();
    expect(posted).toHaveLength(0); // not ready yet
    releaseInit();
    await vi.waitFor(() => expect(posted.map((m) => m.type)).toEqual(['noteOn', 'noteOff']));
  });
});
