/**
 * A Buzz generator plays the note that started its WASM init.
 *
 * Owner, 2026-09-30: "the jeskola buss synths dont fire on the first key
 * press". The first note starts the engine's async init, and triggerAttack
 * returned early while the worklet did not exist yet - the note was dropped.
 * Notes (and a quick tap's release) are now queued and played on ready.
 * The same for the instrument's saved settings: the factories never applied
 * them and setParameter dropped anything sent before ready, so every Buzz
 * generator - presets included - started on its machine's defaults.
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
        setParameter: (_n: unknown, index: number, value: number) => posted.push({ type: 'param', index, value }),
        stop: () => posted.push({ type: 'stop' }),
        createMachineNode: async () => ({ connect() {}, port: { postMessage: (m: Record<string, unknown>) => posted.push(m) } }),
      }),
    },
  };
});

describe('Buzz generator first note', () => {
  it('plays a note pressed while the engine is still loading, then its release', async () => {
    const { BuzzmachineGenerator } = await import('../BuzzmachineGenerator');
    const { BuzzmachineType } = await import('../BuzzmachineEngine');
    posted.length = 0;
    const synth = new BuzzmachineGenerator(Object.values(BuzzmachineType)[0] as never);
    synth.applyConfig({ parameters: { 2: 77 } });
    synth.triggerAttack('C4');
    synth.triggerRelease();
    expect(posted).toHaveLength(0); // not ready yet
    releaseInit();
    // Settings, then a stop (a drone machine starts on a parameter tick and a
    // restored FrequencyBomb played forever), then the queued note.
    await vi.waitFor(() => expect(posted.map((m) => m.type)).toEqual(['param', 'stop', 'noteOn', 'noteOff']));
    expect(posted[0]).toMatchObject({ index: 2, value: 77 });
  });

  it('factory presets carry their settings where the generator reads them', async () => {
    const { BUZZMACHINE_FACTORY_PRESETS } = await import('@/constants/buzzmachineFactoryPresets');
    expect(BUZZMACHINE_FACTORY_PRESETS.length).toBeGreaterThan(10);
    for (const p of BUZZMACHINE_FACTORY_PRESETS) {
      expect(p.buzzmachine?.machineType, p.name).toBeTruthy();
      // Two presets are the machine's defaults by design.
      if (!['Buzz Init KickXP', 'Buzz Phone Tones'].includes(p.name ?? '')) {
        expect(Object.keys(p.buzzmachine?.parameters ?? {}).length, p.name).toBeGreaterThan(0);
      }
    }
  });
});
