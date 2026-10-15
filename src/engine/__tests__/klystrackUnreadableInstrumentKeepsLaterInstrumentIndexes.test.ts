/**
 * The worklet posts null for an instrument slot it could not read. klysNativeWithSongData dropped those slots, so
 * every later instrument moved down one index and the editor (instrument index = InstrumentConfig.id - 1) showed
 * and edited the wrong instrument. A null slot now keeps what the store holds at that index.
 */
import { describe, it, expect } from 'vitest';
import { klysNativeWithSongData, klysInstrumentFromEngine } from '@/engine/klystrack/klysSongData';
import { klysStubInstrument } from '@/lib/import/formats/KlysParser';
import type { KlysSongData } from '@/engine/klystrack/KlysEngine';
import type { KlysNativeData } from '@/types/tracker';

type Engine = NonNullable<KlysSongData['instruments'][number]>;
const engineInst = (name: string): Engine => {
  const { fm, ...rest } = { ...klysStubInstrument(), name };
  return { ...rest, fmFlags: fm.flags, fmModulation: fm.modulation, fmFeedback: fm.feedback, fmWave: fm.wave, fmHarmonic: fm.harmonic, fmAdsr: fm.adsr, fmAttackStart: fm.attackStart };
};
const current = (n: number, from: KlysNativeData['instrumentsFrom']): KlysNativeData => ({
  channels: 4, songLength: 1, loopPoint: 0, songSpeed: 6, songSpeed2: 6, songRate: 50, masterVolume: 128, flags: 0,
  patterns: [], sequences: [], instrumentsFrom: from,
  instruments: Array.from({ length: n }, (_, i) => ({ ...klysStubInstrument(), name: `stub${i}` })),
});
const songData = (instruments: KlysSongData['instruments']): KlysSongData => ({ patterns: [], sequences: [], instruments, wavetables: [] });

describe('klystrack songData with an unreadable instrument slot', () => {
  it('keeps every later instrument at its own index, the unreadable slot keeping the stored placeholder', () => {
    const out = klysNativeWithSongData(current(3, 'stub'), songData([engineInst('a'), null, engineInst('c')]));
    expect(out.instruments.map((i) => i.name)).toEqual(['a', 'stub1', 'c']);
    expect(out.instrumentsFrom).toBe('engine');
  });

  it('a slot with no stored placeholder either becomes a stub instead of shifting the rest', () => {
    const out = klysNativeWithSongData(current(0, 'stub'), songData([null, engineInst('b')]));
    expect(out.instruments.map((i) => i.name)).toEqual(['', 'b']);
  });

  it('instruments marked edited are kept whole, whatever the engine posts', () => {
    const cur = current(2, 'edited');
    const out = klysNativeWithSongData(cur, songData([engineInst('x'), engineInst('y')]));
    expect(out.instruments).toBe(cur.instruments);
    expect(out.instrumentsFrom).toBe('edited');
  });

  it('round-trips an engine instrument through the store shape', () => {
    const e = engineInst('rt');
    expect(klysInstrumentFromEngine(e).name).toBe('rt');
  });
});
