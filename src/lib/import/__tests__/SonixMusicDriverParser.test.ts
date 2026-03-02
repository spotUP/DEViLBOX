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
