/**
 * extractSampleDsampleSlice.test.ts — live-edit byte-slice contract.
 *
 * The WASM Tier-2 live-edit path (maxtrax_reload_patch) consumes an exact
 * tailRaw byte slice for one sample: 20-byte header + env array + per-octave
 * PCM, big-endian. This proves extractSampleDsampleSlice returns that slice,
 * that its header round-trips the decoded sample fields, and that its length
 * equals the WASM `len` contract 20 + (ac+rc)*4 + firstLen*(2^oct-1).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseMaxTrax,
  decodeMaxTraxSamples,
  extractSampleDsampleSlice,
} from '@/lib/import/formats/maxtrax/maxtraxFormat';

const SONG = join(process.cwd(), 'public/data/songs/maxtrax/antmusic.mxtx');

describe('extractSampleDsampleSlice returns the tailRaw byte slice for a sample', () => {
  it('slices the header+env+PCM bytes and matches the WASM len contract', () => {
    const data = parseMaxTrax(new Uint8Array(readFileSync(SONG)));
    const samples = decodeMaxTraxSamples(data);
    expect(samples.length).toBeGreaterThan(0);

    const s = extractSampleDsampleSlice(data, 0);
    expect(s).not.toBeNull();
    const slice = s!;
    expect(slice.length).toBeGreaterThanOrEqual(20);

    // Header round-trips the decoded sample fields.
    const dv = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
    const sample = samples[0];
    expect(dv.getUint16(6)).toBe(sample.octaves);
    expect(dv.getUint16(16)).toBe(sample.attackCount);
    expect(dv.getUint16(18)).toBe(sample.releaseCount);

    // Length locks to the WASM reload_patch len contract.
    const firstLen = sample.attackLen + sample.sustainLen;
    const expectedLen =
      20 +
      (sample.attackCount + sample.releaseCount) * 4 +
      firstLen * (Math.pow(2, sample.octaves) - 1);
    expect(slice.length).toBe(expectedLen);
  });

  it('returns null for an out-of-range sample index', () => {
    const data = parseMaxTrax(new Uint8Array(readFileSync(SONG)));
    const n = decodeMaxTraxSamples(data).length;
    expect(extractSampleDsampleSlice(data, n)).toBeNull();
  });
});
