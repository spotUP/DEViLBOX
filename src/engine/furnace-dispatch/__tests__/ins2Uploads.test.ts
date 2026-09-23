/**
 * "furnace is broken again" (2026-09-24) — notes dropped on the ramp-in of
 * every song, on every chip.
 *
 * The console had been saying it plainly:
 *
 *     [FurnaceDispatchEngine] pre-uploaded 0/43 INS2 instruments
 *     [FurnaceDispatchEngine] pre-uploaded 0/26 INS2 instruments
 *
 * Zero every time. The pre-upload read `instrument.rawBinaryData`, but the
 * converter puts the blob on the furnace CONFIG
 * (`InstrumentConverter.ts:231`), so the check always saw `undefined`.
 * Nothing was in the dispatch's table when the first row played, and each
 * instrument went up lazily on its own first note — an upload that clears the
 * synth's ready flag, so that note was dropped.
 */
import { describe, it, expect } from 'vitest';
import { collectIns2Uploads, isIns2 } from '../ins2Uploads';

const ins2 = (...tail: number[]) => new Uint8Array([0x49, 0x4e, 0x53, 0x32, ...tail]);

describe('recognising an INS2 blob', () => {
  it('accepts one that starts with the magic', () => {
    expect(isIns2(ins2(1, 2, 3))).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isIns2(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
    expect(isIns2(new Uint8Array([0x49, 0x4e, 0x53]))).toBe(false);   // magic, no body
    expect(isIns2(undefined)).toBe(false);
    expect(isIns2(null)).toBe(false);
  });
});

describe('finding the blobs a song carries', () => {
  it('reads the blob off the furnace config, where the converter puts it', () => {
    // THE BUG. Before this, the same song yielded an empty list.
    const song = [
      { furnace: { rawBinaryData: ins2(1), furnaceIndex: 0 } },
      { furnace: { rawBinaryData: ins2(2), furnaceIndex: 1 } },
    ];
    expect(collectIns2Uploads(song)).toHaveLength(2);
  });

  it('still reads a blob left on the instrument itself', () => {
    expect(collectIns2Uploads([{ rawBinaryData: ins2(9) }])).toHaveLength(1);
  });

  it('uses the index the FILE gave the instrument, not its array position', () => {
    // The sequencer asks by the .fur file's own index. An instrument list that
    // skips or reorders would otherwise drop each blob in a neighbour's slot,
    // which plays the wrong sound rather than nothing — harder to notice.
    const song = [
      { furnace: { rawBinaryData: ins2(1), furnaceIndex: 4 } },
      { furnace: { rawBinaryData: ins2(2), furnaceIndex: 7 } },
    ];
    expect(collectIns2Uploads(song).map((u) => u.slot)).toEqual([4, 7]);
  });

  it('falls back to the array position when the file index is absent', () => {
    const song = [
      { furnace: { rawBinaryData: ins2(1) } },
      { furnace: { rawBinaryData: ins2(2) } },
    ];
    expect(collectIns2Uploads(song).map((u) => u.slot)).toEqual([0, 1]);
  });

  it('skips instruments with nothing to upload, and keeps the rest', () => {
    const song = [
      { furnace: { rawBinaryData: ins2(1), furnaceIndex: 0 } },
      { furnace: { rawBinaryData: null, furnaceIndex: 1 } },
      {},
      { furnace: { rawBinaryData: new Uint8Array([9, 9, 9, 9, 9]), furnaceIndex: 3 } },
      { furnace: { rawBinaryData: ins2(5), furnaceIndex: 4 } },
    ];
    expect(collectIns2Uploads(song).map((u) => u.slot)).toEqual([0, 4]);
  });

  it('hands back real Uint8Arrays, ready for the worklet', () => {
    const [upload] = collectIns2Uploads([{ furnace: { rawBinaryData: ins2(7, 7) } }]);
    expect(upload.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(upload.data)).toEqual([0x49, 0x4e, 0x53, 0x32, 7, 7]);
  });

  it('is empty for a song with no instruments at all', () => {
    expect(collectIns2Uploads([])).toEqual([]);
  });
});
