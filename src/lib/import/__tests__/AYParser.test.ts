/**
 * AYParser: the ZXAY EMUL layout, on a synthetic file and on the corpus.
 *
 * Until 2026-10-04 the parser read the song data at the wrong offsets, so
 * the Z80 never ran and `spring.emul` showed an empty grid (ledger F15).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isAYFormat, parseAYFile } from '../formats/AYParser';
import { installAyletNodeFetch } from './helpers/ayletNodeFetch';

const SPRING = resolve(__dirname, '../../../../public/data/songs/ay-emul/spring.emul');
const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

function makeAYHeader(): ArrayBuffer {
  const buf = new Uint8Array(64);
  const magic = new TextEncoder().encode('ZXAYEMUL');
  buf.set(magic, 0);
  buf[8]  = 0; // FileVersion
  buf[16] = 0; // 1 song (N-1)
  return buf.buffer;
}

describe('AYParser', () => {
  let restore: () => void;
  beforeAll(() => { restore = installAyletNodeFetch(); });
  afterAll(() => restore());

  it('detects AY by magic', () => {
    expect(isAYFormat(makeAYHeader())).toBe(true);
  });

  it('rejects non-AY data', () => {
    const buf = new Uint8Array(16);
    expect(isAYFormat(buf.buffer)).toBe(false);
  });

  it('parses and returns aylet instruments', async () => {
    const song = await parseAYFile(makeAYHeader(), 'test.ay');
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments[0].synthType).toBe('AyletSynth');
    expect(song.numChannels).toBe(3);
  });

  it('spring.emul: the grid carries notes and the song carries the file for aylet', async () => {
    const bytes = readFileSync(SPRING);
    const song = await parseAYFile(toArrayBuffer(bytes), 'spring.emul');
    expect(song.name).toContain('Spring');
    expect(song.ayFileData?.byteLength).toBe(bytes.length);
    const noteCells = song.patterns[0].channels.reduce(
      (n, ch) => n + ch.rows.filter((c) => c.note > 0 && c.note < 97).length, 0);
    expect(noteCells).toBeGreaterThan(0);
  });

  /**
   * Synthetic ZXAYEMUL emulation test.
   *
   * Constructs a minimal but valid AY file with:
   *   - A Z80 init routine that does nothing (just RET)
   *   - A Z80 interrupt/play routine that:
   *       1. Selects AY register 0 via OUT (C),A with BC=$FFFD, A=0
   *       2. Writes tone A period low byte via OUT (C),A with BC=$BFFD, A=$D5
   *       3. Selects AY register 1 via OUT (C),A with BC=$FFFD, A=1
   *       4. Writes tone A period high byte via OUT (C),A with BC=$BFFD, A=$00
   *       5. Selects AY register 7 (mixer) and writes 0xF8 (all tones enabled)
   *       6. Selects AY register 8 (amplitude A) and writes 0x0C (volume 12)
   *       7. RET
   *
   * The period 0x00D5 = 213 decimal.
   * ZX Spectrum AY clock = 1773400 Hz.
   * freq = 1773400 / (16 * 213) ≈ 520.6 Hz → MIDI note ≈ 72 (C5).
   *
   * The test verifies that:
   *   - The parser does not crash
   *   - The resulting song has 3 channels
   *   - At least one cell in channel 0 has a non-zero note (emulation produced data)
   */
  it('extracts non-zero note from emulated AY register writes', async () => {
    // ── Build the Z80 code ──────────────────────────────────────────────────
    //
    // We'll place code at Z80 address $8000.
    // init routine at $8000: just RET (0xC9)
    // play routine at $8001:
    //   LD BC, $FFFD    ; 01 FD FF
    //   LD A, 0         ; 3E 00      (select reg 0)
    //   OUT (C), A      ; ED 79
    //   LD BC, $BFFD    ; 01 FD BF
    //   LD A, $D5       ; 3E D5      (period lo = 0xD5 = 213)
    //   OUT (C), A      ; ED 79
    //   LD BC, $FFFD    ; 01 FD FF
    //   LD A, 1         ; 3E 01      (select reg 1)
    //   OUT (C), A      ; ED 79
    //   LD BC, $BFFD    ; 01 FD BF
    //   LD A, 0         ; 3E 00      (period hi = 0)
    //   OUT (C), A      ; ED 79
    //   LD BC, $FFFD    ; 01 FD FF
    //   LD A, 7         ; 3E 07      (select reg 7 = mixer)
    //   OUT (C), A      ; ED 79
    //   LD BC, $BFFD    ; 01 FD BF
    //   LD A, $F8       ; 3E F8      (mixer: enable tone A only, disable noise)
    //   OUT (C), A      ; ED 79
    //   LD BC, $FFFD    ; 01 FD FF
    //   LD A, 8         ; 3E 08      (select reg 8 = amplitude A)
    //   OUT (C), A      ; ED 79
    //   LD BC, $BFFD    ; 01 FD BF
    //   LD A, $0C       ; 3E 0C      (volume = 12)
    //   OUT (C), A      ; ED 79
    //   RET             ; C9
    //
    // Assembled:
    const playCode = new Uint8Array([
      0x01, 0xFD, 0xFF,  // LD BC, $FFFD
      0x3E, 0x00,        // LD A, 0
      0xED, 0x79,        // OUT (C), A   → select reg 0
      0x01, 0xFD, 0xBF,  // LD BC, $BFFD
      0x3E, 0xD5,        // LD A, $D5
      0xED, 0x79,        // OUT (C), A   → write period lo
      0x01, 0xFD, 0xFF,  // LD BC, $FFFD
      0x3E, 0x01,        // LD A, 1
      0xED, 0x79,        // OUT (C), A   → select reg 1
      0x01, 0xFD, 0xBF,  // LD BC, $BFFD
      0x3E, 0x00,        // LD A, 0
      0xED, 0x79,        // OUT (C), A   → write period hi
      0x01, 0xFD, 0xFF,  // LD BC, $FFFD
      0x3E, 0x07,        // LD A, 7
      0xED, 0x79,        // OUT (C), A   → select reg 7 (mixer)
      0x01, 0xFD, 0xBF,  // LD BC, $BFFD
      0x3E, 0xF8,        // LD A, $F8    (bits 0-2 = 0 → tone A/B/C enabled; bits 3-5 = 1 → noise off)
      0xED, 0x79,        // OUT (C), A   → write mixer
      0x01, 0xFD, 0xFF,  // LD BC, $FFFD
      0x3E, 0x08,        // LD A, 8
      0xED, 0x79,        // OUT (C), A   → select reg 8 (amplitude A)
      0x01, 0xFD, 0xBF,  // LD BC, $BFFD
      0x3E, 0x0C,        // LD A, $0C    (volume = 12)
      0xED, 0x79,        // OUT (C), A   → write amplitude A
      0xC9,              // RET
    ]);

    // ── Build the AY file buffer ────────────────────────────────────────────
    //
    // Layout:
    //   [0-7]   "ZXAYEMUL"
    //   [8]     0 (AY type)
    //   [9]     1 (file version)
    //   [10-11] 0x0000 (special player pointer, unused)
    //   [12-13] 0x0000 (unused)
    //   [14-15] 0x0000 (author ptr = 0 → no author)
    //   [16-17] 0x0000 (misc ptr = 0 → no misc)
    //   [18]    0 (1 song)
    //   [19]    0 (first song index)
    //   [20-23] Song descriptor for song 0:
    //             [20-21] i16 BE name ptr  (0 → no name)
    //             [22-23] i16 BE data ptr  (relative to offset 22)
    //
    // The song data block will immediately follow the descriptor, so:
    //   dataRel at offset 22 = 24 - 22 = 2 → points to offset 24
    //
    //   [24-33] Song data block:
    //             [24-25] 0x0000 (unused / channel flags)
    //             [26-27] u16 BE init address  = 0x8000
    //             [28-29] u16 BE intr address  = 0x8001
    //             [30-31] u16 BE stack ptr     = 0xF000
    //             [32-33] u16 BE extra reg     = 0x0000
    //   [34-37] Memory block descriptor:
    //             [34-35] u16 BE target addr   = 0x8000
    //             [36-37] u16 BE data length   = playCode.length + 1 (init RET + play code)
    //   [38]    RET (0xC9) for init routine at 0x8000
    //   [39+]   play routine code (placed at 0x8001)
    //   [38 + 1 + playCode.length]
    //             [0-1] u16 BE = 0x0000  terminator addr
    //             [2-3] u16 BE = 0x0000  terminator len

    // Project AY layout (see AYParser.ts). Pointers are relative to their own
    // position. Offsets:
    //   20 SongStructure[0]: PSongName=0, PSongData -> 24
    //   24 SongData: chans, SongLength, FadeLength, HiReg, LoReg, PPoints -> 38, PAddresses -> 44
    //   38 Points: Stack F000, Init 8000, Interrupt 8001
    //   44 Addresses: { 8000, len, POffset -> 56 }, terminator 0000
    //   56 code: init RET at $8000, play routine at $8001
    const codeBlockLen = 1 + playCode.length;
    const totalSize = 56 + codeBlockLen;
    const ayBuf = new Uint8Array(totalSize);
    const dv    = new DataView(ayBuf.buffer);
    ayBuf.set(new TextEncoder().encode('ZXAYEMUL'), 0);
    ayBuf[8]  = 0; ayBuf[9] = 1;          // FileVersion, PlayerVersion
    ayBuf[16] = 0; ayBuf[17] = 0;         // 1 song, first song 0
    dv.setInt16(18, 2, false);            // PSongsStructure -> 20
    dv.setInt16(20, 0, false);            // PSongName: none
    dv.setInt16(22, 2, false);            // PSongData -> 24
    ayBuf[24] = 0; ayBuf[25] = 1; ayBuf[26] = 2; ayBuf[27] = 3;
    dv.setUint16(28, 0, false);           // SongLength
    dv.setUint16(30, 0, false);           // FadeLength
    ayBuf[32] = 0; ayBuf[33] = 0;         // HiReg, LoReg
    dv.setInt16(34, 38 - 34, false);      // PPoints -> 38
    dv.setInt16(36, 44 - 36, false);      // PAddresses -> 44
    dv.setUint16(38, 0xF000, false);      // Stack
    dv.setUint16(40, 0x8000, false);      // Init
    dv.setUint16(42, 0x8001, false);      // Interrupt
    dv.setUint16(44, 0x8000, false);      // Address
    dv.setUint16(46, codeBlockLen, false);// Length
    dv.setInt16(48, 56 - 48, false);      // POffset -> 56
    dv.setUint16(50, 0x0000, false);      // terminator
    ayBuf[56] = 0xC9;                     // RET - init routine at $8000
    ayBuf.set(playCode, 57);              // play routine at $8001

    // ── Run the parser ─────────────────────────────────────────────────────
    const song = await parseAYFile(ayBuf.buffer, 'test.ay');

    expect(song.numChannels).toBe(3);
    expect(song.patterns).toHaveLength(1);

    const pat = song.patterns[0];
    expect(pat.channels).toHaveLength(3);

    // Channel A (index 0) should contain at least one non-zero note
    const chA = pat.channels[0];
    const hasNote = chA.rows.some(cell => cell.note > 0 && cell.note < 97);
    expect(hasNote).toBe(true);

    // Channel A should have at least one note approximately equal to MIDI 72 (C5) ±2
    // Period 213 → freq ≈ 520.6 Hz → MIDI ≈ 72
    const hasC5 = chA.rows.some(cell => cell.note >= 70 && cell.note <= 74);
    expect(hasC5).toBe(true);

    // Channels B (index 1) and C (index 2) should have NO pitched notes,
    // since only channel A registers are written by the play routine.
    const chB = pat.channels[1];
    const chC = pat.channels[2];
    const chBHasNote = chB.rows.some(cell => cell.note > 0 && cell.note < 97);
    const chCHasNote = chC.rows.some(cell => cell.note > 0 && cell.note < 97);
    expect(chBHasNote).toBe(false);
    expect(chCHasNote).toBe(false);
  });
});
