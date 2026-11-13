/**
 * MedleySynth key order (owner report 2026-11-13: "medley synths are dead" on combat.mso).
 *
 * The key module loads asynchronously, so triggerAttack posts keyOn one promise hop later. Measured in the page:
 * MCP trigger_note(dorgan, instrument 8, duration 0.6) logged triggerAttack, triggerRelease, keyOff, keyOn - the
 * release arrived first and then ran at once (the release time was ignored), so the note started after its own
 * release and never stopped, or a timed note never sounded for its duration. Now a release honours its audio-clock
 * time, and an attack whose key was already released stays silent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const log: string[] = [];
const ctx = { currentTime: 10, createGain: () => ({ gain: { value: 1 } }) };

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ctx,
  noteToMidi: () => 48,
}));
vi.mock('@/stores/useFormatStore', () => ({
  useFormatStore: { getState: () => ({ nuadePlayerId: 'medley', nuadeFileName: 'combat.mso' }) },
}));
vi.mock('@/engine/nuade/nuadeKeyboard', () => ({ keyboardModuleOnNuade: () => new ArrayBuffer(8) }));
vi.mock('@/lib/import/formats/medleyGrid', () => ({
  medleyTables: () => ({}),
  medleySoundingForGridNote: () => 37,
}));
vi.mock('@/engine/nuade/NuadeEngine', () => ({
  NuadeEngine: {
    getInstance: () => ({
      keyLoad: async () => { log.push('keyLoad'); },
      keyOn: (i: number, s: number) => { log.push(`keyOn ${i} ${s}`); },
      keyOff: () => { log.push('keyOff'); },
    }),
  },
}));

const { MedleySynth } = await import('@/engine/medley/MedleySynth');
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('MedleySynth key order', () => {
  beforeEach(() => { log.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it('a key held then released (dorgan, 8) sounds, then stops', async () => {
    const s = new MedleySynth();
    s.setInstrumentNumber(8);
    s.triggerAttack('C3');
    await flush();
    s.triggerRelease('C3');
    expect(log.filter((l) => l !== 'keyLoad')).toEqual(['keyOn 8 37', 'keyOff']);
  });

  it('a timed release (trigger_note duration) waits for its audio-clock time (Pipe Organ, 1)', async () => {
    vi.useFakeTimers();
    const s = new MedleySynth();
    s.setInstrumentNumber(1);
    s.triggerAttack('C3', ctx.currentTime);
    s.triggerRelease('C3', ctx.currentTime + 0.6);
    await vi.advanceTimersByTimeAsync(10);
    expect(log.filter((l) => l !== 'keyLoad')).toEqual(['keyOn 1 37']);
    await vi.advanceTimersByTimeAsync(700);
    expect(log.filter((l) => l !== 'keyLoad')).toEqual(['keyOn 1 37', 'keyOff']);
  });

  it('a release before the attack lands leaves no stuck note', async () => {
    const s = new MedleySynth();
    s.setInstrumentNumber(8);
    s.triggerAttack('C3');
    s.triggerRelease('C3');
    await flush();
    expect(log).not.toContain('keyOn 8 37');
  });

  it('a new key cancels the previous pending timed release', async () => {
    vi.useFakeTimers();
    const s = new MedleySynth();
    s.setInstrumentNumber(17);
    s.triggerAttack('C3');
    s.triggerRelease('C3', ctx.currentTime + 0.1);
    await vi.advanceTimersByTimeAsync(10);
    s.triggerAttack('D3');
    await vi.advanceTimersByTimeAsync(300);
    expect(log.filter((l) => l !== 'keyLoad')).toEqual(['keyOn 17 37', 'keyOn 17 37']);
  });
});
