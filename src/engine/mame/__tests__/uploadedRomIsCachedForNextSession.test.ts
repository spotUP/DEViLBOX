/**
 * A ROM uploaded in the "ROM Required" dialog was only handed to the engine for the current session; the next
 * session asked for the upload again. The dialog now caches the upload through cacheUploadedRom, which writes
 * the same combined layout loadChipROMs reads back from IndexedDB when the disk fetch finds nothing.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';

import { cacheUploadedRom, loadTR707ROMs, resolveUploadedRom, usesCombinedRomUpload, TR707_ROM_CONFIG } from '@engine/mame/MAMEROMLoader';
import { deleteROM } from '@engine/mame/MAMEROMStore';
import { loadSynthROM, type SynthUpdateContext } from '@engine/tone/SynthParameterUpdates';

/** The live site answers a missing file with the SPA index page: 200, text/html. */
function stubSpaFallbackFetch(): void {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })));
}

describe('uploaded ROM is cached for the next session', () => {
  beforeEach(async () => {
    await deleteROM(TR707_ROM_CONFIG.chipName);
    stubSpaFallbackFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a TR-707 ROM uploaded once loads in the next session without upload', async () => {
    const zip = new JSZip();
    zip.file('tr707_voices.bin', new Uint8Array([1, 2, 3, 4]));
    zip.file('tr707_crash.bin', new Uint8Array([5, 6]));
    zip.file('tr707_ride.bin', new Uint8Array([7, 8]));
    const zipBytes = await zip.generateAsync({ type: 'arraybuffer' });

    expect(await cacheUploadedRom('MAMETR707', 'tr707.zip', zipBytes)).toBe(true);

    // Next session: disk has nothing, only IndexedDB does.
    const rom = await loadTR707ROMs();
    expect(rom).not.toBeNull();
    const voices = TR707_ROM_CONFIG.files.find((f) => f.name === 'tr707_voices.bin')!.offset;
    const crash = TR707_ROM_CONFIG.files.find((f) => f.name === 'tr707_crash.bin')!.offset;
    const ride = TR707_ROM_CONFIG.files.find((f) => f.name === 'tr707_ride.bin')!.offset;
    expect(Array.from(rom!.slice(voices, voices + 4))).toEqual([1, 2, 3, 4]);
    expect(Array.from(rom!.slice(crash, crash + 2))).toEqual([5, 6]);
    expect(Array.from(rom!.slice(ride, ride + 2))).toEqual([7, 8]);
  });

  it('a raw .bin upload round-trips unchanged', async () => {
    const bin = new Uint8Array(TR707_ROM_CONFIG.combinedSize ?? 0x20000).fill(0xab);
    bin[0] = 9;
    expect(await cacheUploadedRom('MAMETR707', 'tr707_combined.bin', bin.buffer as ArrayBuffer)).toBe(true);

    const rom = await loadTR707ROMs();
    expect(rom).not.toBeNull();
    expect(rom!.length).toBe(bin.length);
    expect(rom![0]).toBe(9);
    expect(rom![1]).toBe(0xab);
  });

  it('a synth type without a loadChipROMs config caches nothing', async () => {
    expect(await cacheUploadedRom('NoSuchSynth', 'x.bin', new ArrayBuffer(4))).toBe(false);
  });

  it('an uploaded tr707 zip reaches the synth as one combined buffer at offset 0 and marks the ROM loaded', async () => {
    const zip = new JSZip();
    zip.file('tr707_voices.bin', new Uint8Array([1, 2, 3, 4]));
    zip.file('tr707_crash.bin', new Uint8Array([5, 6]));
    const zipBytes = await zip.generateAsync({ type: 'arraybuffer' });

    expect(usesCombinedRomUpload('MAMETR707')).toBe(true);
    const combined = await resolveUploadedRom('MAMETR707', 'tr707.zip', zipBytes);

    const calls: { offset: number; data: Uint8Array }[] = [];
    const synth = {
      romLoaded: false,
      loadROM: (offset: number, data: Uint8Array) => { calls.push({ offset, data }); },
    };
    const ctx = {
      instruments: new Map([['7', synth]]),
      instrumentIdFromKey: (key: string) => Number(key),
    } as unknown as SynthUpdateContext;

    loadSynthROM(ctx, 7, 'MAMETR707', 0, combined!);

    expect(calls).toHaveLength(1);
    expect(calls[0].offset).toBe(0);
    expect(calls[0].data).toBe(combined);
    expect(Array.from(calls[0].data.slice(0, 4))).toEqual([1, 2, 3, 4]);
    expect(synth.romLoaded).toBe(true);
  });
});
