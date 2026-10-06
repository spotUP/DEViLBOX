/**
 * SidMon1Parser.ts — SidMon 1.0 format parser
 *
 * Parses SidMon 1.0 (.sid1/.smn) files as documented in FlodJS S1Player.js
 * by Christian Corti (Neoart Costa Rica).
 *
 * Format detection:
 *   Scans for 0x41fa magic followed by the 32-byte SID-MON string:
 *   " SID-MON BY R.v.VLIET  (c) 1988 "
 *
 * Instrument extraction follows S1Player.js loader():
 *   - Reads instrument records from position + j (from header offsets)
 *   - Each record: waveform(uint32), arpeggio[16], ADSR fields, phaseShift, etc.
 *   - 32-byte waveforms stored in mixer memory at position + waveformStart
 *
 * Reference: FlodJS S1Player.js by Christian Corti, Neoart Costa Rica (2012)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import type { SidMon1Config, UADEChipRamInfo } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeSidMon1Cell, sm1IndexToXM, xmToSm1Index } from '@/engine/uade/encoders/SidMon1Encoder';
import { walkSidMon1, type Sm1Cell, type Sm1RawRow, type Sm1Track } from './sidmon1Grid';

// ── Binary read helpers ───────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  if (off >= buf.length) return 0;
  return buf[off] & 0xFF;
}

function s8(buf: Uint8Array, off: number): number {
  const v = u8(buf, off);
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return ((buf[off] & 0xFF) << 8) | (buf[off + 1] & 0xFF);
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return ((buf[off] & 0xFF) * 0x1000000) +
         ((buf[off + 1] & 0xFF) << 16) +
         ((buf[off + 2] & 0xFF) << 8) +
          (buf[off + 3] & 0xFF);
}

function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    if (off + i >= buf.length) break;
    s += String.fromCharCode(buf[off + i]);
  }
  return s;
}

// ── SidMon 1.0 period table (for note mapping, verbatim from S1Player.js) ────
// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Detect whether the buffer contains a SidMon 1.0 module.
 * Scans for 0x41fa followed (eventually) by the SID-MON string.
 */
export function isSidMon1Format(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 64) return false;
  const buf = new Uint8Array(buffer);

  // Scan for 0x41fa magic
  for (let i = 0; i < buf.length - 40; i++) {
    if (buf[i] === 0x41 && buf[i + 1] === 0xfa) {
      // Read the offset to position
      const j = u16BE(buf, i + 2);
      // Check for 0xd1e8 at i+4
      if (i + 6 < buf.length && u16BE(buf, i + 4) === 0xd1e8) {
        const start = u16BE(buf, i + 6);
        if (start === 0xffd4) {
          // S1Player computes position = j + stream.position - 6
          // After reading 4 shorts (8 bytes from i), stream.position = i + 8
          // position = j + (i + 8) - 6 = j + i + 2
          const position = j + i + 2;
          if (position >= 0 && position + 32 <= buf.length) {
            const id = readString(buf, position, 32);
            if (id === ' SID-MON BY R.v.VLIET  (c) 1988 ') {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a SidMon 1.0 (.sid1, .smn) file into a TrackerSong.
 * Extracts instrument data using the S1Player.js loader logic.
 *
 * @param moduleBase - Chip RAM address where the module binary starts (0 if unknown).
 *                     SidMon 1 is a compiled Amiga binary that may not load at 0x000000.
 *                     Use UADEEngine.scanMemoryForMagic to find the actual base address.
 */
export function parseSidMon1File(buffer: ArrayBuffer, filename: string, moduleBase = 0): TrackerSong {
  const buf = new Uint8Array(buffer);

  // ── Locate position marker (same logic as S1Player loader) ────────────────
  let position = -1;
  let j = 0;

  for (let i = 0; i < buf.length - 10; i++) {
    if (buf[i] === 0x41 && buf[i + 1] === 0xfa) {
      j = u16BE(buf, i + 2);
      if (i + 6 >= buf.length) continue;

      const d1e8 = u16BE(buf, i + 4);
      if (d1e8 !== 0xd1e8) continue;

      const startCode = u16BE(buf, i + 6);
      if (startCode === 0xffd4) {
        // position = j + stream.position - 6
        // stream.position after reading start (6 bytes from i) = i + 8
        // But S1Player reads: start=stream.readUshort() (i), j=stream.readUshort() (i+2),
        //   start2=stream.readUshort() (i+4), start3=stream.readUshort() (i+6)
        // After reading 4 shorts (8 bytes), stream.position = i + 8
        // position = j + (i+8) - 6 = j + i + 2
        position = j + i + 2;
        break;
      }
    }
  }

  if (position < 0 || position + 32 > buf.length) {
    throw new Error('SidMon 1 format marker not found');
  }

  // Verify SID-MON string at position
  const idStr = readString(buf, position, 32);
  if (idStr !== ' SID-MON BY R.v.VLIET  (c) 1988 ') {
    throw new Error(`SidMon 1 ID string mismatch: "${idStr}"`);
  }

  // ── Read instrument section offsets ──────────────────────────────────────
  // S1Player: stream.position = position - 28; j = stream.readUint()
  //   totInstruments = (stream.readUint() - j) >> 5
  if (position - 28 < 0 || position - 24 < 0) {
    throw new Error('SidMon 1 file too small to read instrument offsets');
  }

  const instrBase = u32BE(buf, position - 28);   // start of instruments data
  const instrEnd  = u32BE(buf, position - 24);   // end of instruments (exclusive)
  let totInstruments = (instrEnd - instrBase) >> 5;
  if (totInstruments > 63) totInstruments = 63;
  const len = totInstruments + 1;

  // ── Read waveform section ────────────────────────────────────────────────
  // S1Player: stream.position = position - 24; start = stream.readUint()
  //           totWaveforms = stream.readUint() - start → byte count
  //           totWaveforms >>= 5  (convert to count)
  const waveStart = position - 24 >= 4 ? u32BE(buf, position - 24) : 0;
  const waveEnd   = position - 20 >= 4 ? u32BE(buf, position - 20) : waveStart;
  const waveByteCount = waveEnd - waveStart;
  const totWaveforms = waveByteCount >> 5;

  // Read waveform data: mixer.store reads from stream into memory buffer.
  // Waveforms are located at position + waveStart in the file.
  const waveformDataOffset = position + waveStart;
  const waveformData: Int8Array[] = [];
  for (let w = 0; w < totWaveforms; w++) {
    const woff = waveformDataOffset + w * 32;
    const wave = new Int8Array(32);
    if (woff + 32 <= buf.length) {
      for (let b = 0; b < 32; b++) {
        wave[b] = (buf[woff + b] & 0xFF) < 128
          ? (buf[woff + b] & 0xFF)
          : (buf[woff + b] & 0xFF) - 256;
      }
    }
    waveformData.push(wave);
  }

  // ── Pre-compute section file offsets (needed for chip RAM info on each instrument) ──
  // These mirror the offsets computed later when parsing patterns/tracks; computing
  // them here avoids forward references inside the instrument loop below.
  const _patStart       = position - 12 >= 0 ? u32BE(buf, position - 12) : 0;
  const _patDataOffset  = position + _patStart;
  const _trackBase      = position - 44 >= 0 ? u32BE(buf, position - 44) : 0;
  const _trackDataOffset = position + _trackBase;

  // ── Parse instruments ─────────────────────────────────────────────────────
  // stream.position = position + instrBase (= position + j)
  const instruments: InstrumentConfig[] = [];
  const instrDataOffset = position + instrBase;

  for (let i = 1; i < len; i++) {
    const base = instrDataOffset + (i - 1) * 32;
    if (base + 32 > buf.length) break;

    // S1Player reads (each is a 32-byte record per instrument):
    // But wait - S1Player instrument records are READ SEQUENTIALLY from stream
    // starting at position + j. Each instrument has: waveform(4)+arpeggio(16)+fields(12)=32 bytes

    const waveform    = u32BE(buf, base);       // uint32
    const arpeggio    = new Array<number>(16);
    for (let k = 0; k < 16; k++) {
      arpeggio[k] = u8(buf, base + 4 + k);
    }

    const attackSpeed  = u8(buf, base + 20);
    const attackMax    = u8(buf, base + 21);
    const decaySpeed   = u8(buf, base + 22);
    const decayMin     = u8(buf, base + 23);
    const sustain      = u8(buf, base + 24);
    // skip 1 byte at base + 25
    const releaseSpeed = u8(buf, base + 26);
    const releaseMin   = u8(buf, base + 27);
    const phaseShift   = u8(buf, base + 28);
    const phaseSpeed   = u8(buf, base + 29);
    let   finetune     = u8(buf, base + 30);
    const pitchFall    = s8(buf, base + 31);

    // Finetune: if > 15, set to 0; else multiply by 67
    if (finetune > 15) finetune = 0;
    const finetuneVal = finetune * 67;

    // phaseShift > totWaveforms = disable
    let actualPhaseShift = phaseShift;
    if (phaseShift > totWaveforms) {
      actualPhaseShift = 0;
    }

    // Determine mainWave data
    let mainWave = new Array<number>(32).fill(0);
    if (waveform <= 15 && waveform < waveformData.length) {
      // waveform index → 32-byte waveform from memory
      mainWave = Array.from(waveformData[waveform]);
    } else if (waveform < waveformData.length) {
      mainWave = Array.from(waveformData[waveform]);
    }
    // If waveform > 15 it's a PCM sample reference — use first waveform as fallback
    if (mainWave.every(v => v === 0) && waveformData.length > 0) {
      mainWave = Array.from(waveformData[0]);
    }

    // Determine phaseWave data
    let phaseWave = new Array<number>(32).fill(0);
    if (actualPhaseShift > 0 && actualPhaseShift < waveformData.length) {
      phaseWave = Array.from(waveformData[actualPhaseShift]);
    }

    const sm1Config: SidMon1Config = {
      arpeggio,
      attackSpeed,
      attackMax,
      decaySpeed,
      decayMin,
      sustain,
      releaseSpeed,
      releaseMin,
      phaseShift: actualPhaseShift,
      phaseSpeed,
      finetune: finetuneVal,
      pitchFall,
      mainWave,
      phaseWave,
    };

    const chipRam: UADEChipRamInfo = {
      moduleBase,
      moduleSize: buffer.byteLength,
      instrBase: moduleBase + base,
      instrSize: 32,
      sections: {
        position:    moduleBase + position,
        waveData:    moduleBase + waveformDataOffset,
        patternData: moduleBase + _patDataOffset,
        trackData:   moduleBase + _trackDataOffset,
      },
    };

    instruments.push({
      id: i,
      name: `SM1 ${i}`,
      type: 'synth' as const,
      synthType: 'SidMon1Synth' as const,
      sidmon1: sm1Config,
      uadeChipRam: chipRam,
      effects: [],
      volume: -6,
      pan: 0,
    } as InstrumentConfig);
  }

  // Ensure at least one instrument
  if (instruments.length === 0) {
    instruments.push(makeDefaultInstrument(1));
  }

  // ── Parse patterns ────────────────────────────────────────────────────────
  // S1Player: stream.position = position - 12; start = stream.readUint()
  //   len = ((stream.readUint() - start) / 5) >> 0
  // Each pattern row is 5 bytes: note, sample, effect, param, speed
  const patStart  = position - 12 >= 0 ? u32BE(buf, position - 12) : 0;
  const patEnd    = position - 8  >= 0 ? u32BE(buf, position - 8)  : patStart;
  const numPatRows = Math.min(65536, Math.max(0, Math.floor((patEnd - patStart) / 5)));
  const patDataOffset = position + patStart;

  // The versions whose note/effect/sample bytes the player remaps on load.
  const versionTag = j === 0x0FEC ? 0x0FFA : j === 0x1466 ? 0x1444 : j;
  const doReset = !(versionTag === 0x1170 || versionTag === 0x11C6 || versionTag === 0x1444);

  const rawRows: Uint8Array[] = [];
  const patRows: Sm1RawRow[] = [];
  for (let i = 0; i < numPatRows; i++) {
    const base = patDataOffset + i * 5;
    if (base + 5 > buf.length) break;
    const raw = buf.slice(base, base + 5);
    rawRows.push(raw);
    patRows.push(playerRow(raw, versionTag, totInstruments));
  }

  // ── Read tracks ───────────────────────────────────────────────────────────
  const trackBase = position - 44 >= 0 ? u32BE(buf, position - 44) : 0;
  const trackEnd2 = position - 28 >= 0 ? u32BE(buf, position - 28) : trackBase;
  const numTracks = Math.min(16384, Math.max(0, Math.floor((trackEnd2 - trackBase) / 6)));

  const tracks: Sm1Track[] = [];
  const trackDataOffset = position + trackBase;
  for (let i = 0; i < numTracks; i++) {
    const base = trackDataOffset + i * 6;
    if (base + 6 > buf.length) break;
    const transpose = s8(buf, base + 5);
    tracks.push({ pattern: u32BE(buf, base), transpose: (transpose >= -99 && transpose <= 99) ? transpose : 0 });
  }

  // ── Pattern start rows, as the player reads them ──────────────────────────
  // Entry 0 is the empty first entry (the player skips the file's first
  // pointer); the list ends at the first zero start.
  const ppBase = position - 8 >= 0 ? u32BE(buf, position - 8) : 0;
  const ppEnd  = position - 4 >= 0 ? u32BE(buf, position - 4) : ppBase;
  const ppLen  = ppEnd < ppBase ? buf.length - position : ppEnd;
  let totPatterns = Math.min(4096, Math.max(1, (ppLen - ppBase) >> 2));
  const patternPtrs: number[] = new Array(totPatterns).fill(0);
  for (let i = 1; i < totPatterns; i++) {
    const poff = position + ppBase + 4 + (i - 1) * 4;
    const start = poff + 4 <= buf.length ? Math.floor(u32BE(buf, poff) / 5) : 0;
    if (start === 0) { totPatterns = i; patternPtrs.length = i; break; }
    patternPtrs[i] = start;
  }

  // Each voice's first track (the player's tracksPtr).
  const tracksPtr: number[] = [0, 0, 0, 0];
  for (let v = 1; v < 4; v++) {
    const tpOff = position - 44 + v * 4;
    if (tpOff >= 0 && tpOff + 4 <= buf.length) {
      tracksPtr[v] = Math.floor((u32BE(buf, tpOff) - trackBase) / 6);
    }
  }

  // ── The grid is the rows the player walks ─────────────────────────────────
  const hdrOff = position + waveEnd;
  const steps = walkSidMon1({
    rows: patRows, tracks, tracksPtr, patternPtrs,
    patternDef: u32BE(buf, hdrOff + 24),
    trackLen: u32BE(buf, hdrOff + 28),
    doReset,
  });
  const CHANNELS = 4;
  const trackerPatterns: Pattern[] = [];

  steps.forEach((step, stepIdx) => {
    const channelRows: TrackerCell[][] = [[], [], [], []];
    for (let ch = 0; ch < CHANNELS; ch++) {
      for (let g = 0; g < step.length; g++) {
        const c = step.cells[ch][g];
        channelRows[ch].push(c.row < 0 ? emptyCell() : gridCell(rawRows[c.row], patRows[c.row], tracks[c.track].transpose));
      }
    }
    trackerPatterns.push({
      id: `pattern-${stepIdx}`,
      name: `Pattern ${stepIdx}`,
      length: step.length,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: CHANNELS,
        originalPatternCount: steps.length,
        originalInstrumentCount: instruments.length,
      },
    });
  });

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename, instruments.length));
  }
  const songSteps = trackerPatterns.length;
  const maxRows = Math.max(1, ...steps.map((s) => s.length));

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  // The file offset of the module row a grid cell shows, or -1 for a cell
  // inside a long row (the player consumes no row there).
  const cellRow = (pattern: number, row: number, channel: number): Sm1Cell | undefined =>
    steps[pattern]?.cells[channel]?.[row];
  const rowOffset = (c: Sm1Cell | undefined): number =>
    !c || c.row < 0 ? -1 : patDataOffset + c.row * 5;

  // Edits land in this working copy of the module: a cell write keeps the
  // effect and speed bytes the grid has no field for.
  const working = new Uint8Array(buffer.slice(0));

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'sidmon1',
    patternDataFileOffset: patDataOffset,
    bytesPerCell: 5,
    rowsPerPattern: maxRows,
    numChannels: CHANNELS,
    numPatterns: songSteps,
    moduleSize: buffer.byteLength,
    encodeCell: encodeSidMon1Cell,
    decodeCell: (raw: Uint8Array): TrackerCell => gridCell(raw, playerRow(raw, versionTag, totInstruments), 0),
    getCellFileOffset: (pattern: number, row: number, channel: number): number =>
      rowOffset(cellRow(pattern, row, channel)),
    // A note edit is the track's transpose away from the byte the row holds.
    writeCell: (pattern, row, channel, cell) => {
      const c = cellRow(pattern, row, channel);
      const off = rowOffset(c);
      if (!c || off < 0) return [];
      const bytes = working.slice(off, off + 5);
      const shown = gridCell(bytes, playerRow(bytes, versionTag, totInstruments), tracks[c.track].transpose);
      if ((cell.note ?? 0) !== shown.note) {
        const note = cell.note ?? 0;
        if (note === 0) bytes[0] = 0;
        else {
          const raw = xmToSm1Index(note) - tracks[c.track].transpose;
          if (raw < 1 || raw > 254) return [];
          bytes[0] = raw;
        }
      }
      if ((cell.instrument ?? 0) !== shown.instrument) bytes[1] = (cell.instrument ?? 0) & 0xFF;
      working.set(bytes, off);
      return [{ offset: off, bytes }];
    },
  };

  return {
    name: `${moduleName} [SidMon 1.0]`,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout,
    sidmon1WasmFileData: buffer.slice(0),
  };
}

// ── Cells ─────────────────────────────────────────────────────────────────────

/** A pattern row as the player holds it: the loader's version remaps applied. */
function playerRow(raw: Uint8Array, versionTag: number, totInstruments: number): Sm1RawRow {
  let note = raw[0], sample = raw[1], effect = raw[2];
  if (versionTag === 0x1444) {
    if (note > 0 && note < 255) note = (note + 469) & 0xff;
    if (effect > 0 && effect < 255) effect = (effect + 469) & 0xff;
    if (sample > 59) sample = (totInstruments + (sample - 60)) & 0xff;
  } else if (sample > totInstruments) {
    sample = 0;
  }
  return { note, sample, effect, param: raw[3], speed: raw[4] };
}

/**
 * The grid cell of a module row. The note is the one the player plays: the
 * row's note plus the track's transpose, which is the period index (the
 * replayer writes PERIODS[finetune + arpeggio + note] on every tick). The five raw
 * bytes ride in the period/pan/cutoff/resonance carriers (fields the grid
 * never sets), so an unedited cell encodes back byte-exact.
 */
function gridCell(raw: Uint8Array, row: Sm1RawRow, transpose: number): TrackerCell {
  const playsNote = row.note > 0 && row.note < 255;
  // Effects only act on a note row. 2 sets the speed; any other non-zero
  // effect other than 3 (pattern length) is a bend: the pitch slides from the
  // row's note to note `effect + transpose` at `param` (portamento).
  let effTyp = 0;
  if (playsNote && row.effect === 2) effTyp = 0x0F;
  else if (playsNote && row.effect !== 0 && row.effect !== 3) effTyp = 0x03;
  return {
    note: playsNote ? sm1IndexToXM(row.note + transpose) : 0,
    instrument: row.sample, volume: 0,
    effTyp, eff: effTyp ? row.param : 0, effTyp2: 0, eff2: 0,
    period: (raw[0] << 8) | raw[1], pan: raw[2], cutoff: raw[3], resonance: raw[4],
  };
}

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

// ── Helper functions ──────────────────────────────────────────────────────────

function makeDefaultInstrument(id: number): InstrumentConfig {
  return {
    id,
    name: `SM1 ${id}`,
    type: 'synth' as const,
    synthType: 'SidMon1Synth' as const,
    sidmon1: {
      arpeggio: new Array(16).fill(0),
      attackSpeed: 8,
      attackMax: 64,
      decaySpeed: 4,
      decayMin: 32,
      sustain: 0,
      releaseSpeed: 4,
      releaseMin: 0,
      phaseShift: 0,
      phaseSpeed: 0,
      finetune: 0,
      pitchFall: 0,
      mainWave: [
        127, 100, 71, 41, 9, -22, -53, -82, -108, -127, -127, -127,
        -108, -82, -53, -22, 9, 41, 71, 100, 127, 100, 71, 41,
        9, -22, -53, -82, -108, -127, -127, -127,
      ],
      phaseWave: new Array(32).fill(0),
    },
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig;
}

function createEmptyPattern(filename: string, instrumentCount: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 16,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 16 }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 0,
      originalInstrumentCount: instrumentCount,
    },
  };
}
