/**
 * KIE-2.1 (klystrack instrument editor): a program step 0x0000 is a real command (arpeggio base note), but
 * save_instrument trimmed the program at the last non-ZERO word, so `[0x0C40, 0x0000, 0x0000]` saved as one
 * step and the two arpeggio steps came back as empty (klystrack's diskop.c trims against MUS_FX_NOP).
 *
 * Driven with the real Klystrack worklet + WASM on the real song: edit the program, save, load the bytes into a
 * fresh worklet and read the instrument back.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { klysTransform, type KlysSongData } from '@/engine/klystrack/KlysEngine';

const NOP = 0xfffe;
type Worklet = Awaited<ReturnType<typeof startWorklet>>;
interface Msg { type?: string; instruments?: KlysSongData['instruments']; data?: ArrayBuffer; error?: string }

async function loaded(buffer: ArrayBuffer): Promise<{ w: Worklet; data: KlysSongData }> {
  const w = await startWorklet('klystrack', 'Klystrack', klysTransform);
  await w.send({ type: 'loadSong', buffer });
  const msg = (w.posted as unknown as Msg[]).find((m) => m.type === 'songData')!;
  return { w, data: msg as unknown as KlysSongData };
}

describe('klystrack program save', () => {
  it('a program step 0x0000 (arpeggio base note) survives save and reload', { timeout: 120000 }, async () => {
    const { w } = await loaded(songBuffer('public/data/songs/klystrack/Ocean Loader III.kt'));
    const program = [0x0c40, 0x0000, 0x0000, ...new Array(29).fill(NOP)];
    for (let s = 0; s < 32; s++) await w.send({ type: 'setInstrumentProgramStep', idx: 0, step: s, value: program[s] });
    (w.posted as unknown[]).splice(0);
    await w.send({ type: 'serializeSong' });
    const saved = (w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!;
    expect(saved.error).toBeUndefined();

    const { data } = await loaded(saved.data!);
    expect(data.instruments[0]!.program).toEqual(program);
  });

  it('a trailing run of NOP steps is still trimmed (program length 3 saves 3 steps, not 32)', { timeout: 120000 }, async () => {
    const { w } = await loaded(songBuffer('public/data/songs/klystrack/Ocean Loader III.kt'));
    const sizeWith = async (program: number[]): Promise<number> => {
      for (let s = 0; s < 32; s++) await w.send({ type: 'setInstrumentProgramStep', idx: 0, step: s, value: program[s] });
      (w.posted as unknown[]).splice(0);
      await w.send({ type: 'serializeSong' });
      return (w.posted as unknown as Msg[]).find((m) => m.type === 'serializeSongResult')!.data!.byteLength;
    };
    const three = await sizeWith([0x0c40, 0, 0, ...new Array(29).fill(NOP)]);
    const one = await sizeWith([0x0c40, ...new Array(31).fill(NOP)]);
    expect(three - one, 'two more 16-bit steps').toBe(4);
  });
});
