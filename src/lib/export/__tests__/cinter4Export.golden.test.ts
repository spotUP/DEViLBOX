/**
 * Cinter4 exporter byte-exact golden test.
 *
 * Guards the 1:1 port of askeksa/Cinter's CinterConvert.py: exporting the bundled
 * example ProTracker modules must reproduce the reference `.cinter4` songdata (and
 * raw-sample blob) byte-for-byte. The golden blobs were produced by running the
 * upstream `convert/CinterConvert.py` (Python 3.14) on the same modules and verified
 * to match the current exporter output.
 *
 * This also guards the Phase 1a refactor (extraction of `encodeFromStreams`): if the
 * refactor changes any byte of the compiled output, this test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { encodeCinter4FromMod } from '@/lib/export/Cinter4Exporter';

const FX = resolve(__dirname, 'fixtures/cinter4');
const read = (name: string) => new Uint8Array(readFileSync(resolve(FX, name)));

describe('Cinter4 exporter — byte-exact vs CinterConvert.py golden', () => {
  it('JazzCat-Automatic (raw + generated instruments) matches golden songdata and raw blob', () => {
    const r = encodeCinter4FromMod(read('JazzCat-Automatic.mod'));
    expect(r.errors).toEqual([]);
    expect(Array.from(r.songdata)).toEqual(Array.from(read('JazzCat-Automatic.golden.cinter4')));
    expect(Array.from(r.rawSamples)).toEqual(Array.from(read('JazzCat-Automatic.golden.raw')));
  });

  it('CurtCool-BackInSpace (all-generated) matches golden songdata', () => {
    const r = encodeCinter4FromMod(read('CurtCool-BackInSpace.mod'));
    expect(Array.from(r.songdata)).toEqual(Array.from(read('CurtCool-BackInSpace.golden.cinter4')));
    expect(r.rawSamples.length).toBe(0);
  });
});
