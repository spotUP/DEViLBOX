/**
 * SPC (SNES SPC700) Exporter
 * Converts captured register logs to SPC format
 *
 * SPC is the SNES audio format - a complete memory dump of the SPC700 coprocessor:
 * - 64KB audio RAM
 * - 128 DSP registers
 * - SPC700 CPU state
 *
 * This exporter creates a minimal SPC file with an embedded playback driver
 * that replays captured DSP register writes at the correct timing.
 *
 * Note: This is more experimental than VGM/NSF exporters since SPC files
 * are typically memory dumps rather than generated from scratch.
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from './VGMExporter';

// SPC Header structure
const SPC_HEADER_SIZE = 256;
const SPC_MAGIC = 'SNES-SPC700 Sound File Data v0.30';

// SPC700 memory addresses
const SPC_RAM_SIZE = 0x10000; // 64KB
const SPC_DSP_REGS = 128;

// DSP register addresses
const DSP = {
  // Voice registers (8 voices, 16 bytes each at 0x00-0x7F)
  // Per voice: VOL_L, VOL_R, PITCH_L, PITCH_H, SRCN, ADSR1, ADSR2, GAIN, ENVX, OUTX
  MVOL_L: 0x0C,  // Main volume left
  MVOL_R: 0x1C,  // Main volume right
  EVOL_L: 0x2C,  // Echo volume left
  EVOL_R: 0x3C,  // Echo volume right
  KON: 0x4C,     // Key on
  KOF: 0x5C,     // Key off
  FLG: 0x6C,     // Flags (noise, echo, mute, reset)
  ENDX: 0x7C,    // Voice end flags
  EFB: 0x0D,     // Echo feedback
  PMON: 0x2D,    // Pitch modulation
  NON: 0x3D,     // Noise enable
  EON: 0x4D,     // Echo enable
  DIR: 0x5D,     // Sample directory address (/256)
  ESA: 0x6D,     // Echo buffer address (/256)
  EDL: 0x7D,     // Echo delay
  FIR: 0x0F,     // FIR filter coefficients (8 bytes at 0xXF)
} as const;

// Frame rate (~60Hz NTSC)
const FRAME_RATE = 60;
const SAMPLES_PER_FRAME = 32000 / FRAME_RATE; // SNES uses 32kHz

export interface SPCExportOptions {
  title?: string;
  artist?: string;
  game?: string;
  dumper?: string;
  comments?: string;
  dumpDate?: string;
  fadeLength?: number;   // Fade out length in ms
  songLength?: number;   // Song length in seconds (before fade)
}

/**
 * Check if the register log can be exported to SPC format
 * SPC only supports SNES DSP
 */
export function canExportSPC(writes: RegisterWrite[]): boolean {
  return writes.some(w => w.chipType === FurnaceChipType.SNES);
}

/**
 * Create a minimal SPC700 driver for register log playback
 *
 * The driver is loaded at $0200 in SPC RAM.
 * Register data follows the driver code.
 *
 * Data format per frame:
 * - 0x00 = end of frame (wait for next timer tick)
 * - 0xFF = end of song (loop or stop)
 * - Otherwise: DSP register, value
 */
function createSPC700Driver(): {
  code: number[];
  entryPoint: number;
} {
  const entryPoint = 0x0200;

  // SPC700 assembly for register log playback
  // This is a minimal driver that reads (register, value) pairs
  // and writes them to the DSP via ports $F2/$F3
  const code = [
    // Initialize timer 0 for ~60Hz (256 / 128 * 8MHz = 62.5Hz)
    // MOVW YA, #data_start (to be patched)
    0xBA, 0x00, 0x00,  // MOVW YA, $0000
    // MOVW $00, YA     ; Store data pointer at $00-$01
    0xDA, 0x00,

    // Set up timer
    // MOV $FA, #$00    ; Disable timers
    0x8F, 0x00, 0xFA,
    // MOV $F1, #$30    ; Clear ports, enable ROM
    0x8F, 0x30, 0xF1,
    // MOV $FD, #$00    ; Clear timer 0 output
    0xE4, 0xFD,
    // MOV $FA, #$80    ; Timer 0 divider (128 = ~62.5Hz)
    0x8F, 0x80, 0xFA,
    // MOV $F1, #$01    ; Enable timer 0
    0x8F, 0x01, 0xF1,

    // Main loop:
    // wait_timer:
    // MOV A, $FD       ; Read timer 0 output
    0xE4, 0xFD,
    // BEQ wait_timer   ; Wait for tick
    0xF0, 0xFC,        // relative jump -4

    // process_frame:
    // MOV Y, #$00
    0x8D, 0x00,

    // read_loop:
    // MOV A, ($00)+Y   ; Read command byte
    0xF7, 0x00,
    // BEQ frame_done   ; 0x00 = end of frame
    0xF0, 0x12,
    // CMP A, #$FF      ; Check for end marker
    0x68, 0xFF,
    // BEQ song_done
    0xF0, 0x16,

    // Write to DSP
    // MOV $F2, A       ; DSP register address
    0xC4, 0xF2,
    // INC Y
    0xFC,
    // MOV A, ($00)+Y   ; Read value
    0xF7, 0x00,
    // MOV $F3, A       ; DSP register data
    0xC4, 0xF3,
    // INC Y
    0xFC,
    // BRA read_loop
    0x2F, 0xED,        // relative jump back

    // frame_done:
    // INC Y
    0xFC,
    // ; Advance data pointer
    // CLRC
    0x60,
    // ADC A, $00
    0x84, 0x00,
    // MOV $00, A
    0xC4, 0x00,
    // MOV A, $01
    0xE4, 0x01,
    // ADC A, #$00
    0x88, 0x00,
    // MOV $01, A
    0xC4, 0x01,
    // BRA wait_timer   ; Back to main loop
    0x2F, 0xD2,

    // song_done:
    // ; Could loop here or stop
    // BRA song_done    ; Infinite loop (silent)
    0x2F, 0xFE,
  ];

  return { code, entryPoint };
}

/**
 * Convert register writes to SPC data format
 */
function encodeRegisterData(writes: RegisterWrite[]): number[] {
  const data: number[] = [];

  // Filter to only SNES DSP writes
  const filteredWrites = writes.filter(w => w.chipType === FurnaceChipType.SNES);

  if (filteredWrites.length === 0) {
    data.push(0xFF); // End of song marker
    return data;
  }

  // Sort by timestamp
  const sortedWrites = [...filteredWrites].sort((a, b) => a.timestamp - b.timestamp);

  let currentFrame = 0;

  for (const write of sortedWrites) {
    // Calculate which frame this write belongs to
    const writeFrame = Math.floor(write.timestamp / SAMPLES_PER_FRAME);

    // Emit end-of-frame markers for any gap
    while (currentFrame < writeFrame) {
      data.push(0x00); // End of frame
      currentFrame++;
    }

    // DSP register (0-127)
    const reg = write.port & 0x7F;

    // Emit register write: register, value
    data.push(reg, write.data);
  }

  // Final frame marker
  data.push(0x00);
  // End of song marker
  data.push(0xFF);

  return data;
}

/**
 * Create ID666 tag (metadata in SPC header)
 */
function createID666Tag(options: SPCExportOptions): Uint8Array {
  const tag = new Uint8Array(210); // ID666 is stored at offset 0x2E in header

  // Song title (32 bytes)
  const title = options.title || 'DEViLBOX Export';
  for (let i = 0; i < Math.min(title.length, 32); i++) {
    tag[i] = title.charCodeAt(i);
  }

  // Game title (32 bytes, offset 0x20)
  const game = options.game || '';
  for (let i = 0; i < Math.min(game.length, 32); i++) {
    tag[0x20 + i] = game.charCodeAt(i);
  }

  // Dumper name (16 bytes, offset 0x40)
  const dumper = options.dumper || 'DEViLBOX';
  for (let i = 0; i < Math.min(dumper.length, 16); i++) {
    tag[0x40 + i] = dumper.charCodeAt(i);
  }

  // Comments (32 bytes, offset 0x50)
  const comments = options.comments || '';
  for (let i = 0; i < Math.min(comments.length, 32); i++) {
    tag[0x50 + i] = comments.charCodeAt(i);
  }

  // Date (11 bytes, offset 0x70, format MM/DD/YYYY)
  const date = options.dumpDate || new Date().toLocaleDateString('en-US');
  for (let i = 0; i < Math.min(date.length, 11); i++) {
    tag[0x70 + i] = date.charCodeAt(i);
  }

  // Song length (3 bytes, offset 0x7B, in seconds as ASCII)
  const length = (options.songLength || 180).toString();
  for (let i = 0; i < Math.min(length.length, 3); i++) {
    tag[0x7B + i] = length.charCodeAt(i);
  }

  // Fade length (5 bytes, offset 0x7E, in ms as ASCII)
  const fade = (options.fadeLength || 10000).toString();
  for (let i = 0; i < Math.min(fade.length, 5); i++) {
    tag[0x7E + i] = fade.charCodeAt(i);
  }

  // Artist name (32 bytes, offset 0x83)
  const artist = options.artist || '';
  for (let i = 0; i < Math.min(artist.length, 32); i++) {
    tag[0x83 + i] = artist.charCodeAt(i);
  }

  return tag;
}

/**
 * Export register log to SPC format
 */
export function exportToSPC(
  writes: RegisterWrite[],
  options: SPCExportOptions = {}
): Uint8Array {
  // Create SPC700 driver
  const driver = createSPC700Driver();

  // Encode register data
  const regData = encodeRegisterData(writes);

  // Calculate addresses
  const codeStart = driver.entryPoint;
  const dataStart = codeStart + driver.code.length;

  // Patch driver with data start address
  const code = [...driver.code];
  code[1] = dataStart & 0xFF;
  code[2] = (dataStart >> 8) & 0xFF;

  // Create 64KB RAM image
  const ram = new Uint8Array(SPC_RAM_SIZE);

  // Copy driver code
  ram.set(code, codeStart);

  // Copy register data
  ram.set(regData, dataStart);

  // Create DSP register initial state
  const dsp = new Uint8Array(SPC_DSP_REGS);

  // Initialize some DSP registers
  dsp[DSP.FLG] = 0xE0;     // Mute, disable echo
  dsp[DSP.MVOL_L] = 0x7F;  // Max master volume
  dsp[DSP.MVOL_R] = 0x7F;

  // Create SPC file
  // Header (256 bytes) + RAM (65536 bytes) + DSP (128 bytes) + extra RAM (64 bytes)
  const spc = new Uint8Array(SPC_HEADER_SIZE + SPC_RAM_SIZE + SPC_DSP_REGS + 64);
  const view = new DataView(spc.buffer);

  // Write header magic
  const magic = SPC_MAGIC;
  for (let i = 0; i < magic.length; i++) {
    spc[i] = magic.charCodeAt(i);
  }

  // Offset 0x21: 0x1A 0x1A (file marker)
  spc[0x21] = 0x1A;
  spc[0x22] = 0x1A;

  // Offset 0x23: ID666 tag presence (0x1A = has ID666)
  spc[0x23] = 0x1A;

  // Offset 0x24: Version minor
  spc[0x24] = 30;

  // SPC700 registers (offset 0x25)
  view.setUint16(0x25, driver.entryPoint, true); // PC
  spc[0x27] = 0x00; // A
  spc[0x28] = 0x00; // X
  spc[0x29] = 0x00; // Y
  spc[0x2A] = 0x00; // PSW
  spc[0x2B] = 0xEF; // SP (stack at $01EF)

  // Reserved (2 bytes at 0x2C)

  // ID666 tag (offset 0x2E, 210 bytes)
  const id666 = createID666Tag(options);
  spc.set(id666, 0x2E);

  // RAM dump (offset 0x100)
  spc.set(ram, SPC_HEADER_SIZE);

  // DSP registers (offset 0x10100)
  spc.set(dsp, SPC_HEADER_SIZE + SPC_RAM_SIZE);

  // Extra RAM (offset 0x10180, 64 bytes) - unused, leave zeroed

  return spc;
}

/**
 * High-level export function
 */
export async function exportSPC(
  logData: Uint8Array,
  parseRegisterLog: (data: Uint8Array) => RegisterWrite[],
  options: SPCExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const spcData = exportToSPC(writes, options);
  return new Blob([spcData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}
