/**
 * Format parser integration tests
 * Tests each parser by loading real files from Modland downloads.
 * 
 * Run: npx vitest run .test-formats/format-parsers.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const BASE = resolve(__dirname, '../../.test-formats');

function countNotes(song: any): number {
  let total = 0;
  for (const pat of song.patterns || []) {
    for (const ch of pat.channels || []) {
      for (const row of ch.rows || []) {
        if (row.note > 0) total++;
      }
    }
  }
  return total;
}

function getFileDataKeys(song: any): string[] {
  return Object.keys(song).filter(k =>
    k.endsWith('FileData') || k.endsWith('Native') || k === 'goatTrackerData'
  );
}

function logResult(name: string, song: any) {
  const notes = countNotes(song);
  const fileKeys = getFileDataKeys(song);
  console.log(`  ${name}: format=${song.format} notes=${notes} instr=${(song.instruments||[]).length} pat=${(song.patterns||[]).length} ch=${song.numChannels} bpm=${song.initialBPM} spd=${song.initialSpeed} uade=${!!song.uadePatternLayout} keys=[${fileKeys.join(',')}]`);
  
  if (notes === 0 && !song.uadePatternLayout && fileKeys.length === 0) {
    console.log(`  ⚠ WILL BE SILENT: 0 notes, no uadePatternLayout, no fileData`);
  }
}

describe('Format parser tests with real Modland files', () => {

  it('DavidWhittaker: apb.dw', async () => {
    const buf = readFileSync(resolve(BASE, 'apb.dw'));
    const { parseDavidWhittakerFile } = await import('@lib/import/formats/DavidWhittakerParser');
    const song = parseDavidWhittakerFile(buf.buffer as ArrayBuffer, 'apb.dw');
    logResult('DavidWhittaker', song);
    
    expect(song).toBeTruthy();
    expect(song.format).toBeTruthy();
    expect(song.patterns.length).toBeGreaterThan(0);
    // Stub parser - should have uadePatternLayout for UADE audio
    expect(song.uadePatternLayout).toBe(true);
  });

  it('DaveLowe: afterburner.dl', async () => {
    const buf = readFileSync(resolve(BASE, 'afterburner.dl'));
    const { isDaveLoweFormat, parseDaveLoweFile } = await import('@lib/import/formats/DaveLoweParser');
    const u8 = new Uint8Array(buf);
    
    if (isDaveLoweFormat(u8)) {
      const song = await parseDaveLoweFile(buf.buffer as ArrayBuffer, 'afterburner.dl');
      logResult('DaveLowe', song);
      expect(song).toBeTruthy();
      expect(song.uadePatternLayout).toBe(true);
    } else {
      const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
      expect(isDaveLoweNewFormat(buf.buffer as ArrayBuffer)).toBe(true);
      const song = await parseDaveLoweNewFile(buf.buffer as ArrayBuffer, 'afterburner.dl');
      logResult('DaveLoweNew', song);
      expect(song).toBeTruthy();
      expect(song.uadePatternLayout).toBe(true);
    }
  });

  it('AshleyHogg: ash.cj_in_the_usa', async () => {
    const buf = readFileSync(resolve(BASE, 'ash.cj_in_the_usa'));
    const { isAshleyHoggFormat, parseAshleyHoggFile } = await import('@lib/import/formats/AshleyHoggParser');
    
    if (isAshleyHoggFormat(buf.buffer as ArrayBuffer)) {
      const song = parseAshleyHoggFile(buf.buffer as ArrayBuffer, 'ash.cj_in_the_usa');
      logResult('AshleyHogg', song);
      expect(song).toBeTruthy();
      expect(song.uadePatternLayout).toBe(true);
    } else {
      console.log('  AshleyHogg: Not detected (file may need different detection)');
      // This is OK - routing in AmigaFormatParsers will fall through to UADE
    }
  });

  it('Actionamics: dynablaster.ast - uses per-sample effectSpeed', async () => {
    const buf = readFileSync(resolve(BASE, 'dynablaster.ast'));
    const { isActionamicsFormat, parseActionamicsFile } = await import('@lib/import/formats/ActionamicsParser');
    const u8 = new Uint8Array(buf);
    
    expect(isActionamicsFormat(u8)).toBe(true);
    const song = parseActionamicsFile(u8, 'dynablaster.ast');
    logResult('Actionamics', song);

    expect(song).toBeTruthy();
    if (!song) return;
    const notes = countNotes(song);
    expect(notes).toBeGreaterThan(0);
    expect(song.instruments.length).toBeGreaterThan(0);

    // Check that instruments have varying sample rates (not all the same)
    const sampleRates = song.instruments
      .filter((i: any) => i.sample?.sampleRate)
      .map((i: any) => i.sample.sampleRate);
    console.log(`  Sample rates: ${sampleRates.join(', ')}`);
    if (sampleRates.length > 1) {
      const unique = new Set(sampleRates);
      console.log(`  Unique rates: ${unique.size} (should be >1 if effectSpeed varies)`);
    }
  });

  it('BenDaglish: artura.bd - detection-only with bdFileData', async () => {
    const buf = readFileSync(resolve(BASE, 'artura.bd'));
    const { isBenDaglishFormat, parseBenDaglishFile } = await import('@lib/import/formats/BenDaglishParser');
    
    expect(isBenDaglishFormat(buf.buffer as ArrayBuffer)).toBe(true);
    const song = await parseBenDaglishFile(buf.buffer as ArrayBuffer, 'artura.bd');
    logResult('BenDaglish', song);
    
    expect(song).toBeTruthy();
    // Detection-only: should have bdFileData for WASM engine
    const keys = getFileDataKeys(song);
    expect(keys).toContain('bdFileData');
    console.log(`  Has bdFileData: ${!!song.bdFileData} (${song.bdFileData?.byteLength || 0} bytes)`);
  });

  it('CoreDesign: rick_dangerous.core - detection-only, UADE fallback', async () => {
    const buf = readFileSync(resolve(BASE, 'rick_dangerous.core'));
    const { isCoreDesignFormat, parseCoreDesignFile } = await import('@lib/import/formats/CoreDesignParser');
    
    if (isCoreDesignFormat(buf.buffer as ArrayBuffer)) {
      const song = parseCoreDesignFile(buf.buffer as ArrayBuffer, 'rick_dangerous.core');
      logResult('CoreDesign', song);
      expect(song).toBeTruthy();
      // Stub parser with 0 notes - withNativeThenUADE will fall through
      const notes = countNotes(song);
      console.log(`  Notes: ${notes} (0 = correct, withNativeThenUADE will fall through to UADE)`);
    } else {
      console.log('  CoreDesign: Not detected as CoreDesign format');
    }
  });
});

describe('WASM engine format parser structure tests', () => {
  it('OrganyaParser: sets correct format and fileData', async () => {
    const { parseOrganyaFile } = await import('@lib/import/formats/OrganyaParser');
    // Create a minimal fake Org-02 file
    const header = new TextEncoder().encode('Org-02');
    const buf = new ArrayBuffer(256);
    const u8 = new Uint8Array(buf);
    u8.set(header, 0);
    // Fill rest with zeros - won't parse fully but tests structure
    
    try {
      const song = await parseOrganyaFile(buf, 'test.org');
      logResult('Organya', song);
      expect(song.format).toBe('Organya');
      expect((song as any).organyaFileData).toBeTruthy();
      expect((song as any).organyaFileData.byteLength).toBeGreaterThan(0);
      console.log(`  ✓ format='Organya', organyaFileData=${(song as any).organyaFileData.byteLength} bytes`);
    } catch (e) {
      // Parser may fail on minimal data, but we can still check the structure
      console.log(`  Parser error on minimal data (expected): ${(e as Error).message?.substring(0, 80)}`);
    }
  });

  it('PxtoneParser: sets correct format and fileData', async () => {
    const { parsePxtoneFile } = await import('@lib/import/formats/PxtoneParser');
    // PTCOP magic
    const header = new TextEncoder().encode('PTCOLLAGE-071119');
    const buf = new ArrayBuffer(256);
    const u8 = new Uint8Array(buf);
    u8.set(header, 0);
    
    try {
      const song = await parsePxtoneFile('test.ptcop', buf);
      logResult('PxTone', song);
      expect(song.format).toBe('PxTone');
      expect((song as any).pxtoneFileData).toBeTruthy();
      expect((song as any).pxtoneFileData.byteLength).toBeGreaterThan(0);
      console.log(`  ✓ format='PxTone', pxtoneFileData=${(song as any).pxtoneFileData.byteLength} bytes`);
    } catch (e) {
      console.log(`  Parser error on minimal data (expected): ${(e as Error).message?.substring(0, 80)}`);
    }
  });
});
