/**
 * fm dance.fmt is not probed with UADE ("Cannot play file").
 *
 * `fmt` sat in UADE_EXTENSIONS, so prepareModuleImport called the file
 * UADE-exclusive and pre-scanned it with the UADE engine, which has no player
 * for the PC FM Tracker format. libopenmpt reads it.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';

const loadModuleFile = vi.fn(async (file: File) => ({ metadata: { title: file.name }, arrayBuffer: new ArrayBuffer(1), file }));
vi.mock('../ModuleLoader', () => ({ loadModuleFile }));
const uadeLoad = vi.fn();
vi.mock('@engine/uade/UADEEngine', () => ({
  UADEEngine: { getInstance: () => { uadeLoad(); throw new Error('UADE must not be probed'); } },
}));

const PATH = 'public/data/songs/fm-tracker/fm dance.fmt';

describe('prepareModuleImport on a PC FM Tracker file', () => {
  it('is not UADE-exclusive', async () => {
    const { isUADEExclusiveFile } = await import('../prepareModuleImport');
    const head = new Uint8Array(readFileSync(PATH)).slice(0, 128);
    expect(isUADEExclusiveFile('fm dance.fmt', head)).toBe(false);
  });

  it('reads it through libopenmpt without starting the UADE engine', async () => {
    const { prepareModuleImport } = await import('../prepareModuleImport');
    const file = new File([readFileSync(PATH)], 'fm dance.fmt');
    const prepared = await prepareModuleImport(file);
    expect(uadeLoad).not.toHaveBeenCalled();
    expect(loadModuleFile).toHaveBeenCalledTimes(1);
    expect(prepared.uadeMetadata).toBeUndefined();
  });

  it('still treats a real UADE-only extension as UADE-exclusive', async () => {
    const { isUADEExclusiveFile } = await import('../prepareModuleImport');
    expect(isUADEExclusiveFile('x.tpu', new Uint8Array(128))).toBe(true);
  });
});
