/**
 * Some DefleMask files are missing single bytes from their deflate stream: the
 * zlib checksum fails, a sample runs a byte or two short, and every record
 * after it reads as garbage. Upstream Furnace refuses them at the checksum.
 * The compressor's copy distances still count the true data, so the loader
 * puts each missing byte back and inflates again, which also mends every later
 * copy that reached across the gap (furnace-fileops-wasm/src/dmfSampleRepair.h).
 *
 * Drives the real FurnaceFileOps WASM through parseFurnaceFile, the entry point
 * every .dmf load takes. The build is web-only, so the script tag the loader
 * injects is answered here by evaluating the same file and handing the factory
 * the .wasm bytes directly.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installFurnaceFileOpsWasm, readSong as readAnySong } from './furnaceFileOpsWasmHarness';

const notifyWarning = vi.fn();
vi.mock('@/stores/useNotificationStore', () => ({
  notify: { warning: (...a: unknown[]) => notifyWarning(...a), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const readSong = (rel: string) => readAnySong(`deflemask/${rel}`);

beforeAll(installFurnaceFileOpsWasm);

// First load instantiates the WASM, which is slow on a busy machine.
describe('DefleMask file with a damaged sample block', { timeout: 60000 }, () => {
  it('loads Darude - Sandstorm.dmf with all four samples at their full length', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    const { loadFurFileWasm } = await import('../wasm/FurnaceFileOps');
    notifyWarning.mockClear();

    const song = await parseFurnaceFile(readSong('Darude - Sandstorm.dmf'), 'Darude - Sandstorm.dmf');

    expect(song.patterns.length).toBeGreaterThan(0);
    // One byte is missing in sample 0 and two in sample 1. The warning says
    // so with real numbers, not printf placeholders.
    expect(notifyWarning).toHaveBeenCalledTimes(1);
    const message = String(notifyWarning.mock.calls[0][0]);
    expect(message).toContain('Darude - Sandstorm.dmf');
    expect(message).toContain('3 bytes were missing from the file\'s compressed sample data and were put back');
    expect(message).not.toContain('%d');

    // Declared lengths 38888, 39056, 24550, 5014, resampled by their pitch
    // (2x, 2x, 4x, 2x): every sample read whole, none dropped or clamped.
    const loaded = await loadFurFileWasm(readSong('Darude - Sandstorm.dmf'));
    expect(loaded.samples.map((x) => x.samples)).toEqual([19444, 19528, 6138, 2507]);
  });

  it('mends later records by putting the missing byte back into the stream', async () => {
    const { loadFurFileWasm } = await import('../wasm/FurnaceFileOps');

    // One byte is missing at the end of sample 0. Read as inflated, every
    // later sample name picks up a stray letter ("opend hihat.wav") because
    // copies reaching across the gap land one byte early, and sample 1's
    // header does not read, so a repair of the inflated data keeps 1 of 5.
    // Re-inflated with the byte in place, all five read at their lengths —
    // sample 1's length field is one of the mended copies: 1933, where the
    // unmended stream gives an impossible 234882955.
    const loaded = await loadFurFileWasm(readSong('96N64player/Rainbow Island title.dmf'));
    expect(loaded.loadWarning).toBe('1 bytes were missing from the file\'s compressed sample data and were put back');
    expect(loaded.samples.map((x) => x.samples)).toEqual([1931, 1933, 8592, 12037, 65759]);
  });

  it('puts a lost byte back where the whole chain of records then reads', async () => {
    const { loadFurFileWasm } = await import('../wasm/FurnaceFileOps');

    // One byte is lost in sample 1 and three at the end of sample 3. The
    // smooth-sound guess for the first put it a few bytes off: the next header
    // still read, but a copy between the two places carried a wrong length
    // field two records on, and the load kept 3 of 4 samples. Candidates are
    // now judged by how far the chain reads, not just the next record.
    const loaded = await loadFurFileWasm(readSong('Speedy/GoStraightNTSC.dmf'));
    expect(loaded.loadWarning).toBe('4 bytes were missing from the file\'s compressed sample data and were put back');
    expect(loaded.samples).toHaveLength(4);
  });

  it('loads a checksum-clean file that carries samples without any warning', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    notifyWarning.mockClear();

    const song = await parseFurnaceFile(readSong('220hertz/Andrew_haggles.dmf'), 'Andrew_haggles.dmf');

    expect(song.patterns.length).toBeGreaterThan(0);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('still refuses a file whose damage reaches the patterns', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    notifyWarning.mockClear();

    await expect(
      parseFurnaceFile(readSong('KillaMaaki/FightToTheDeath.dmf'), 'FightToTheDeath.dmf'),
    ).rejects.toThrow('order at 5, 30 out of range! (216)');
  });
});
