/**
 * A module libopenmpt cannot read still imports through its native route.
 *
 * `.mus` is registered with a libopenmpt fallback, so prepareModuleImport
 * asked libopenmpt for its metadata first. For `boogie.mus` (not a Karl
 * Morton file; UADE's UFO/MicroProse player territory) libopenmpt failed and
 * the import died with "Failed to load module: ptr" (ledger F14). The
 * metadata read is a convenience; parseModuleToSong decides the route.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../ModuleLoader', () => ({
  loadModuleFile: vi.fn(async () => { throw new Error('Failed to load module: ptr'); }),
}));

describe('prepareModuleImport', () => {
  it('falls back to header metadata when libopenmpt rejects a .mus', async () => {
    const { prepareModuleImport } = await import('../prepareModuleImport');
    const file = new File([new Uint8Array(4096)], 'boogie.mus');
    const prepared = await prepareModuleImport(file);
    expect(prepared.info.metadata.title).toBe('boogie');
    expect(prepared.info.file).toBe(file);
    expect(prepared.info.arrayBuffer?.byteLength).toBe(4096);
  });
});
