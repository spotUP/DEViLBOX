/**
 * A grid edit on a Digital Sound Studio song lands in the DSS replayer as the
 * note, sample and effect that were typed.
 *
 * DssEngine.setCell used to forward the grid's terms positionally, so
 * dss_set_cell(pattern, row, channel, sample, period, effect, arg) received
 * the NOTE as the sample number and the INSTRUMENT as the Amiga period, and an
 * XM effect number as a DSS one. Nothing noticed while no parser fed the DSS
 * engine; once .dss songs play on it, every edit would have written a wrong
 * sample at a sub-audible period. The engine now converts through
 * dssCellFields, the same reverse mapping DSSEncoder writes file bytes with.
 *
 * Drives the real worklet + WASM with the message DssEngine posts and reads the
 * cell back with dss_get_cell.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet, songBuffer } from './workletHarness';
import { dssCellFields } from '@engine/uade/encoders/DSSEncoder';

type DssModule = {
  _malloc(n: number): number;
  _free(p: number): void;
  _dss_get_cell(h: number, pat: number, row: number, ch: number, sample: number, period: number, effect: number, arg: number): void;
  HEAPU8: Uint8Array;
};

describe('Digital Sound Studio live edit', () => {
  it('writes the typed note, sample and effect into the replayer', async () => {
    const { proc, send } = await startWorklet('dss', 'Dss');
    await send({ type: 'loadModule', moduleData: songBuffer('public/data/songs/digital-sound-studio/zrimay.dss') });

    // C-2 (note 13 in ProTracker naming = period 856), sample 3, XM set volume 0x20
    const fields = dssCellFields({ note: 13, instrument: 3, effTyp: 0x0C, eff: 0x20 });
    expect(fields).toEqual({ sample: 3, period: 856, effect: 0x03, effectArg: 0x20 });
    await send({ type: 'setCell', index: 0, row: 5, channel: 2, ...fields });

    const mod = proc.module as DssModule;
    const handle = proc.handle as number;
    const p = mod._malloc(8);
    mod._dss_get_cell(handle, 0, 5, 2, p, p + 2, p + 4, p + 5);
    const heap = mod.HEAPU8;
    const period = heap[p + 2] | (heap[p + 3] << 8);
    const got = { sample: heap[p], period, effect: heap[p + 4], effectArg: heap[p + 5] };
    mod._free(p);
    expect(got).toEqual(fields);
  });
});
