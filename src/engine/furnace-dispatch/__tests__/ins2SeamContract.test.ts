/**
 * The seam that let Furnace break for months: the converter WRITES the INS2
 * blob in one place and the pre-upload READ it in another.
 *
 * `ins2Uploads.test.ts` next door tests the collection rule against hand-built
 * objects, and it passed the whole time the engine was reporting
 * `pre-uploaded 0/43`. A rule tested only against its own fixtures cannot
 * catch a field moving on the other side of the seam.
 *
 * So this drives the REAL converter and hands its REAL output to the REAL
 * collector. If either side moves `rawBinaryData`, this fails — which is the
 * only thing that would have caught the original bug.
 *
 * Deliberately no WASM: the .fur parser needs it, the contract does not.
 */
import { describe, it, expect } from 'vitest';
import { convertToInstrument } from '@/lib/import/InstrumentConverter';
import { collectIns2Uploads } from '../ins2Uploads';
import type { ParsedInstrument } from '@/types/tracker';

const INS2 = (...tail: number[]) => new Uint8Array([0x49, 0x4e, 0x53, 0x32, ...tail]);

/** What the .fur parser hands the converter for a chip instrument. */
function parsedFurnaceInstrument(id: number, rawBinaryData: Uint8Array): ParsedInstrument {
  return {
    id,
    name: `Instrument ${id}`,
    samples: [],
    fadeout: 0,
    volumeType: 'none',
    panningType: 'none',
    rawBinaryData,
    furnace: {
      chipType: 6,
      synthType: 'FurnaceAY',
      macros: [],
      wavetables: [],
    } as never,
  };
}

describe('the converter and the pre-upload agree where the INS2 blob lives', () => {
  it('a converted Furnace instrument is one the collector can find', () => {
    // THE BUG, in one assertion. Before the fix the collector read
    // `instrument.rawBinaryData`; the converter writes it onto the furnace
    // CONFIG, so this came back empty for every song ever loaded.
    const converted = convertToInstrument(parsedFurnaceInstrument(1, INS2(1, 2, 3)), 1, 'FUR');
    expect(converted.length, 'converter produced no instrument').toBeGreaterThan(0);

    const uploads = collectIns2Uploads(converted as never[]);
    expect(uploads, 'the blob the converter wrote was not found').toHaveLength(1);
    expect(Array.from(uploads[0].data)).toEqual([0x49, 0x4e, 0x53, 0x32, 1, 2, 3]);
  });

  it('a whole song converts to a full upload set — N of N, never 0 of N', () => {
    // The symptom in the log was always `pre-uploaded 0/43`. This is that
    // number, asserted.
    const song = [1, 2, 3, 4, 5].flatMap((id) =>
      convertToInstrument(parsedFurnaceInstrument(id, INS2(id)), id, 'FUR'),
    );
    expect(collectIns2Uploads(song as never[]), 'pre-upload would report 0/N').toHaveLength(song.length);
  });

  it('keeps the slot the FILE gave each instrument, not the array position', () => {
    // `furnaceIndex` is `parsed.id - 1`, and the sequencer asks by that index.
    const converted = convertToInstrument(parsedFurnaceInstrument(7, INS2(9)), 7, 'FUR');
    expect(collectIns2Uploads(converted as never[])[0].slot).toBe(6);
  });
});
