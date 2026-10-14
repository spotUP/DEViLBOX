/**
 * A Richard Joseph module whose first instrument has a non-zero sample offset
 * plays through UADE.
 *
 * The eagleplayer's DTP_Check2 also demanded that the long at module offset 12
 * (instrument 0's sample offset) be 0, so 'aquatic games.sng' (0x000A3340
 * there, a one-word dummy sample) died with "module check failed" and the app
 * played silence (RJP-SNG-INS-SILENT, 2026-10-14). generate_registry.py patches
 * that test out of the embedded player. The fixture is the tracked cannon
 * fodder pair with that one long changed, which reproduces the rejection.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderFileToSamples } from '../../../../tools/uade-audit/uadeRenderCore';

const DIR = join(process.cwd(), 'public/data/songs/richard-joseph');

describe('Richard Joseph module check', () => {
  it('plays a .sng whose first sample offset is not 0 (aquatic games)', async () => {
    const sng = new Uint8Array(readFileSync(join(DIR, 'cannon fodder (intro).sng')));
    const ins = new Uint8Array(readFileSync(join(DIR, 'cannon fodder (intro).ins')));
    expect(Array.from(sng.subarray(12, 16))).toEqual([0, 0, 0, 0]);
    sng.set([0x00, 0x0a, 0x33, 0x40], 12);
    const r = await renderFileToSamples(sng, 'offset sample.sng', {
      sampleRate: 44100, seconds: 3,
      companions: [{ name: 'offset sample.ins', data: ins }],
    });
    let sum = 0;
    for (let i = 0; i < r.samples.length; i++) sum += r.samples[i] * r.samples[i];
    expect(Math.sqrt(sum / r.samples.length)).toBeGreaterThan(0.01);
  }, 60_000);
});
