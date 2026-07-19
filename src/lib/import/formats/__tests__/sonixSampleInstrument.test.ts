/**
 * Regression: sample-based Sonix instruments used to be stamped synthType 'SonixSynth'
 * for EVERY voice slot, so clicking "Edit" dead-ended at "This instrument has no Sonix
 * synth parameters (sample-based instrument)." with no way to edit the sample.
 *
 * The real type lives in the companion .instr header (the WASM loader keys off the same
 * instrument NAME to find <name>.instr / <name>.ss). parseSonixFile now mirrors that:
 * sample voices decode their .ss PCM into a Sampler InstrumentConfig (sample.url data URL)
 * so the normal sample editor opens; synth voices keep 'SonixSynth'.
 *
 * Two companion shapes are exercised:
 *   - TINY 32-byte type-2 reference (.instr be16@2==2, 4-char .ss name @4): cu01 → USA1.ss
 *   - SNX "SampledSound" header: the .ss shares the instrument basename (organ → organ.ss),
 *     with names read from the SNX tail name-table after the 4 voice streams.
 *
 * On revert (all slots forced 'SonixSynth', no PCM) both suites find zero Samplers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseSonixFile } from '../SonixMusicDriverParser';

function loadCompanions(dir: string): Map<string, ArrayBuffer> {
  const map = new Map<string, ArrayBuffer>();
  for (const name of readdirSync(dir)) {
    if (!/\.(instr|ss)$/i.test(name)) continue;
    const b = readFileSync(join(dir, name));
    map.set(
      `Instruments/${name}`,
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    );
  }
  return map;
}

function toAB(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('Sonix sample-based instruments open the sample editor', () => {
  it('TINY type-2 reference: cu01.instr → USA1.ss becomes an editable Sampler', async () => {
    const base = join(
      process.cwd(),
      'public/data/songs/sonix/tiny/Where in the USA is Carmen Sandiego',
    );
    const song = await parseSonixFile(
      toAB(join(base, 'tiny.ingame 01')),
      'tiny.ingame 01',
      loadCompanions(join(base, 'Instruments')),
    );

    const samplers = song.instruments.filter((i) => i.synthType === 'Sampler');
    expect(samplers.length, 'CU01-CU05 all resolve to Samplers').toBeGreaterThanOrEqual(5);

    const cu01 = song.instruments.find((i) => i.name === 'CU01');
    expect(cu01?.synthType).toBe('Sampler');
    expect(cu01?.sample?.url, 'decoded .ss PCM as a WAV data URL').toMatch(/^data:audio\/wav;base64,/);
    expect(cu01?.sample?.audioBuffer, 'session fast-path buffer present').toBeTruthy();
  });

  it('SNX SampledSound: tail name-table + organ.ss becomes an editable Sampler', async () => {
    const base = join(
      process.cwd(),
      'public/data/songs/sonix/snx/Where in Time is Carmen Sandiego',
    );
    const song = await parseSonixFile(
      toAB(join(base, 'snx.theme')),
      'snx.theme',
      loadCompanions(join(base, 'Instruments')),
    );

    // Tail name-table (after the 4 voice streams): ORGAN,FLUTESYN,BASS,SNAREBIG,CRASHCYM.
    const organ = song.instruments.find((i) => i.name === 'ORGAN');
    expect(organ, 'SNX tail name-table read (revert: names are "Sample N")').toBeTruthy();
    expect(organ?.synthType).toBe('Sampler');
    expect(organ?.sample?.url).toMatch(/^data:audio\/wav;base64,/);

    const samplers = song.instruments.filter((i) => i.synthType === 'Sampler');
    expect(samplers.length).toBeGreaterThanOrEqual(5);
  });
});
