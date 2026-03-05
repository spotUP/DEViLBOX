/**
 * SNDH / YM Exporter
 * Converts captured AY/YM2149 register logs to SNDH and YM6 formats
 *
 * SNDH is the Atari ST music format — a 68000 code container with metadata tags.
 * This exporter produces a minimal SNDH with an embedded 68000 replay stub that
 * writes 14 AY registers per VBL frame at 50Hz.
 *
 * YM6 (Leonard/ST-Sound) is a simpler interleaved register dump format that is
 * more universally supported by cross-platform players.
 *
 * Both formats target AY-3-8910 / YM2149 register captures only.
 */

import { type RegisterWrite } from './VGMExporter';
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';

// Number of AY/YM2149 registers captured per frame
const AY_NUM_REGISTERS = 14;

// Samples per frame at 50Hz PAL (44100 / 50)
const SAMPLES_PER_FRAME_50HZ = 882;

// Atari ST YM master clock
const ATARI_ST_CLOCK = 2000000;

// YM player frequency (PAL 50Hz)
const PLAYER_FREQ = 50;

export interface SNDHExportOptions {
  title?: string;
  composer?: string;
  year?: string;
  loopFrame?: number; // Frame to loop back to (0 = loop from start)
}

/**
 * Check if register writes can be exported to SNDH/YM format.
 * Only AY-3-8910 / YM2149 data is supported.
 */
export function canExportSNDH(writes: RegisterWrite[]): boolean {
  return writes.some(w => w.chipType === FurnaceChipType.AY);
}

/**
 * Convert timestamped register writes into 50Hz frame snapshots.
 * Each frame is 14 bytes — the state of AY registers 0-13.
 */
function buildFrames(writes: RegisterWrite[]): Uint8Array[] {
  // Filter to AY writes only, sorted by timestamp
  const ayWrites = writes
    .filter(w => w.chipType === FurnaceChipType.AY)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (ayWrites.length === 0) return [];

  // Current register state
  const regs = new Uint8Array(AY_NUM_REGISTERS);

  // Determine total duration in frames
  const lastTimestamp = ayWrites[ayWrites.length - 1].timestamp;
  const totalFrames = Math.max(1, Math.ceil(lastTimestamp / SAMPLES_PER_FRAME_50HZ) + 1);

  const frames: Uint8Array[] = [];
  let writeIdx = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    const frameEnd = (frame + 1) * SAMPLES_PER_FRAME_50HZ;

    // Apply all writes that fall within this frame
    while (writeIdx < ayWrites.length && ayWrites[writeIdx].timestamp < frameEnd) {
      const w = ayWrites[writeIdx];
      if (w.port < AY_NUM_REGISTERS) {
        regs[w.port] = w.data & 0xFF;
      }
      writeIdx++;
    }

    frames.push(new Uint8Array(regs));
  }

  return frames;
}

/**
 * Encode a null-terminated ASCII string into a byte array
 */
function encodeString(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0x7F);
  }
  bytes.push(0); // null terminator
  return bytes;
}

/**
 * Write a big-endian uint32 into a byte array
 */
function writeBE32(arr: number[], value: number): void {
  arr.push(
    (value >>> 24) & 0xFF,
    (value >>> 16) & 0xFF,
    (value >>> 8) & 0xFF,
    value & 0xFF
  );
}

/**
 * Write a big-endian uint16 into a byte array
 */
function writeBE16(arr: number[], value: number): void {
  arr.push((value >>> 8) & 0xFF, value & 0xFF);
}

// ---------------------------------------------------------------------------
//  68000 replay stub (hand-assembled machine code)
// ---------------------------------------------------------------------------
//
//  The SNDH init/vbl/exit entry points sit immediately after HDNS.
//  init:  bra.w  _init        ; $6000 xxxx
//  vbl:   bra.w  _play        ; $6000 xxxx
//  exit:  rts                  ; $4E75
//
//  _init:
//    lea.l   frame_data(pc),a0       ; $41FA xxxx
//    lea.l   frame_ptr(pc),a1        ; $43FA xxxx
//    move.l  a0,(a1)                 ; $2288
//    rts                             ; $4E75
//
//  _play:
//    lea.l   frame_ptr(pc),a2        ; $45FA xxxx
//    movea.l (a2),a0                 ; $2052
//    lea.l   $FF8800.w,a1            ; $43F8 8800
//    moveq   #0,d0                   ; $7000
//  .loop:
//    move.b  d0,(a1)                 ; $1280
//    move.b  (a0)+,2(a1)            ; $1358 0002
//    addq.b  #1,d0                   ; $5200
//    cmpi.b  #14,d0                  ; $0C00 000E
//    bne.s   .loop                   ; $66F2
//    move.l  a0,(a2)                 ; $2488
//    lea.l   frame_end(pc),a3        ; $47FA xxxx
//    cmpa.l  (a3),a0                 ; $B1D3
//    blt.s   .done                   ; $6D08
//    lea.l   frame_data(pc),a0       ; $41FA xxxx
//    move.l  a0,(a2)                 ; $2488
//  .done:
//    rts                             ; $4E75
//
//  frame_ptr:  dc.l 0
//  frame_end:  dc.l 0               ; patched with address of end-of-data
//  frame_data: ...                   ; 14 bytes × numFrames
//
// We pre-assemble the above to a fixed-size block and patch the PC-relative
// offsets and the frame_end value at export time.

/** Build the 68000 replay stub + frame data. Returns raw bytes. */
function build68kStub(frames: Uint8Array[]): Uint8Array {
  const numFrames = frames.length;
  const frameDataLen = numFrames * AY_NUM_REGISTERS;

  // Pre-assembled machine code with placeholder offsets (0000).
  // We'll patch PC-relative displacements after computing real positions.
  //
  // Entry point table (6 bytes each for init/vbl, 2 for exit = 14 bytes total):
  //   +00  bra.w _init         6000 xxxx
  //   +04  bra.w _play         6000 xxxx
  //   +08  rts                 4E75
  //   +0A  nop (padding)       4E71
  //
  // _init (offset 0x0C):
  //   +0C  lea frame_data(pc),a0    41FA xxxx
  //   +10  lea frame_ptr(pc),a1     43FA xxxx
  //   +14  move.l a0,(a1)           2288
  //   +16  rts                      4E75
  //
  // _play (offset 0x18):
  //   +18  lea frame_ptr(pc),a2     45FA xxxx
  //   +1C  movea.l (a2),a0          2052
  //   +1E  lea $FF8800.w,a1         43F8 8800
  //   +22  moveq #0,d0              7000
  // .loop (offset 0x24):
  //   +24  move.b d0,(a1)           1280
  //   +26  move.b (a0)+,2(a1)       1358 0002
  //   +2A  addq.b #1,d0             5200
  //   +2C  cmpi.b #14,d0            0C00 000E
  //   +30  bne.s .loop              66F2
  //   +32  move.l a0,(a2)           2488
  //   +34  lea frame_end(pc),a3     47FA xxxx
  //   +38  cmpa.l (a3),a0           B1D3
  //   +3A  blt.s .done              6D08
  //   +3C  lea frame_data(pc),a0    41FA xxxx
  //   +40  move.l a0,(a2)           2488
  // .done (offset 0x42):
  //   +42  rts                      4E75
  //
  // frame_ptr (offset 0x44): dc.l 0
  // frame_end (offset 0x48): dc.l <patched>
  // frame_data (offset 0x4C): ...

  const STUB_SIZE = 0x4C; // bytes before frame_data
  const totalSize = STUB_SIZE + frameDataLen;

  const buf = new Uint8Array(totalSize);
  const v = new DataView(buf.buffer);

  // Helper: write big-endian 16-bit
  const w16 = (off: number, val: number) => v.setUint16(off, val & 0xFFFF, false);
  // Helper: write big-endian 32-bit
  const w32 = (off: number, val: number) => v.setUint32(off, val >>> 0, false);

  // --- entry points ---
  w16(0x00, 0x6000); // bra.w
  w16(0x02, 0x000A); // displacement to _init (0x0C - 0x02 = 0x0A)
  w16(0x04, 0x6000); // bra.w
  w16(0x06, 0x0012); // displacement to _play (0x18 - 0x06 = 0x12)
  w16(0x08, 0x4E75); // rts (exit)
  w16(0x0A, 0x4E71); // nop (pad)

  // --- _init ---
  const FRAME_DATA_OFF = 0x4C;
  const FRAME_PTR_OFF = 0x44;
  const FRAME_END_OFF = 0x48;

  w16(0x0C, 0x41FA); // lea frame_data(pc),a0
  w16(0x0E, FRAME_DATA_OFF - 0x0E); // PC-relative from 0x0E
  w16(0x10, 0x43FA); // lea frame_ptr(pc),a1
  w16(0x12, FRAME_PTR_OFF - 0x12); // PC-relative from 0x12
  w16(0x14, 0x2288); // move.l a0,(a1)
  w16(0x16, 0x4E75); // rts

  // --- _play ---
  w16(0x18, 0x45FA); // lea frame_ptr(pc),a2
  w16(0x1A, FRAME_PTR_OFF - 0x1A); // PC-relative from 0x1A
  w16(0x1C, 0x2052); // movea.l (a2),a0
  w16(0x1E, 0x43F8); // lea $xxxx.w,a1
  w16(0x20, 0x8800); // $FF8800 as sign-extended word
  w16(0x22, 0x7000); // moveq #0,d0

  // .loop
  w16(0x24, 0x1280); // move.b d0,(a1)
  w16(0x26, 0x1358); // move.b (a0)+,d(a1)
  w16(0x28, 0x0002); //   displacement = 2
  w16(0x2A, 0x5200); // addq.b #1,d0
  w16(0x2C, 0x0C00); // cmpi.b #xx,d0
  w16(0x2E, 0x000E); //   #14
  w16(0x30, 0x66F2); // bne.s .loop (-14 bytes → 0x24)
  w16(0x32, 0x2488); // move.l a0,(a2)

  w16(0x34, 0x47FA); // lea frame_end(pc),a3
  w16(0x36, FRAME_END_OFF - 0x36); // PC-relative from 0x36
  w16(0x38, 0xB1D3); // cmpa.l (a3),a0
  w16(0x3A, 0x6D08); // blt.s .done (+8 → 0x42... wait, let me recalc)

  // blt.s .done: from 0x3C (after reading the displacement byte at 0x3B)
  // .done is at 0x42, so displacement = 0x42 - 0x3C = 0x06
  // Actually: blt.s encoding is 6Dxx where xx is signed displacement from PC+2
  // PC after fetching instruction at 0x3A is 0x3C, target 0x42, so disp = 6
  w16(0x3A, 0x6D06); // blt.s .done

  w16(0x3C, 0x41FA); // lea frame_data(pc),a0
  w16(0x3E, FRAME_DATA_OFF - 0x3E); // PC-relative from 0x3E
  w16(0x40, 0x2488); // move.l a0,(a2)

  // .done
  w16(0x42, 0x4E75); // rts

  // --- frame_ptr ---
  w32(0x44, 0x00000000);

  // --- frame_end --- (absolute address once loaded; we store offset from stub start,
  // but since SNDH is loaded at an unknown address the init routine uses PC-relative
  // addressing. frame_end holds the absolute pointer which init could also set up.
  // However our init only sets frame_ptr. We need to also init frame_end.
  // Let's patch init to also set frame_end.)
  // Actually, a simpler fix: use a frame counter instead of pointer comparison.
  // But to keep it minimal, let's add frame_end init to _init.
  // We have room — let's redo with frame_end init in _init.

  // Easier approach: rewrite _init to also set frame_end.
  // But we already laid out fixed offsets. Let's just put the correct value
  // in frame_end at build time — since SNDH replayers load the file to a fixed
  // address and the 68k code uses PC-relative, we can compute frame_end as the
  // absolute address at runtime by adding to PC. Actually frame_end is read via
  // (a3) which loads a 32-bit value. We need it to be an absolute address.
  //
  // Better approach: patch _init to also store frame_end.
  // We have 0x0C-0x17 for init (6 words). Currently using 4 words.
  // Let's extend init and shift _play. This is getting complex.
  //
  // Simplest working approach: use a frame counter.
  // Replace the frame_end comparison with a counter approach.
  // Actually, let's just make _init also compute frame_end.
  //
  // OK, I'll redo the layout more carefully:

  // Let me restart the layout with init setting both frame_ptr and frame_end.

  return buildStubV2(frames, numFrames, frameDataLen);
}

function buildStubV2(frames: Uint8Array[], _numFrames: number, frameDataLen: number): Uint8Array {
  // Layout:
  //   +00  bra.w _init         (4 bytes)
  //   +04  bra.w _play         (4 bytes)
  //   +08  rts                 (2 bytes: exit)
  //   +0A  nop                 (2 bytes: pad to word)
  //
  // _init (+0C):
  //   lea frame_data(pc),a0        4 bytes
  //   lea frame_ptr(pc),a1         4 bytes
  //   move.l a0,(a1)               2 bytes
  //   lea frame_data_end(pc),a0    4 bytes   (points past last frame byte)
  //   lea frame_end(pc),a1         4 bytes
  //   move.l a0,(a1)               2 bytes
  //   rts                          2 bytes
  // Total _init: 22 bytes (0x0C..0x21)
  //
  // _play (+22):
  //   lea frame_ptr(pc),a2         4 bytes
  //   movea.l (a2),a0              2 bytes
  //   lea $FF8800.w,a1             4 bytes
  //   moveq #0,d0                  2 bytes
  // .loop (+2E):
  //   move.b d0,(a1)               2 bytes
  //   move.b (a0)+,2(a1)           4 bytes
  //   addq.b #1,d0                 2 bytes
  //   cmpi.b #14,d0                4 bytes
  //   bne.s .loop                  2 bytes  (-14)
  //   move.l a0,(a2)               2 bytes
  //   lea frame_end(pc),a3         4 bytes
  //   cmpa.l (a3),a0               2 bytes
  //   blt.s .done                  2 bytes
  //   lea frame_data(pc),a0        4 bytes
  //   move.l a0,(a2)               2 bytes
  // .done (+4C):
  //   rts                          2 bytes
  //
  // frame_ptr (+4E):  dc.l 0       4 bytes
  // frame_end (+52):  dc.l 0       4 bytes
  // frame_data (+56): ...

  const FRAME_PTR = 0x4E;
  const FRAME_END = 0x52;
  const FRAME_DATA = 0x56;

  const STUB_SIZE = FRAME_DATA;
  const totalSize = STUB_SIZE + frameDataLen;
  const buf = new Uint8Array(totalSize);
  const v = new DataView(buf.buffer);

  const w16 = (off: number, val: number) => v.setUint16(off, val & 0xFFFF, false);
  const w32 = (off: number, val: number) => v.setUint32(off, val >>> 0, false);

  // Entry point jumps
  w16(0x00, 0x6000); w16(0x02, 0x000A); // bra.w _init (0x0C - 0x02 = 0x0A)
  w16(0x04, 0x6000); w16(0x06, 0x001C); // bra.w _play (0x22 - 0x06 = 0x1C)
  w16(0x08, 0x4E75); // rts (exit)
  w16(0x0A, 0x4E71); // nop

  // _init at 0x0C
  w16(0x0C, 0x41FA); w16(0x0E, FRAME_DATA - 0x0E);     // lea frame_data(pc),a0
  w16(0x10, 0x43FA); w16(0x12, FRAME_PTR - 0x12);       // lea frame_ptr(pc),a1
  w16(0x14, 0x2288);                                      // move.l a0,(a1)
  const _FRAME_DATA_END = FRAME_DATA + frameDataLen;
  // lea frame_data_end(pc),a0 — points past last byte of frame data
  // But frame_data_end is beyond our buffer, so we use: lea frame_data(pc),a0 then adda
  // Simpler: store the offset to end. Since it's PC-relative:
  // At offset 0x16 we do lea (frame_data + frameDataLen)(pc),a0
  // PC at 0x18 = 0x18, target = FRAME_DATA + frameDataLen = 0x56 + frameDataLen
  // displacement = (0x56 + frameDataLen) - 0x18
  w16(0x16, 0x41FA); w16(0x18, (FRAME_DATA + frameDataLen) - 0x18); // lea frame_data_end(pc),a0
  w16(0x1A, 0x43FA); w16(0x1C, FRAME_END - 0x1C);       // lea frame_end(pc),a1
  w16(0x1E, 0x2288);                                      // move.l a0,(a1)
  w16(0x20, 0x4E75);                                      // rts

  // _play at 0x22
  w16(0x22, 0x45FA); w16(0x24, FRAME_PTR - 0x24);       // lea frame_ptr(pc),a2
  w16(0x26, 0x2052);                                      // movea.l (a2),a0
  w16(0x28, 0x43F8); w16(0x2A, 0x8800);                  // lea $FF8800.w,a1
  w16(0x2C, 0x7000);                                      // moveq #0,d0

  // .loop at 0x2E
  w16(0x2E, 0x1280);                                      // move.b d0,(a1)
  w16(0x30, 0x1358); w16(0x32, 0x0002);                  // move.b (a0)+,2(a1)
  w16(0x34, 0x5200);                                      // addq.b #1,d0
  w16(0x36, 0x0C00); w16(0x38, 0x000E);                  // cmpi.b #14,d0
  // bne.s .loop: PC at 0x3C, target 0x2E, disp = 0x2E - 0x3C = -14 = 0xF2
  w16(0x3A, 0x66F2);                                      // bne.s .loop
  w16(0x3C, 0x2488);                                      // move.l a0,(a2)
  w16(0x3E, 0x47FA); w16(0x40, FRAME_END - 0x40);       // lea frame_end(pc),a3
  w16(0x42, 0xB1D3);                                      // cmpa.l (a3),a0
  // blt.s .done: PC at 0x46, target 0x4C, disp = 0x4C - 0x46 = 6
  w16(0x44, 0x6D06);                                      // blt.s .done
  w16(0x46, 0x41FA); w16(0x48, FRAME_DATA - 0x48);      // lea frame_data(pc),a0
  w16(0x4A, 0x2488);                                      // move.l a0,(a2)

  // .done at 0x4C
  w16(0x4C, 0x4E75);                                      // rts

  // frame_ptr at 0x4E
  w32(FRAME_PTR, 0x00000000);
  // frame_end at 0x52
  w32(FRAME_END, 0x00000000);

  // frame_data at 0x56
  let offset = FRAME_DATA;
  for (const frame of frames) {
    buf.set(frame, offset);
    offset += AY_NUM_REGISTERS;
  }

  return buf;
}

/**
 * Export register writes to SNDH format.
 *
 * Produces a valid SNDH file with metadata header tags and a minimal 68000
 * replay routine that plays back YM2149 register frames at 50Hz VBL rate.
 */
export function exportToSNDH(
  writes: RegisterWrite[],
  options: SNDHExportOptions = {}
): Uint8Array {
  const frames = buildFrames(writes);
  if (frames.length === 0) {
    throw new Error('No AY/YM2149 register data to export');
  }

  const title = options.title || 'DEViLBOX Export';
  const composer = options.composer || 'Unknown';
  const year = options.year || new Date().getFullYear().toString();

  // Build SNDH header tags
  const header: number[] = [];

  // Magic
  header.push(0x53, 0x4E, 0x44, 0x48); // "SNDH"

  // TITL tag
  header.push(...encodeString('TITL' + title));

  // COMM tag
  header.push(...encodeString('COMM' + composer));

  // YEAR tag
  header.push(...encodeString('YEAR' + year));

  // Number of subsongs: "##01"
  header.push(0x23, 0x23, 0x30, 0x31); // "##01"

  // Timer tag: "!VCT" (VBL timing at 50Hz)
  header.push(0x21, 0x56, 0x43, 0x54); // "!VCT"

  // HDNS — end of header marker
  header.push(0x48, 0x44, 0x4E, 0x53); // "HDNS"

  // Pad to word boundary
  if (header.length % 2 !== 0) {
    header.push(0x00);
  }

  // Build 68000 replay stub + frame data
  const stub = build68kStub(frames);

  // Assemble final file
  const totalSize = header.length + stub.length;
  const sndh = new Uint8Array(totalSize);
  sndh.set(header, 0);
  sndh.set(stub, header.length);

  return sndh;
}

/**
 * Export register writes to YM6 format (Leonard/ST-Sound).
 *
 * YM6 is a simple interleaved register dump that is widely supported by
 * cross-platform YM players (Ay_Emul, STSound, etc.).
 *
 * Format: "YM6!" + "LeOnArD!" + header fields + metadata strings + interleaved
 * register data (all R0 values, then all R1 values, ... through R13) + "End!".
 */
export function exportToYM(
  writes: RegisterWrite[],
  options: SNDHExportOptions = {}
): Uint8Array {
  const frames = buildFrames(writes);
  if (frames.length === 0) {
    throw new Error('No AY/YM2149 register data to export');
  }

  const numFrames = frames.length;
  const loopFrame = options.loopFrame ?? 0;

  const title = options.title || 'DEViLBOX Export';
  const composer = options.composer || 'Unknown';
  const comment = 'Exported by DEViLBOX';

  // Build header
  const header: number[] = [];

  // "YM6!" identifier (4 bytes)
  header.push(0x59, 0x4D, 0x36, 0x21);

  // "LeOnArD!" check string (8 bytes)
  header.push(0x4C, 0x65, 0x4F, 0x6E, 0x41, 0x72, 0x44, 0x21);

  // Number of frames (BE uint32)
  writeBE32(header, numFrames);

  // Song attributes (BE uint32) — bit 0 = interleaved
  writeBE32(header, 0x00000001);

  // Digidrums count (BE uint16)
  writeBE16(header, 0);

  // Master clock (BE uint32)
  writeBE32(header, ATARI_ST_CLOCK);

  // Player frequency (BE uint16)
  writeBE16(header, PLAYER_FREQ);

  // Loop frame (BE uint32)
  writeBE32(header, loopFrame);

  // Additional data size (BE uint16)
  writeBE16(header, 0);

  // Null-terminated strings: title, author, comment
  header.push(...encodeString(title));
  header.push(...encodeString(composer));
  header.push(...encodeString(comment));

  // Interleaved register data: all values for R0, then R1, ..., R13
  const regData: number[] = [];
  for (let reg = 0; reg < AY_NUM_REGISTERS; reg++) {
    for (let f = 0; f < numFrames; f++) {
      regData.push(frames[f][reg]);
    }
  }

  // "End!" trailer (4 bytes)
  const trailer = [0x45, 0x6E, 0x64, 0x21]; // "End!"

  // Assemble
  const totalSize = header.length + regData.length + trailer.length;
  const ym = new Uint8Array(totalSize);
  ym.set(header, 0);
  ym.set(regData, header.length);
  ym.set(trailer, header.length + regData.length);

  return ym;
}

/**
 * High-level SNDH export — parses raw log data and returns a downloadable Blob.
 */
export async function exportSNDH(
  logData: Uint8Array,
  options: SNDHExportOptions = {}
): Promise<Blob> {
  // Re-use VGMExporter's parseRegisterLog
  const { parseRegisterLog } = await import('./VGMExporter');
  const writes = parseRegisterLog(logData);
  const sndhData = exportToSNDH(writes, options);
  return new Blob([sndhData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

/**
 * High-level YM export — parses raw log data and returns a downloadable Blob.
 */
export async function exportYM(
  logData: Uint8Array,
  options: SNDHExportOptions = {}
): Promise<Blob> {
  const { parseRegisterLog } = await import('./VGMExporter');
  const writes = parseRegisterLog(logData);
  const ymData = exportToYM(writes, options);
  return new Blob([ymData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}
