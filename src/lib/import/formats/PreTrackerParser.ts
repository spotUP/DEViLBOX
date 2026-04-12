/**
 * PreTrackerParser.ts -- PreTracker (.prt) format parser
 *
 * PreTracker is a 4-channel Commodore Amiga tracker by Ratt/Abyss.
 * Binary format: magic "PRT" + version byte, 4 BE32 section offsets,
 * 3 bytes/cell (note, inst|effect, effectParam).
 *
 * Patterns are single-channel and referenced by a per-channel order list.
 * Pattern 0 is implicit empty (not stored); patterns numbered 1..N.
 *
 * Versions: 0x18, 0x19 (older, no remap table), 0x1a, 0x1b (standard),
 * 0x1e (newer, variable rows). The version byte at offset 3 determines
 * the header layout.
 *
 * Format reference: reverse-engineered from 60+ .prt files and the
 * transpiled 68k UADE eagleplayer at pretracker-wasm/src/pretracker/.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { PreTrackerConfig } from '@/types/instrument';

// ── Binary reading helpers ───────────────────────────────────────────────

function u8(v: DataView, off: number): number { return v.getUint8(off); }
function u32(v: DataView, off: number): number { return v.getUint32(off, false); }

function readNullString(v: DataView, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen && off + i < v.byteLength; i++) {
    const ch = v.getUint8(off + i);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}

// ── PreTracker note → XM note ────────────────────────────────────────────

/**
 * PreTracker note values: 0 = none, 1 = C-1, 2 = C#1, ..., 12 = B-1,
 * 13 = C-2, ..., 61 = C-6.
 * XM notes: 1 = C-0, 13 = C-1, 25 = C-2, etc.
 * PreTracker note N maps to XM note N + 12.
 */
function prtNoteToXM(note: number): number {
  if (note === 0) return 0;
  return note + 12;
}

// ── Format detection ─────────────────────────────────────────────────────

const PRT_VERSIONS = new Set([0x18, 0x19, 0x1a, 0x1b, 0x1e]);

export function isPreTrackerFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 20) return false;
  const v = new DataView(buffer);
  // Magic: "PRT" at offset 0
  if (v.getUint8(0) !== 0x50 || v.getUint8(1) !== 0x52 || v.getUint8(2) !== 0x54) return false;
  // Known version byte
  return PRT_VERSIONS.has(v.getUint8(3));
}

// ── Metadata extraction (version-dependent offsets) ──────────────────────

interface PrtMeta {
  version: number;
  orderListOffset: number;
  patternDataOffset: number;
  instNamesOffset: number;
  sampleNamesOffset: number;
  songName: string;
  numPatterns: number;
  numPositions: number;
  rowsPerPattern: number;
  numSamples: number;
  subsongCount: number;
}

function readMeta(v: DataView): PrtMeta {
  const version = u8(v, 3);
  const orderListOffset = u32(v, 4);
  const patternDataOffset = u32(v, 8);
  const instNamesOffset = u32(v, 12);
  const sampleNamesOffset = u32(v, 16);

  const songName = readNullString(v, 20, 32);

  // Metadata field offsets depend on the version / orderListOffset
  let numPatterns: number;
  let numPositions: number;
  let rowsPerPattern: number;
  let numSamples: number;
  let subsongCount: number;

  if (orderListOffset <= 67) {
    // v0x18/0x19 — older format, no remap table
    // Fields at slightly different offsets; metadata area starts around byte 56
    // off4=67: bytes 60..66 contain the fields
    numPatterns = u8(v, 61);
    numPositions = u8(v, 62);
    rowsPerPattern = u8(v, 63) || 64;
    numSamples = u8(v, 64);
    subsongCount = 0;
  } else if (version === 0x1e) {
    // v0x1e — newer format (off4=92)
    numPatterns = u8(v, 61);
    numPositions = u8(v, 62);
    rowsPerPattern = u8(v, 64) || 64;
    numSamples = u8(v, 65);
    subsongCount = u8(v, 90);
  } else {
    // v0x1a/0x1b — standard format (off4=91)
    numPatterns = u8(v, 61);
    numPositions = u8(v, 62);
    rowsPerPattern = u8(v, 63) || 64;
    numSamples = u8(v, 64);
    subsongCount = u8(v, 90);
  }

  return {
    version, orderListOffset, patternDataOffset, instNamesOffset,
    sampleNamesOffset, songName, numPatterns, numPositions,
    rowsPerPattern, numSamples, subsongCount,
  };
}

// ── Parser ───────────────────────────────────────────────────────────────

export async function parsePreTrackerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isPreTrackerFormat(buffer)) {
    throw new Error('Not a PreTracker file');
  }

  const v = new DataView(buffer);
  const meta = readMeta(v);
  const NUM_CHANNELS = 4;
  const baseName = filename.replace(/\.[^.]+$/, '');

  // ── Read order list ──────────────────────────────────────────────────
  // 2 bytes per entry: [patternNumber, transpose]
  // 4 entries per song position (one per channel)
  const orderEntries: { pattern: number; transpose: number }[][] = [];
  let off = meta.orderListOffset;

  for (let pos = 0; pos < meta.numPositions; pos++) {
    const row: { pattern: number; transpose: number }[] = [];
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      if (off + 1 < buffer.byteLength) {
        row.push({ pattern: u8(v, off), transpose: v.getInt8(off + 1) });
        off += 2;
      } else {
        row.push({ pattern: 0, transpose: 0 });
      }
    }
    orderEntries.push(row);
  }

  // ── Read single-channel patterns ─────────────────────────────────────
  // Pattern N (1-based) is at patternDataOffset + (N-1) * rowsPerPattern * 3
  const CELL_SIZE = 3;
  const patternSize = meta.rowsPerPattern * CELL_SIZE;

  interface PrtCell {
    note: number;
    instrument: number;
    hasArpeggio: boolean;
    effectType: number;
    effectParam: number;
  }

  function readSingleChannelPattern(patIdx: number): PrtCell[] {
    if (patIdx === 0) {
      return Array.from({ length: meta.rowsPerPattern }, () => ({
        note: 0, instrument: 0, hasArpeggio: false, effectType: 0, effectParam: 0,
      }));
    }
    const base = meta.patternDataOffset + (patIdx - 1) * patternSize;
    const cells: PrtCell[] = [];
    for (let row = 0; row < meta.rowsPerPattern; row++) {
      const cellOff = base + row * CELL_SIZE;
      if (cellOff + 2 < buffer.byteLength) {
        const b0 = u8(v, cellOff);
        const b1 = u8(v, cellOff + 1);
        const b2 = u8(v, cellOff + 2);
        // Full 3-byte cell format:
        // b0: bits 5-0=note, bit 6=has_arpeggio, bit 7=instrument high bit
        // b1: bits 7-4=instrument low nibble, bits 3-0=effect cmd
        // b2: effect data
        const note = b0 & 0x3F;
        const hasArpeggio = (b0 & 0x40) !== 0;
        const instHi = (b0 & 0x80) ? 0x10 : 0;
        const instrument = instHi | ((b1 >> 4) & 0x0F);
        const effectType = hasArpeggio ? 0 : (b1 & 0x0F);
        const effectParam = b2;
        cells.push({ note, instrument, hasArpeggio, effectType, effectParam });
      } else {
        cells.push({ note: 0, instrument: 0, hasArpeggio: false, effectType: 0, effectParam: 0 });
      }
    }
    return cells;
  }

  // ── Build composite patterns from order list ─────────────────────────
  // Each song position combines 4 single-channel patterns into one
  // multi-channel pattern (applying transpose to notes).
  const patterns = orderEntries.map((posEntry, posIdx) => {
    const channels = posEntry.map((entry, ch) => {
      const scPat = readSingleChannelPattern(entry.pattern);
      const rows = scPat.map((cell) => {
        let xmNote = prtNoteToXM(cell.note);
        // Apply transpose (semitones) from order list
        if (xmNote > 0 && entry.transpose !== 0) {
          xmNote = Math.max(1, Math.min(119, xmNote + entry.transpose));
        }

        // Map PreTracker effects to XM effect columns
        let effTyp = 0;
        let eff = cell.effectParam;
        switch (cell.effectType) {
          case 0x0: // Arpeggio (when param != 0)
            if (cell.effectParam !== 0) effTyp = 0;
            break;
          case 0x1: effTyp = 1; break;  // Portamento up
          case 0x2: effTyp = 2; break;  // Portamento down
          case 0x3: effTyp = 3; break;  // Tone portamento
          case 0x4: effTyp = 4; break;  // Vibrato
          case 0x5: effTyp = 5; break;  // Tone porta + vol slide
          case 0x9: effTyp = 9; break;  // Sample offset
          case 0xC: effTyp = 0xC; break; // Set volume
          case 0xF: effTyp = 0xF; break; // Set speed/tempo
          default:
            // Unknown effects — preserve as-is
            effTyp = cell.effectType;
            break;
        }

        return {
          note: xmNote,
          instrument: cell.instrument,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        };
      });

      return {
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,  // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows,
      };
    });

    return {
      id: `pattern-${posIdx}`,
      name: `Position ${posIdx}`,
      length: meta.rowsPerPattern,
      channels,
      importMetadata: {
        sourceFormat: 'PreTracker' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: meta.numPatterns,
        originalInstrumentCount: meta.numSamples,
        prtTrackMap: posEntry.map(e => e.pattern),
        prtTransposeMap: posEntry.map(e => e.transpose),
      },
    };
  });

  // ── Read instrument/sample names ─────────────────────────────────────
  // Build a shared pretracker config that all instruments reference.
  // Wave/instrument data will be populated from the WASM engine after load.
  const prtConfig: PreTrackerConfig = {
    waves: [],
    instruments: [],
    waveNames: [],
    instrumentNames: [],
    numPositions: meta.numPositions,
    numSteps: meta.rowsPerPattern,
    subsongCount: meta.subsongCount,
    title: meta.songName,
    author: '',
  };

  const instruments: InstrumentConfig[] = [];
  if (meta.numSamples > 0) {
    let nameOff = meta.sampleNamesOffset;
    for (let i = 0; i < meta.numSamples && nameOff < buffer.byteLength; i++) {
      const name = readNullString(v, nameOff, 64);
      nameOff += name.length + 1;
      instruments.push({
        id: i + 1,
        name: name || `Instrument ${i + 1}`,
        type: 'synth' as const,
        synthType: 'PreTrackerSynth' as const,
        effects: [],
        volume: 0,
        pan: 0,
        pretracker: prtConfig,
      } as unknown as InstrumentConfig);
    }
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Instrument 1',
      type: 'synth' as const,
      synthType: 'PreTrackerSynth' as const,
      effects: [],
      volume: 0,
      pan: 0,
      pretracker: prtConfig,
    } as unknown as InstrumentConfig);
  }

  // Song positions: one per order entry (each is already a composite pattern)
  const songPositions = patterns.map((_, i) => i);

  return {
    name: `${baseName} [PreTracker]`,
    format: 'PreTracker' as TrackerFormat,
    patterns: patterns.length > 0 ? patterns : [{
      id: 'pattern-0',
      name: 'Pattern 0',
      length: meta.rowsPerPattern,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null, color: null,
        rows: Array.from({ length: meta.rowsPerPattern }, () => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat: 'PreTracker' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: 0,
        originalInstrumentCount: 0,
      },
    }],
    instruments,
    songPositions: songPositions.length > 0 ? songPositions : [0],
    songLength: songPositions.length || 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    preTrackerFileData: buffer.slice(0),
  };
}
