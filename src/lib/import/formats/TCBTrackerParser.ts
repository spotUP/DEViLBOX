/**
 * TCBTrackerParser.ts -- TCB Tracker (.tcb) Atari ST format parser
 *
 * TCB Tracker is an Atari ST tracker by Anders Nilsson (AN Cool), 1990-1991.
 * Two format variants share the same layout:
 *   "AN COOL." — old format
 *   "AN COOL!" — new format
 *
 * Always 4 channels, 16 instrument slots, 64 rows per pattern.
 * Samples are 8-bit unsigned PCM (converted to signed on import).
 * No loop data is stored for samples.
 *
 * Pattern cell encoding (2 bytes):
 *   byte 0:  note  — high nibble = octave, low nibble = semitone (0=C…11=B); 0 = no note
 *   byte 1:  high nibble = instrument (0=none, 1-15=instrument slot),
 *            low nibble  = effect (only 0xD = pattern break known)
 *
 * References:
 *   Reference Code/libxmp-master/docs/formats/tcb-tracker.txt
 *   Reference Code/libxmp-master/src/bitrot/loaders/tcb_load.c
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// -- Binary helpers -----------------------------------------------------------

function u8(view: DataView, off: number): number  { return view.getUint8(off); }
function u16(view: DataView, off: number): number { return view.getUint16(off, false); }
function u32(view: DataView, off: number): number { return view.getUint32(off, false); }

function readString(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = view.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}

/** Convert 8-bit unsigned PCM (0x80 = silence) to 8-bit signed (0x00 = silence). */
function convertUnsignedToSigned(src: Uint8Array): Uint8Array {
  const dst = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    dst[i] = src[i] ^ 0x80;  // flip MSB: 0x80→0x00, 0x00→0x80, 0xFF→0x7F
  }
  return dst;
}

// -- Format detection ---------------------------------------------------------

/**
 * Returns true if the buffer starts with a TCB Tracker magic identifier.
 */
export function isTCBTrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  const magic = readString(view, 0, 8);
  return magic === 'AN COOL.' || magic === 'AN COOL!';
}

// -- Main parser --------------------------------------------------------------

/**
 * Parse a TCB Tracker (.tcb) file into a TrackerSong.
 */
export async function parseTCBTrackerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const view  = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (buffer.byteLength < 0x140) throw new Error('TCBTracker: file too small');

  const magic = readString(view, 0, 8);
  if (magic !== 'AN COOL.' && magic !== 'AN COOL!') {
    throw new Error(`TCBTracker: bad magic "${magic}"`);
  }

  // ── Header ────────────────────────────────────────────────────────────────
  // +0x00  char[8]    magic
  // +0x08  uint16BE   unknown
  // +0x0A  uint16BE   numPatterns
  // +0x0C  uint16BE   unknown
  // +0x0E  uint8[128] order table
  // +0x8E  uint8      songLength
  // +0x8F  uint8      unknown
  // +0x90  uint16BE   unknown
  // +0x92  char[8][16] instrument names
  // +0x112 byte[32]   unknown
  // +0x132 pattern data

  /* u16(view, 0x08) */  // unknown
  const numPatterns = u16(view, 0x0A);
  /* u16(view, 0x0C) */  // unknown

  const orderTable: number[] = [];
  for (let i = 0; i < 128; i++) {
    orderTable.push(u8(view, 0x0E + i));
  }

  const songLength = u8(view, 0x8E);
  // 0x8F: unknown, 0x90-0x91: unknown

  const instrumentNames: string[] = [];
  for (let i = 0; i < 16; i++) {
    instrumentNames.push(readString(view, 0x92 + i * 8, 8).trim() || `Sample ${i + 1}`);
  }

  // +0x112: 32 unknown bytes (skip)
  // Pattern data starts at 0x132

  // ── Pattern data ──────────────────────────────────────────────────────────
  // Each pattern: 64 rows × 4 channels × 2 bytes = 512 bytes
  //
  // Cell byte 0 (note):
  //   0 = no note
  //   non-zero: octave = high nibble, semitone = low nibble (0=C…11=B)
  //   → DEViLBOX note: 12 * octave + semitone + 37
  //     (= XMP formula 12*oct+semi+36, then +1 for DEViLBOX offset)
  //
  // Cell byte 1:
  //   high nibble = instrument (0=none, 1-15=slot)
  //   low nibble  = effect (0xD = pattern break)

  const PATT_START = 0x132;

  if (PATT_START + numPatterns * 512 > buffer.byteLength) {
    throw new Error('TCBTracker: truncated pattern data');
  }

  type RawCell = { note: number; ins: number; effTyp: number; effParm: number };
  const patternData: RawCell[][][] = [];

  for (let p = 0; p < numPatterns; p++) {
    const pattBase = PATT_START + p * 512;
    const pattRows: RawCell[][] = [];

    for (let row = 0; row < 64; row++) {
      const rowCells: RawCell[] = [];
      for (let ch = 0; ch < 4; ch++) {
        const off = pattBase + (row * 4 + ch) * 2;
        const b0 = u8(view, off);
        const b1 = u8(view, off + 1);

        const noteByte  = b0;
        const insNibble = b1 >> 4;
        const effNibble = b1 & 0x0F;

        // Note: octave(high) + semitone(low); 0 = no note
        // TCB → DEViLBOX: 12 * oct + semi + 37
        // (mirrors libxmp xmpNote = 12*oct + semi + 36, then +1 for DEViLBOX XM offset)
        const note = (noteByte !== 0)
          ? 12 * (noteByte >> 4) + (noteByte & 0x0F) + 37
          : 0;

        // Instrument: nibble 0 = no instrument, 1-15 = slots 1-15
        const ins = insNibble;

        // Effects: only pattern break (0xD) is documented
        let effTyp = 0, effParm = 0;
        if (effNibble === 0xD) {
          effTyp  = 0x0D;  // XM pattern break
          effParm = 0;
        }

        rowCells.push({ note, ins, effTyp, effParm });
      }
      pattRows.push(rowCells);
    }

    patternData.push(pattRows);
  }

  // ── Instrument data ───────────────────────────────────────────────────────
  // Immediately after pattern data:
  //   +0:   uint32BE  total sample data size (informational, skip)
  //   +4:   16 × { uint8 vol, uint8 unk1, uint8 unk2, uint8 unk3 }   (64 bytes)
  //   +68:  16 × { uint32BE sampleOffset, uint32BE sampleLen }       (128 bytes)
  //   +196: 4 × uint32BE unknown
  //   +212: sample data (accessed via sampleOffset[i] relative to instrBase)

  const instrBase = PATT_START + numPatterns * 512;

  if (instrBase + 4 + 64 + 128 + 16 > buffer.byteLength) {
    throw new Error('TCBTracker: truncated instrument header');
  }

  /* u32(view, instrBase) */  // total sample data size (skip)

  const volumes:       number[] = [];
  const sampleOffsets: number[] = [];
  const sampleLengths: number[] = [];

  for (let i = 0; i < 16; i++) {
    const rawVol = u8(view, instrBase + 4 + i * 4);
    volumes.push(Math.min(rawVol >> 1, 64));  // 0-127 → 0-63, cap at 64
  }

  for (let i = 0; i < 16; i++) {
    sampleOffsets.push(u32(view, instrBase + 68 + i * 8));
    sampleLengths.push(u32(view, instrBase + 68 + i * 8 + 4));
  }

  // ── Extract samples ───────────────────────────────────────────────────────
  // Samples are 8-bit unsigned PCM addressed from instrBase.
  // Convert to signed on extraction.

  const sampleBuffers: (Uint8Array | null)[] = [];

  for (let i = 0; i < 16; i++) {
    const len    = sampleLengths[i];
    const offset = instrBase + sampleOffsets[i];

    if (len === 0 || offset >= buffer.byteLength) {
      sampleBuffers.push(null);
    } else {
      const avail = Math.min(len, buffer.byteLength - offset);
      const unsigned = bytes.slice(offset, offset + avail);
      sampleBuffers.push(convertUnsignedToSigned(unsigned));
    }
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────
  // TCB Tracker has no loop information — all samples are one-shot.
  // Sample rate: use 8287 Hz (Amiga standard; TCB converts cleanly to ProTracker).

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < 16; i++) {
    const name = instrumentNames[i];
    const pcm  = sampleBuffers[i];
    const vol  = volumes[i];

    if (!pcm || pcm.length === 0) {
      instruments.push({
        id: i + 1,
        name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: -60,
        pan: 0,
      } as unknown as InstrumentConfig);
    } else {
      instruments.push(
        createSamplerInstrument(
          i + 1, name, pcm, vol,
          8287,   // Atari ST / ProTracker-compatible sample rate
          0, 0,   // no loop
        ),
      );
    }
  }

  // ── Build TrackerSong patterns ────────────────────────────────────────────

  const PANNING = [-50, 50, 50, -50] as const;  // LRRL (Amiga/Atari 4-channel default)

  const patterns: Pattern[] = patternData.map((pRows, pIdx) => {
    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const rows: TrackerCell[] = pRows.map(rowCells => {
        const c = rowCells[ch];
        return {
          note:       c.note,
          instrument: c.ins,
          volume:     0,
          effTyp:     c.effTyp,
          eff:        c.effParm,
          effTyp2:    0,
          eff2:       0,
        };
      });

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows,
      };
    });

    return {
      id: `pattern-${pIdx}`,
      name: `Pattern ${pIdx}`,
      length: 64,
      channels,
      importMetadata: {
        sourceFormat: 'TCBTracker',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: 16,
      },
    };
  });

  // Fallback: at least one empty pattern
  if (patterns.length === 0) {
    patterns.push({
      id: 'pattern-0',
      name: 'Pattern 0',
      length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: PANNING[ch],
        instrumentId: null,
        color: null,
        rows: Array.from({ length: 64 }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'TCBTracker',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    });
  }

  // ── Song order ────────────────────────────────────────────────────────────

  const songPositions = orderTable
    .slice(0, Math.max(1, songLength))
    .filter(idx => idx < patterns.length);

  if (songPositions.length === 0) songPositions.push(0);

  const songName = filename.replace(/\.[^/.]+$/, '');

  return {
    name: songName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
