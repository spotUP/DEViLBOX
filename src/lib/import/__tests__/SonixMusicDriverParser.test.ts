/**
 * SonixMusicDriverParser Tests — Sonix Music Driver (SNX/TINY/SMUS) detection and parsing
 *
 * Three sub-formats:
 *   smus: first 4 bytes = 'FORM' + SNX1/INS1/TRAK IFF structure
 *   tiny: first word & 0x00F0 != 0  (external .instr files required)
 *   snx:  first word & 0x00F0 == 0  (binary event streams, 4 voices)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  detectSonixFormat,
  isSonixFormat,
  parseSonixFile,
} from '../formats/SonixMusicDriverParser';
import { analyzeFormat, formatReportToString } from './formatAnalysis';

// ── Reference Music paths ──────────────────────────────────────────────────

const REF    = resolve(import.meta.dirname, '../../../../Reference Music');
const SMUS_FILE = resolve(REF, 'IFF-SMUS/- unknown/yessonix/yessonix.smus');

function loadBuf(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

// ── Synthetic buffer builders ──────────────────────────────────────────────

/** Build a minimal valid SMUS (IFF SMUS/SNX) detection buffer. */
function makeSmusBuffer(): ArrayBuffer {
  const buf = new Uint8Array(300).fill(0);
  // 'FORM' at 0
  buf[0] = 0x46; buf[1] = 0x4f; buf[2] = 0x52; buf[3] = 0x4d;
  // FORM size at 4 (ignored by detector)
  buf[4] = 0x00; buf[5] = 0x00; buf[6] = 0x01; buf[7] = 0x00;
  // 'SMUS' at 8
  buf[8] = 0x53; buf[9] = 0x4d; buf[10] = 0x55; buf[11] = 0x53;
  // byte 23 must be non-zero
  buf[23] = 0x01;
  // 'NAME' chunk at 24
  buf[24] = 0x4e; buf[25] = 0x41; buf[26] = 0x4d; buf[27] = 0x45;
  buf[28] = 0x00; buf[29] = 0x00; buf[30] = 0x00; buf[31] = 0x02; // NAME size = 2
  // 'SNX1' at 34 (24+8+2)
  buf[34] = 0x53; buf[35] = 0x4e; buf[36] = 0x58; buf[37] = 0x31;
  buf[38] = 0x00; buf[39] = 0x00; buf[40] = 0x00; buf[41] = 0x02; // SNX1 size = 2
  // 'TRAK' at 44 (34+8+2) — no INS1 chunks → detection succeeds
  buf[44] = 0x54; buf[45] = 0x52; buf[46] = 0x41; buf[47] = 0x4b;
  return buf.buffer;
}

/**
 * Build a minimal valid SNX binary buffer with one note on voice 0.
 *
 * Layout: 4 × u32BE lengths | skip 4 bytes | 4 voice event streams | sentinel
 *   length[0]=6, lengths[1-3]=2 → total voice bytes = 12
 *   Voice 0: instrument change (0x8001) + note on (0x2040) + end (0xFFFF)
 *   Voices 1-3: end immediately (0xFFFF)
 *   Byte 32: 0x01 (non-zero sentinel after all voices)
 */
function makeSnxBuffer(): ArrayBuffer {
  const buf = new Uint8Array(33).fill(0);
  // Section lengths (u32BE): voice0=6, voices1-3=2
  buf[3] = 6;  // length[0] = 6
  buf[7] = 2;  // length[1] = 2
  buf[11] = 2; // length[2] = 2
  buf[15] = 2; // length[3] = 2
  // Speed = 6 (bytes 16-17); loop count = 1 (bytes 18-19)
  buf[17] = 6;
  buf[19] = 1;
  // Voice 0: instrument change → note on → end
  buf[20] = 0x80; buf[21] = 0x01; // 0x8001: set instrument register 1 → instrument index 2
  buf[22] = 0x20; buf[23] = 0x40; // 0x2040: note 32, volume 64
  buf[24] = 0xFF; buf[25] = 0xFF; // end of voice 0
  // Voices 1-3: end immediately
  buf[26] = 0xFF; buf[27] = 0xFF;
  buf[28] = 0xFF; buf[29] = 0xFF;
  buf[30] = 0xFF; buf[31] = 0xFF;
  // Sentinel byte after all voices (required by isSnxFormat)
  buf[32] = 0x01;
  return buf.buffer;
}

/**
 * Build a minimal valid TINY binary buffer.
 *
 * Requirements:
 *   firstWord & 0x00F0 != 0  (buf[1] = 0x10)
 *   fileSize > 332
 *   u32BE at offset 48 == 0x140
 *   3 pointers at bytes 52-63, each pointing to a 0xFFFF word within the buffer
 */
function makeTinyBuffer(): ArrayBuffer {
  const buf = new Uint8Array(400).fill(0);
  // First word & 0x00F0 != 0: set bit4 of low byte of first word
  buf[0] = 0x00; buf[1] = 0x10; // firstWord = 0x0010; 0x0010 & 0x00F0 = 0x0010 ≠ 0
  // Marker at offset 48 = 0x00000140
  buf[48] = 0x00; buf[49] = 0x00; buf[50] = 0x01; buf[51] = 0x40;
  // Pointer 1 at bytes 52-55 → offset 384 in buffer
  buf[52] = 0x00; buf[53] = 0x00; buf[54] = 0x01; buf[55] = 0x80; // 0x180 = 384
  buf[384] = 0xFF; buf[385] = 0xFF; // 0xFFFF → OK2
  // Pointer 2 at bytes 56-59 → offset 386
  buf[56] = 0x00; buf[57] = 0x00; buf[58] = 0x01; buf[59] = 0x82; // 0x182 = 386
  buf[386] = 0xFF; buf[387] = 0xFF;
  // Pointer 3 at bytes 60-63 → offset 388
  buf[60] = 0x00; buf[61] = 0x00; buf[62] = 0x01; buf[63] = 0x84; // 0x184 = 388
  buf[388] = 0xFF; buf[389] = 0xFF;
  return buf.buffer;
}

// ── detectSonixFormat ──────────────────────────────────────────────────────

describe('detectSonixFormat', () => {
  it('detects SMUS sub-format from synthetic buffer', () => {
    expect(detectSonixFormat(makeSmusBuffer())).toBe('smus');
  });

  it('detects SNX sub-format from synthetic buffer', () => {
    expect(detectSonixFormat(makeSnxBuffer())).toBe('snx');
  });

  it('detects TINY sub-format from synthetic buffer', () => {
    expect(detectSonixFormat(makeTinyBuffer())).toBe('tiny');
  });

  it('returns null for zeroed buffer', () => {
    expect(detectSonixFormat(new ArrayBuffer(300))).toBeNull();
  });

  it('returns null for too-small buffer', () => {
    expect(detectSonixFormat(new ArrayBuffer(4))).toBeNull();
  });
});

// ── isSonixFormat ──────────────────────────────────────────────────────────

describe('isSonixFormat', () => {
  it('returns true for SMUS buffer', () => {
    expect(isSonixFormat(makeSmusBuffer())).toBe(true);
  });

  it('returns true for SNX buffer', () => {
    expect(isSonixFormat(makeSnxBuffer())).toBe(true);
  });

  it('returns true for TINY buffer', () => {
    expect(isSonixFormat(makeTinyBuffer())).toBe(true);
  });

  it('returns false for random buffer', () => {
    const buf = new Uint8Array(64).fill(0xaa);
    buf[0] = 0x00; // ensure no 'FORM' magic
    expect(isSonixFormat(buf)).toBe(false);
  });
});

// ── parseSonixFile — SNX synthetic ────────────────────────────────────────

describe('parseSonixFile — SNX synthetic', () => {
  it('parses without throwing', async () => {
    await expect(
      parseSonixFile(makeSnxBuffer(), 'snx.test'),
    ).resolves.toBeDefined();
  });

  it('produces a 4-channel song', async () => {
    const song = await parseSonixFile(makeSnxBuffer(), 'snx.test');
    expect(song.numChannels).toBe(4);
    expect(song.patterns[0].channels.length).toBe(4);
  });

  it('includes [SNX] in the name', async () => {
    const song = await parseSonixFile(makeSnxBuffer(), 'snx.test');
    expect(song.name).toContain('[SNX]');
  });

  it('populates note 32 on channel 0', async () => {
    const song = await parseSonixFile(makeSnxBuffer(), 'snx.test');
    const row0 = song.patterns[0].channels[0].rows[0];
    expect(row0.note).toBe(32);
    expect(row0.instrument).toBe(2); // register 1 → 1-based index 2
  });

  it('sets Amiga hard pan on channels', async () => {
    const song = await parseSonixFile(makeSnxBuffer(), 'snx.test');
    const { channels } = song.patterns[0];
    // Paula LRRL: ch0=L(-50), ch1=R(50), ch2=R(50), ch3=L(-50)
    expect(channels[0].pan).toBe(-50);
    expect(channels[1].pan).toBe(50);
    expect(channels[2].pan).toBe(50);
    expect(channels[3].pan).toBe(-50);
  });
});

// ── parseSonixFile — TINY throws ──────────────────────────────────────────

describe('parseSonixFile — TINY', () => {
  it('throws because external instrument files are required', async () => {
    await expect(
      parseSonixFile(makeTinyBuffer(), 'tiny.test'),
    ).rejects.toThrow(/external instrument files/i);
  });
});

// ── parseSonixFile — real SMUS file ──────────────────────────────────────

describe('parseSonixFile — yessonix.smus', () => {
  it('detects as smus sub-format', () => {
    const buf = loadBuf(SMUS_FILE);
    expect(detectSonixFormat(buf)).toBe('smus');
  });

  it('parses without throwing', async () => {
    await expect(
      parseSonixFile(loadBuf(SMUS_FILE), 'yessonix.smus'),
    ).resolves.toBeDefined();
  });

  it('reports format capabilities', async () => {
    const song = await parseSonixFile(loadBuf(SMUS_FILE), 'yessonix.smus');
    const report = analyzeFormat(song, 'yessonix.smus');
    console.log('\n' + formatReportToString(report));
    expect(typeof report.format).toBe('string');
    expect(report.numChannels).toBeGreaterThan(0);
  });
});

// ── Companion file pipeline — yessonix folder ─────────────────────────────

describe('companion file pipeline — yessonix folder', () => {
  const YESSONIX_DIR = resolve(REF, 'IFF-SMUS/- unknown/yessonix');
  const INSTRUMENTS_DIR = resolve(YESSONIX_DIR, 'Instruments');

  // Read all files from the folder (simulates what GlobalDragDropHandler does)
  function enumerateFolder(): { mainFile: string; companions: string[] } {
    const fs = require('fs');
    const path = require('path');
    const allFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name));
        else allFiles.push(path.join(dir, entry.name));
      }
    }
    walk(YESSONIX_DIR);

    // GlobalDragDropHandler logic: find main module via isSupportedModule
    const mainFile = allFiles.find(f => f.endsWith('.smus'));
    const companions = allFiles.filter(f => f !== mainFile);
    return { mainFile: mainFile!, companions };
  }

  it('identifies yessonix.smus as the main module', () => {
    const { mainFile } = enumerateFolder();
    expect(mainFile).toBeDefined();
    expect(mainFile).toContain('yessonix.smus');
  });

  it('collects 9 companion instrument files', () => {
    const { companions } = enumerateFolder();
    expect(companions).toHaveLength(9);
    const names = companions.map(f => f.split('/').pop()!).sort();
    expect(names).toEqual([
      'yes1.instr', 'yes1.ss', 'yes2.instr', 'yes2.ss', 'yes2end.instr',
      'yesdrumintro.instr', 'yesdrumintro.ss', 'yesguitar.instr', 'yesguitar2.instr',
    ]);
  });

  it('companion files are all readable as ArrayBuffers', () => {
    const { companions } = enumerateFolder();
    for (const path of companions) {
      const buf = loadBuf(path);
      expect(buf.byteLength).toBeGreaterThan(0);
    }
  });

  it('.instr files are valid Sonix instrument definitions', () => {
    const { companions } = enumerateFolder();
    const instrFiles = companions.filter(f => f.endsWith('.instr'));
    expect(instrFiles.length).toBe(6);
    // Sonix .instr files come in two forms:
    //   - SampledSound: starts with 'Samp' header (e.g. yes1.instr, yesdrumintro.instr)
    //   - Synthesis definition: starts with zeros (e.g. yesguitar.instr)
    const sampledCount = instrFiles.filter(path => {
      const u8 = new Uint8Array(loadBuf(path));
      return u8[0] === 0x53 && u8[1] === 0x61; // 'Sa'
    }).length;
    expect(sampledCount).toBeGreaterThan(0);
    expect(sampledCount).toBeLessThan(instrFiles.length); // mix of both types
  });

  it('.ss sample files are non-trivial in size', () => {
    const { companions } = enumerateFolder();
    const ssFiles = companions.filter(f => f.endsWith('.ss'));
    expect(ssFiles.length).toBeGreaterThan(0);
    for (const path of ssFiles) {
      const buf = loadBuf(path);
      // .ss files contain raw 8-bit PCM sample data — should be > 1KB
      expect(buf.byteLength).toBeGreaterThan(1024);
    }
  });

  it('native parser creates placeholder instruments referencing companion names', async () => {
    const buf = loadBuf(SMUS_FILE);
    const song = await parseSonixFile(buf, 'yessonix.smus');
    // IffSmusParser creates Sampler placeholders for each INS1 chunk.
    // The instrument names should match the external .instr filenames.
    expect(song.instruments.length).toBeGreaterThan(0);
    const instNames = song.instruments.map(i => i.name.toLowerCase());
    // At least some instrument names should reference the companion file basenames
    const companionBases = [
      'yes1', 'yes2', 'yes2end', 'yesdrumintro', 'yesguitar', 'yesguitar2',
    ];
    const matchCount = companionBases.filter(base =>
      instNames.some(name => name.includes(base))
    ).length;
    // At least some instruments should reference known companion basenames
    expect(matchCount).toBeGreaterThan(0);
  });

  it('native parser produces a multi-channel song with notes', async () => {
    const buf = loadBuf(SMUS_FILE);
    const song = await parseSonixFile(buf, 'yessonix.smus');
    expect(song.numChannels).toBeGreaterThanOrEqual(2);
    expect(song.patterns.length).toBeGreaterThan(0);
    // Verify at least some rows have actual note data (not all empty)
    let noteCount = 0;
    for (const pat of song.patterns) {
      for (const ch of pat.channels) {
        for (const row of ch.rows) {
          if (row.note > 0) noteCount++;
        }
      }
    }
    expect(noteCount).toBeGreaterThan(0);
  });
});
