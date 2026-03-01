/**
 * PumaTrackerParser.ts — PumaTracker (.puma) Amiga format parser
 *
 * PumaTracker was a 4-channel Amiga tracker by Dirk Bialluch.
 * Each instrument uses a vol/pitch script that sequences through waveforms.
 * This parser finds the first assigned waveform (from the first C0 vol event)
 * and creates a Sampler instrument using that waveform or PCM sample.
 *
 * File layout (no magic bytes — heuristic header validation):
 *   Header (80 bytes): songName[12], lastOrder(u16BE), numPatterns(u16BE),
 *     numInstruments(u16BE), unknown(u16BE)=0, sampleOffset[10](u32BE),
 *     sampleLength[10](u16BE, words)
 *   Order list: numOrders × 14 bytes (4×{pattern,instrTranspose,noteTranspose}+speed+zero)
 *   Pattern data: numPatterns × ("patt" marker + 4-byte RLE groups) + "patt" terminator
 *   Instrument data: numInstruments × ("inst" + vol script + "insf" + pitch script) + "inst"
 *   PCM samples: 8-bit signed big-endian at absolute sampleOffset[i] byte positions
 *
 * Built-in waveforms: 42 hardcoded 32-sample waveforms (indices 10-51, all looping).
 *
 * References:
 *   Reference Code/openmpt-master/soundlib/Load_puma.cpp (primary)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEChipRamInfo } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(view: DataView, off: number): number  { return view.getUint8(off); }
function s8(view: DataView, off: number): number  { return view.getInt8(off); }
function u16(view: DataView, off: number): number { return view.getUint16(off, false); }
function u32(view: DataView, off: number): number { return view.getUint32(off, false); }

function readMagic(view: DataView, off: number, magic: string): boolean {
  if (off + magic.length > view.byteLength) return false;
  for (let i = 0; i < magic.length; i++) {
    if (view.getUint8(off + i) !== magic.charCodeAt(i)) return false;
  }
  return true;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE      = 80;
const ORDER_ENTRY_SIZE = 14;  // 4×{pattern(1)+instrTranspose(1)+noteTranspose(1)} + speed(1) + zero(1)
const NUM_ROWS         = 32;

// ── Built-in waveforms ────────────────────────────────────────────────────────
// 42 hardcoded 32-sample looping waveforms (uint8 → signed PCM).
// Source: Load_puma.cpp lines 308-352.
// Indices 0-41 here correspond to waveform slots 10-51 in the format.

const BUILTIN_WAVEFORMS: Uint8Array[] = [
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0x3F,0x37,0x2F,0x27,0x1F,0x17,0x0F,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0x37,0x2F,0x27,0x1F,0x17,0x0F,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0x2F,0x27,0x1F,0x17,0x0F,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0x27,0x1F,0x17,0x0F,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0x1F,0x17,0x0F,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x17,0x0F,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x0F,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x07,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0xFF,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0x80,0x07,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0x80,0x88,0x0F,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0x80,0x88,0x90,0x17,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0x1F,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0xA0,0x27,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0xA0,0xA8,0x2F,0x37]),
  new Uint8Array([0xC0,0xC0,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0xF8,0xF0,0xE8,0xE0,0xD8,0xD0,0xC8,0xC0,0xB8,0xB0,0xA8,0xA0,0x98,0x90,0x88,0x80,0x88,0x90,0x98,0xA0,0xA8,0xB0,0x37]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x81,0x7F,0x7F,0x7F]),
  new Uint8Array([0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7F,0x7F]),
  new Uint8Array([0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7F]),
  new Uint8Array([0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x80,0x80,0x80,0x80,0x80,0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x80,0x80,0x80,0x80,0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x80,0x80,0x80,0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x80,0x80,0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x80,0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x80,0x80,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F,0x7F]),
  new Uint8Array([0x80,0x80,0x90,0x98,0xA0,0xA8,0xB0,0xB8,0xC0,0xC8,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8,0x00,0x08,0x10,0x18,0x20,0x28,0x30,0x38,0x40,0x48,0x50,0x58,0x60,0x68,0x70,0x7F]),
  new Uint8Array([0x80,0x80,0xA0,0xB0,0xC0,0xD0,0xE0,0xF0,0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70,0x45,0x45,0x79,0x7D,0x7A,0x77,0x70,0x66,0x61,0x58,0x53,0x4D,0x2C,0x20,0x18,0x12]),
  new Uint8Array([0x04,0xDB,0xD3,0xCD,0xC6,0xBC,0xB5,0xAE,0xA8,0xA3,0x9D,0x99,0x93,0x8E,0x8B,0x8A,0x45,0x45,0x79,0x7D,0x7A,0x77,0x70,0x66,0x5B,0x4B,0x43,0x37,0x2C,0x20,0x18,0x12]),
  new Uint8Array([0x04,0xF8,0xE8,0xDB,0xCF,0xC6,0xBE,0xB0,0xA8,0xA4,0x9E,0x9A,0x95,0x94,0x8D,0x83,0x00,0x00,0x40,0x60,0x7F,0x60,0x40,0x20,0x00,0xE0,0xC0,0xA0,0x80,0xA0,0xC0,0xE0]),
  new Uint8Array([0x00,0x00,0x40,0x60,0x7F,0x60,0x40,0x20,0x00,0xE0,0xC0,0xA0,0x80,0xA0,0xC0,0xE0,0x80,0x80,0x90,0x98,0xA0,0xA8,0xB0,0xB8,0xC0,0xC8,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8]),
  new Uint8Array([0x00,0x08,0x10,0x18,0x20,0x28,0x30,0x38,0x40,0x48,0x50,0x58,0x60,0x68,0x70,0x7F,0x80,0x80,0xA0,0xB0,0xC0,0xD0,0xE0,0xF0,0x00,0x10,0x20,0x30,0x40,0x50,0x60,0x70]),
];

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Returns true if the buffer passes PumaTracker header validation.
 * There are no magic bytes — the format is identified by structural constraints.
 * Mirrors Load_puma.cpp's PumaFileHeader::IsValid() + PumaPlaylistEntry::IsValid().
 */
export function isPumaTrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const view = new DataView(buffer);

  // ── Validate songName: no control chars (< 0x20) except NUL ──
  for (let i = 0; i < 12; i++) {
    const c = u8(view, i);
    if (c !== 0 && c < 0x20) return false;
  }

  const lastOrder      = u16(view, 12);
  const numPatterns    = u16(view, 14);
  const numInstruments = u16(view, 16);
  const unknown        = u16(view, 18);

  if (lastOrder > 255)              return false;
  if (!numPatterns || numPatterns > 128)       return false;
  if (!numInstruments || numInstruments > 32)  return false;
  if (unknown !== 0)                return false;

  const numOrders = lastOrder + 1;

  // ── Validate sample offsets / lengths ────────────────────────
  // Minimum additional size after header:
  //   orders*14 + patterns*8 + 4 + instruments*16 + 4
  const minAdditional = numOrders * ORDER_ENTRY_SIZE + numPatterns * 8 + 4 + numInstruments * 16 + 4;
  const minSampleOffset = HEADER_SIZE + minAdditional;

  for (let i = 0; i < 10; i++) {
    const sampleLen = u16(view, 20 + 40 + i * 2);  // sampleLength at offset 60+i*2
    const sampleOff = u32(view, 20 + i * 4);        // sampleOffset at offset 20+i*4
    if (sampleLen > 0 && !sampleOff) return false;
    if (sampleOff > 0x100000)         return false;
    if (sampleOff > 0 && sampleOff < minSampleOffset) return false;
  }

  // ── Validate first few order entries ─────────────────────────
  if (HEADER_SIZE + numOrders * ORDER_ENTRY_SIZE > buffer.byteLength) return false;

  const probeCount = Math.min(numOrders, 4);
  for (let ord = 0; ord < probeCount; ord++) {
    const base = HEADER_SIZE + ord * ORDER_ENTRY_SIZE;
    let valid = true;
    for (let ch = 0; ch < 4; ch++) {
      const pattern        = u8(view, base + ch * 3);
      const noteTranspose  = s8(view, base + ch * 3 + 2);
      if (pattern >= 128) { valid = false; break; }
      if ((noteTranspose & 1) !== 0) { valid = false; break; }
      if (noteTranspose < -48 || noteTranspose > 48) { valid = false; break; }
    }
    if (!valid) return false;
    const speed = u8(view, base + 12);
    const zero  = u8(view, base + 13);
    if (speed > 15 || zero !== 0) return false;
  }

  return true;
}

// ── Raw pattern row type ──────────────────────────────────────────────────────

interface RawRow {
  noteX2:      number;  // note * 2 (0 = no note, must be even when non-zero)
  instrEffect: number;  // bits 4-0 = instrument (1-31), bits 7-5 = effect (0-3)
  param:       number;  // effect parameter
}

// ── Script parsing ────────────────────────────────────────────────────────────

/**
 * Scan the vol script (starting at `pos`) and return:
 *   - waveformIndex: from the first C0 event's second byte (-1 if not found / invalid)
 *   - endPos: position after the script's terminating event
 *
 * Per Load_puma.cpp::TranslatePumaScript(): all events are 4 bytes.
 * Vol script: first event MUST be C0; terminates on B0 or E0.
 */
function parseVolScript(
  view: DataView,
  pos: number,
): { waveformIndex: number; endPos: number } {
  const limit = view.byteLength;
  let waveformIndex = -1;
  let isFirst = true;

  while (pos + 4 <= limit) {
    const cmd = u8(view, pos);

    // First event in vol script must be C0 (SetWaveform)
    if (isFirst && cmd !== 0xC0) return { waveformIndex: -1, endPos: pos };

    switch (cmd) {
      case 0xA0:  // Volume ramp — consume 4 bytes
        pos += 4;
        break;
      case 0xB0:  // Jump — terminates (data[1] must be divisible by 4)
        return { waveformIndex, endPos: pos + 4 };
      case 0xC0:  // SetWaveform — only valid in vol script
        if (isFirst) waveformIndex = u8(view, pos + 1);
        pos += 4;
        break;
      case 0xE0:  // Stop sound — terminates
        return { waveformIndex, endPos: pos + 4 };
      default:
        // Unknown command — abort
        return { waveformIndex, endPos: pos };
    }
    isFirst = false;
  }
  return { waveformIndex, endPos: pos };
}

/**
 * Skip a pitch script (starting at `pos`) and return the position after it.
 * Pitch script: terminates on B0 or E0; C0 is invalid; D0 = SetPitch.
 * Edge case: if non-command byte is "inst" magic, stop without consuming it.
 */
function skipPitchScript(view: DataView, pos: number): number {
  const limit = view.byteLength;

  while (pos + 4 <= limit) {
    const cmd = u8(view, pos);

    switch (cmd) {
      case 0xA0:  // Pitch ramp
        pos += 4;
        break;
      case 0xB0:  // Jump — terminates
        return pos + 4;
      case 0xD0:  // SetPitch
        if (u8(view, pos + 1) & 1) return pos;  // odd value = invalid
        pos += 4;
        break;
      case 0xE0:  // End — terminates
        return pos + 4;
      default: {
        // Edge case: "inst" marker at start of pitch area (vimto-02.puma)
        // Don't consume it; the outer loop will read "inst" as the next tag.
        if (readMagic(view, pos, 'inst')) return pos;
        return pos;
      }
    }
  }
  return pos;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a PumaTracker (.puma) file into a TrackerSong.
 */
export async function parsePumaTrackerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const view  = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (!isPumaTrackerFormat(buffer)) {
    throw new Error('PumaTracker: invalid file format');
  }

  // ── Header ────────────────────────────────────────────────────────────────

  let songName = '';
  for (let i = 0; i < 12; i++) {
    const c = u8(view, i);
    if (c === 0) break;
    songName += String.fromCharCode(c);
  }

  const lastOrder      = u16(view, 12);
  const numPatterns    = u16(view, 14);
  const numInstruments = u16(view, 16);
  // u16(view, 18) = unknown (must be 0)

  const numOrders = lastOrder + 1;

  // PCM sample metadata (sampleOffset[10] at offset 20, sampleLength[10] at offset 60)
  const sampleOffsets: number[] = [];
  const sampleLengths: number[] = [];  // in bytes (words × 2)
  for (let i = 0; i < 10; i++) {
    sampleOffsets.push(u32(view, 20 + i * 4));
    sampleLengths.push(u16(view, 60 + i * 2) * 2);
  }

  // ── Order list ────────────────────────────────────────────────────────────

  interface OrderChannel { pattern: number; instrTranspose: number; noteTranspose: number; }
  interface OrderEntry   { channels: OrderChannel[]; speed: number; }

  const orders: OrderEntry[] = [];
  let pos = HEADER_SIZE;

  for (let ord = 0; ord < numOrders; ord++) {
    const channels: OrderChannel[] = [];
    for (let ch = 0; ch < 4; ch++) {
      channels.push({
        pattern:        u8(view, pos + ch * 3),
        instrTranspose: s8(view, pos + ch * 3 + 1),
        noteTranspose:  s8(view, pos + ch * 3 + 2),
      });
    }
    const speed = u8(view, pos + 12);
    orders.push({ channels, speed });
    pos += ORDER_ENTRY_SIZE;
  }

  // ── Raw pattern data (RLE) ────────────────────────────────────────────────
  // Each pattern: "patt" marker + RLE groups of {noteX2, instrEffect, param, runLen}.
  // After all patterns: another "patt" marker.

  const patternData: RawRow[][] = [];

  for (let p = 0; p < numPatterns; p++) {
    if (!readMagic(view, pos, 'patt')) {
      throw new Error(`PumaTracker: expected "patt" at 0x${pos.toString(16)}`);
    }
    pos += 4;

    const rows: RawRow[] = new Array(NUM_ROWS).fill(null).map(() => ({ noteX2: 0, instrEffect: 0, param: 0 }));
    let row = 0;

    while (row < NUM_ROWS && pos + 4 <= buffer.byteLength) {
      const noteX2      = u8(view, pos);
      const instrEffect = u8(view, pos + 1);
      const param       = u8(view, pos + 2);
      const runLen      = u8(view, pos + 3);
      pos += 4;

      if (noteX2 & 1) throw new Error(`PumaTracker: odd note byte at pattern ${p}`);
      if (!runLen || runLen > NUM_ROWS - row) throw new Error(`PumaTracker: bad runLen ${runLen} at pattern ${p} row ${row}`);

      for (let r = 0; r < runLen; r++) {
        rows[row + r] = { noteX2, instrEffect, param };
      }
      row += runLen;
    }

    patternData.push(rows);
  }

  // Terminating "patt" marker
  if (!readMagic(view, pos, 'patt')) {
    throw new Error(`PumaTracker: expected terminating "patt" at 0x${pos.toString(16)}`);
  }
  pos += 4;

  // ── Instrument scripts ────────────────────────────────────────────────────
  // Each instrument: "inst" marker + vol script + "insf" marker + pitch script.
  // After all instruments: terminating "inst" marker.
  // Vol script first event MUST be C0 (SetWaveform); data[1] = waveform slot (0-51).

  const waveformIndices: number[] = [];
  // Byte offsets for each instrument's data block (for uadeChipRam).
  // Each entry: { start: file offset of "inst" marker, end: file offset after pitch script }
  const instrOffsets: Array<{ start: number; end: number }> = [];

  for (let ins = 0; ins < numInstruments; ins++) {
    if (!readMagic(view, pos, 'inst')) {
      throw new Error(`PumaTracker: expected "inst" at 0x${pos.toString(16)} (instrument ${ins})`);
    }
    const instrStart = pos;  // file offset of this instrument's "inst" marker
    pos += 4;

    const volResult = parseVolScript(view, pos);
    pos = volResult.endPos;
    waveformIndices.push(volResult.waveformIndex);

    if (!readMagic(view, pos, 'insf')) {
      throw new Error(`PumaTracker: expected "insf" at 0x${pos.toString(16)} (instrument ${ins})`);
    }
    pos += 4;

    pos = skipPitchScript(view, pos);
    instrOffsets.push({ start: instrStart, end: pos });
  }

  // Terminating "inst" marker
  if (!readMagic(view, pos, 'inst')) {
    // Non-fatal: some files may be truncated here
    console.warn(`PumaTracker: expected terminating "inst" at 0x${pos.toString(16)}`);
  }

  // ── PCM sample extraction ─────────────────────────────────────────────────
  // 8-bit signed big-endian at absolute file offsets. (For 8-bit samples, BE/LE is irrelevant.)

  const pcmSamples: (Uint8Array | null)[] = [];
  for (let i = 0; i < 10; i++) {
    const len = sampleLengths[i];
    const off = sampleOffsets[i];
    if (!len || !off || off >= buffer.byteLength) {
      pcmSamples.push(null);
    } else {
      const avail = Math.min(len, buffer.byteLength - off);
      pcmSamples.push(bytes.slice(off, off + avail));
    }
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let ins = 0; ins < numInstruments; ins++) {
    const wfIdx = waveformIndices[ins];
    const id    = ins + 1;
    const name  = `Instrument ${id}`;

    // Determine PCM data and loop points from waveform index
    let pcm: Uint8Array | null = null;
    let loopStart = 0;
    let loopEnd   = 0;

    if (wfIdx >= 0 && wfIdx < 10) {
      // PCM sample slot 0-9
      pcm       = pcmSamples[wfIdx];
      loopStart = 0;
      loopEnd   = 0;  // No loop for raw PCM samples
    } else if (wfIdx >= 10 && wfIdx < 52) {
      // Built-in waveform slot 10-51 → BUILTIN_WAVEFORMS[wfIdx - 10]
      pcm       = BUILTIN_WAVEFORMS[wfIdx - 10];
      loopStart = 0;
      loopEnd   = 32;  // All built-in waveforms loop their full 32 samples
    }

    const pumaInstrOffset = instrOffsets[ins];
    const pumaChipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: buffer.byteLength,
      instrBase: pumaInstrOffset ? pumaInstrOffset.start : 0,
      instrSize: pumaInstrOffset ? pumaInstrOffset.end - pumaInstrOffset.start : 0,
      sections: {},
    };

    if (!pcm || pcm.length === 0) {
      // Empty/silent instrument placeholder
      const pumaEmptyInst: InstrumentConfig = {
        id,
        name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as unknown as InstrumentConfig;
      pumaEmptyInst.uadeChipRam = pumaChipRam;
      instruments.push(pumaEmptyInst);
    } else {
      const pumaSamplerInst = createSamplerInstrument(
        id, name, pcm,
        64,     // volume (full; actual volume controlled by vol script at runtime)
        8363,   // Amiga ProTracker standard sample rate (A-3 = 8363 Hz)
        loopStart,
        loopEnd,
      );
      pumaSamplerInst.uadeChipRam = pumaChipRam;
      instruments.push(pumaSamplerInst);
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────────
  // Each order entry becomes one DEViLBOX pattern with 32 rows × 4 channels.
  // Per-channel pattern index + transpose comes from the order entry.

  const PANNING = [-50, 50, 50, -50] as const;  // LRRL (Amiga 4-channel default)

  const patterns: Pattern[] = orders.map((order, ordIdx) => {
    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const chnInfo = order.channels[ch];
      const rawPatt = chnInfo.pattern < patternData.length ? patternData[chnInfo.pattern] : null;

      // Auto-portamento state: persists across rows without an explicit porta command
      let autoPorta: 0 | 1 | 2 = 0;  // 0=none, 1=portaDown, 2=portaUp

      const rows: TrackerCell[] = Array.from({ length: NUM_ROWS }, (_, row): TrackerCell => {
        const cell: TrackerCell = {
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        };

        // Speed effect on row 0 of channel 0 only
        if (ch === 0 && row === 0 && order.speed > 0) {
          cell.effTyp = 0x0F;
          cell.eff    = order.speed;
        }

        if (!rawPatt) return cell;

        const p = rawPatt[row];

        // ── Note conversion ──────────────────────────────────────────────
        // rawNote = p.noteX2 (even, non-zero when note present)
        // devilboxNote = 12 + (rawNote + noteTranspose) / 2
        // Mirrors: NOTE_MIDDLEC - 49 + (p[0] + noteTranspose) / 2  (OpenMPT, NOTE_MIDDLEC=61)
        if (p.noteX2) {
          const raw = p.noteX2 + chnInfo.noteTranspose;
          cell.note = Math.max(1, 12 + Math.trunc(raw / 2));
        }

        // ── Instrument ──────────────────────────────────────────────────
        // bits 4-0 of instrEffect, adjusted by instrTranspose, wrapped to 0-31
        const rawInstr = p.instrEffect & 0x1F;
        if (rawInstr !== 0) {
          cell.instrument = ((rawInstr + chnInfo.instrTranspose) & 0x1F);
        }

        // ── Effects ─────────────────────────────────────────────────────
        // bits 7-5 of instrEffect: 0=none, 1=volume, 2=portaDown, 3=portaUp
        const effType = (p.instrEffect >> 5) & 0x07;
        const param   = p.param;

        let hasExplicitPorta = false;

        switch (effType) {
          case 1:  // Set volume → MOD/XM effect 0x0C (Cxx)
            cell.effTyp = 0x0C;
            cell.eff    = Math.min(param, 64);
            autoPorta = 0;
            break;
          case 2:  // Portamento down → MOD/XM effect 0x02 (2xx)
            if (param > 0) {
              cell.effTyp = 0x02;
              cell.eff    = param;
              autoPorta   = 1;
              hasExplicitPorta = true;
            } else {
              autoPorta = 0;
            }
            break;
          case 3:  // Portamento up → MOD/XM effect 0x01 (1xx)
            if (param > 0) {
              cell.effTyp = 0x01;
              cell.eff    = param;
              autoPorta   = 2;
              hasExplicitPorta = true;
            } else {
              autoPorta = 0;
            }
            break;
          default:
            break;
        }

        // Auto-portamento: if porta was active and this row has no explicit porta
        // and no note (note arrival clears auto-porta), continue it in effect col 2.
        if (!hasExplicitPorta) {
          if (p.noteX2) {
            // New note clears auto-portamento
            autoPorta = 0;
          } else if (autoPorta === 1) {
            cell.effTyp2 = 0x02;
            cell.eff2    = 0;   // Continue with zero param (sustain)
          } else if (autoPorta === 2) {
            cell.effTyp2 = 0x01;
            cell.eff2    = 0;
          }
        }

        return cell;
      });

      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          PANNING[ch],
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    return {
      id:       `pattern-${ordIdx}`,
      name:     `Pattern ${ordIdx}`,
      length:   NUM_ROWS,
      channels,
      importMetadata: {
        sourceFormat:            'PumaTracker',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    4,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numInstruments,
      },
    };
  });

  // Fallback: at least one empty pattern
  if (patterns.length === 0) {
    patterns.push({
      id:     'pattern-0',
      name:   'Pattern 0',
      length: NUM_ROWS,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          PANNING[ch],
        instrumentId: null,
        color:        null,
        rows: Array.from({ length: NUM_ROWS }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'PumaTracker',
        sourceFile:   filename,
        importedAt:   new Date().toISOString(),
        originalChannelCount:    4,
        originalPatternCount:    0,
        originalInstrumentCount: 0,
      },
    });
  }

  // ── Song structure ────────────────────────────────────────────────────────
  // One DEViLBOX pattern per order entry → order is simply [0, 1, ..., numOrders-1].

  const songPositions = patterns.map((_, i) => i);
  const name          = songName.trim() || filename.replace(/\.[^/.]+$/, '');

  return {
    name,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
