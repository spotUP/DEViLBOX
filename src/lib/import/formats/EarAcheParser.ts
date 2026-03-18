/**
 * EarAcheParser.ts — EarAche format detection and native pattern parser
 *
 * EarAche is an Amiga 4-channel synthesis tracker by Morten Grouleff (1993-2005).
 * Magic: "EASO" at offset 0.
 * UADE eagleplayer: EarAche (prefix: ea.)
 *
 * Binary layout (all values big-endian):
 *   +0   uint32  magic         "EASO"
 *   +4   uint32  songDataStart (always 0x18 = 24)
 *   +8   uint32  songDataEnd   (ptr1)
 *   +12  uint32  instrOffset   (ptr2 — instrument table)
 *   +16  uint32  waveOffset    (ptr3 — waveform/PCM data)
 *   +20  uint32  arpOffset     (ptr4 — arpeggio/portamento table)
 *
 * Song data (songDataStart .. songDataEnd):
 *   4 channels × 4 bytes per row = 16 bytes/row
 *   Cell layout: [note, instrument, effect, param]
 *     note:       0=empty, else XM note index (1-based; 0x19=25=C#2)
 *     instrument: 0=none, else 1-based index into instrument table
 *     effect:     effect type byte
 *     param:      effect parameter byte
 *
 * Instrument table (instrOffset .. arpOffset):
 *   16 bytes per entry; +12 = volume (0-64)
 *
 * Audio: UADE classic streaming (synthesis-based, not PCM samples).
 * Pattern display: native binary parsing (this file).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect EarAche format by "EASO" magic at offset 0.
 */
export function isEarAcheFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 24) return false;
  // 'E' 'A' 'S' 'O'
  return buf[0] === 0x45 && buf[1] === 0x41 && buf[2] === 0x53 && buf[3] === 0x4F;
}

/**
 * Parse an EarAche (.ea) file into a TrackerSong.
 * Pattern display uses native binary parsing; audio is injected via UADE classic streaming.
 */
export function parseEarAcheFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isEarAcheFormat(buf)) throw new Error('Not an EarAche module (missing EASO magic)');

  // -- Header ------------------------------------------------------------------
  const songDataStart  = u32BE(buf, 4);   // Always 0x18
  const songDataEnd    = u32BE(buf, 8);   // ptr1 — end of song data
  const instrOffset    = u32BE(buf, 12);  // ptr2 — instrument table start
  const arpOffset      = u32BE(buf, 20);  // ptr4 — arpeggio table (marks end of instrument table)

  const NUM_CHANNELS = 4;
  const CELL_SIZE    = 4;
  const ROW_SIZE     = NUM_CHANNELS * CELL_SIZE; // 16 bytes per row
  const INST_ENTRY   = 16;

  const numRows        = Math.floor((songDataEnd - songDataStart) / ROW_SIZE);
  const numInstruments = Math.floor((arpOffset - instrOffset) / INST_ENTRY);

  // -- Instruments -------------------------------------------------------------
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < numInstruments; i++) {
    const base   = instrOffset + i * INST_ENTRY;
    const volume = buf[base + 12]; // 0-64
    instruments.push({
      id:        i + 1,
      name:      `Waveform ${i + 1}`,
      type:      'synth' as const,
      synthType: 'Synth' as const,
      effects:   [],
      volume:    volume > 0 ? 20 * Math.log10(volume / 64) : -60,
      pan:       0,
    } as InstrumentConfig);
  }
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Waveform 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  // -- Song data → patterns ----------------------------------------------------
  // EarAche is a linear format with no pattern order table.
  // Split song data into 64-row display patterns.
  const PATTERN_LEN = 64;
  const numPatterns = Math.max(1, Math.ceil(numRows / PATTERN_LEN));
  const patterns = [];

  for (let p = 0; p < numPatterns; p++) {
    const rowStart = p * PATTERN_LEN;
    const rowCount = Math.min(PATTERN_LEN, numRows - rowStart);

    // Build per-channel row arrays
    const channelRows: Array<Array<{
      note: number; instrument: number; volume: number;
      effTyp: number; eff: number; effTyp2: number; eff2: number;
    }>> = Array.from({ length: NUM_CHANNELS }, () => []);

    for (let r = 0; r < rowCount; r++) {
      const rowOff = songDataStart + (rowStart + r) * ROW_SIZE;
      for (let ch = 0; ch < NUM_CHANNELS; ch++) {
        const cellOff  = rowOff + ch * CELL_SIZE;
        const noteByte = buf[cellOff];
        const instByte = buf[cellOff + 1];
        const effByte  = buf[cellOff + 2];
        const parByte  = buf[cellOff + 3];
        channelRows[ch].push({
          note:       noteByte, // Direct XM note index (0 = empty)
          instrument: instByte, // 1-based; 0 = none
          volume:     0,
          effTyp:     effByte,
          eff:        parByte,
          effTyp2:    0,
          eff2:       0,
        });
      }
    }

    patterns.push({
      id:     `pattern-${p}`,
      name:   `Pattern ${p}`,
      length: rowCount,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color:        null,
        rows:         channelRows[ch],
      })),
      importMetadata: {
        sourceFormat:            'MOD' as const,
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numInstruments,
      },
    });
  }

  const songPositions = patterns.map((_, i) => i);
  const baseName      = filename.split('/').pop() ?? filename;
  const moduleName    = baseName.replace(/^ea\./i, '').replace(/\.ea$/i, '') || baseName;

  return {
    name:            `${moduleName} [EarAche]`,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      patterns.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
