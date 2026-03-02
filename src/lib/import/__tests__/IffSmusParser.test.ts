/**
 * IffSmusParser Tests - Format capability analysis
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { isIffSmusFormat, parseIffSmusFile } from '../formats/IffSmusParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

const REF = resolve(import.meta.dirname, '../../../../Reference Music');
const IS_DIR = resolve(REF, 'IFF-SMUS/- unknown');
const FILE1 = resolve(IS_DIR, 'alex/alex.smus');
const FILE2 = resolve(IS_DIR, 'Amanda/Amanda.smus');
const YESSONIX_DIR = resolve(IS_DIR, 'yessonix');
const YESSONIX_SMUS = resolve(YESSONIX_DIR, 'yessonix.smus');
const YESSONIX_INSTR_DIR = resolve(YESSONIX_DIR, 'Instruments');

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('isIffSmusFormat', () => {
  it('detects alex', () => {
    expect(isIffSmusFormat(loadBuf(FILE1))).toBe(true);
  });
  it('detects Amanda', () => {
    expect(isIffSmusFormat(loadBuf(FILE2))).toBe(true);
  });
  it('rejects zeroed buffer', () => {
    expect(isIffSmusFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseIffSmusFile — alex', () => {
  it('parses without throwing', async () => {
    await expect(parseIffSmusFile(loadBuf(FILE1), 'alex')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseIffSmusFile(loadBuf(FILE1), 'alex');
    const report = analyzeFormat(song, 'alex');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

describe('parseIffSmusFile — Amanda', () => {
  it('parses without throwing', async () => {
    await expect(parseIffSmusFile(loadBuf(FILE2), 'Amanda')).resolves.toBeDefined();
  });
  it('reports format capabilities', async () => {
    const song = await parseIffSmusFile(loadBuf(FILE2), 'Amanda');
    const report = analyzeFormat(song, 'Amanda');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// -- Companion file PCM loading tests ----------------------------------------

function loadCompanionMap(): Map<string, ArrayBuffer> {
  const map = new Map<string, ArrayBuffer>();
  const files = readdirSync(YESSONIX_INSTR_DIR);
  for (const f of files) {
    const buf = readFileSync(resolve(YESSONIX_INSTR_DIR, f));
    map.set(f, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return map;
}

describe('parseIffSmusFile — yessonix with companions', () => {
  it('parses with companion files without throwing', async () => {
    const companions = loadCompanionMap();
    await expect(
      parseIffSmusFile(loadBuf(YESSONIX_SMUS), 'yessonix.smus', companions),
    ).resolves.toBeDefined();
  });

  it('creates instruments with real PCM data for .ss companions', async () => {
    const companions = loadCompanionMap();
    const song = await parseIffSmusFile(loadBuf(YESSONIX_SMUS), 'yessonix.smus', companions);

    // yes1, yes2, yesdrumintro have .ss files -> should have real audio
    // createSamplerInstrument stores WAV in sample.audioBuffer (ArrayBuffer)
    const withAudio = song.instruments.filter(
      (inst) => inst.sample?.audioBuffer && inst.sample.audioBuffer.byteLength > 100,
    );
    expect(withAudio.length).toBe(3);
  });

  it('creates silent placeholders for instruments without .ss files', async () => {
    const companions = loadCompanionMap();
    const song = await parseIffSmusFile(loadBuf(YESSONIX_SMUS), 'yessonix.smus', companions);

    // yes2end, yesguitar, yesguitar2 have no .ss -> silent placeholders
    const silent = song.instruments.filter(
      (inst) => !inst.sample?.audioBuffer || inst.sample.audioBuffer.byteLength <= 100,
    );
    expect(silent.length).toBeGreaterThanOrEqual(3);
  });

  it('instruments with PCM have non-trivial sample length', async () => {
    const companions = loadCompanionMap();
    const song = await parseIffSmusFile(loadBuf(YESSONIX_SMUS), 'yessonix.smus', companions);

    // yes1.ss = 32194 bytes, yes2.ss = 61410 bytes, yesdrumintro.ss = 16770 bytes
    // After 8-bit -> WAV conversion, audioBuffer will be larger than raw PCM
    const withAudio = song.instruments.filter(
      (inst) => inst.sample?.audioBuffer && inst.sample.audioBuffer.byteLength > 100,
    );
    for (const inst of withAudio) {
      expect(inst.sample!.audioBuffer!.byteLength).toBeGreaterThan(1000);
    }
  });

  it('instruments without companions parse identically to no-companion call', async () => {
    const songNoCompanion = await parseIffSmusFile(loadBuf(YESSONIX_SMUS), 'yessonix.smus');
    // All instruments should be silent placeholders (tiny WAV)
    for (const inst of songNoCompanion.instruments) {
      expect(inst.sample?.audioBuffer).toBeDefined();
      expect(inst.sample!.audioBuffer!.byteLength).toBeLessThan(100);
    }
  });

  it('song structure is unchanged by companion loading', async () => {
    const companions = loadCompanionMap();
    const songWith = await parseIffSmusFile(loadBuf(YESSONIX_SMUS), 'yessonix.smus', companions);
    const songWithout = await parseIffSmusFile(loadBuf(YESSONIX_SMUS), 'yessonix.smus');

    expect(songWith.numChannels).toBe(songWithout.numChannels);
    expect(songWith.patterns.length).toBe(songWithout.patterns.length);
    expect(songWith.instruments.length).toBe(songWithout.instruments.length);
    expect(songWith.initialSpeed).toBe(songWithout.initialSpeed);
    expect(songWith.initialBPM).toBe(songWithout.initialBPM);
  });
});
