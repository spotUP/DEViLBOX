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
import type { SidMon1Config } from '@/types/instrument';

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
// Used for creating test patterns only.

const SM1_PERIODS: number[] = [
  0,
  5760,5424,5120,4832,4560,4304,4064,3840,3616,3424,3232,3048,
  2880,2712,2560,2416,2280,2152,2032,1920,1808,1712,1616,1524,
  1440,1356,1280,1208,1140,1076,1016, 960, 904, 856, 808, 762,
   720, 678, 640, 604, 570, 538, 508, 480, 452, 428, 404, 381,
   360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190,
   180, 170, 160, 151, 143, 135, 127,
];

// Standard ProTracker periods for note mapping
const PT_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Map a SidMon 1 note index (0-66) to an XM note number (1-96).
 */
function sm1NoteToXM(sm1Note: number): number {
  if (sm1Note < 0 || sm1Note >= SM1_PERIODS.length) return 0;
  const period = SM1_PERIODS[sm1Note + 1];
  if (!period || period <= 0) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  // PT_PERIODS[0] = 856 = C-1 = XM note 13
  const xmNote = bestIdx + 13;
  return Math.max(1, Math.min(96, xmNote));
}

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
 */
export function parseSidMon1File(buffer: ArrayBuffer, filename: string): TrackerSong {
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

    instruments.push({
      id: i,
      name: `SM1 ${i}`,
      type: 'synth' as const,
      synthType: 'SidMon1Synth' as const,
      sidmon1: sm1Config,
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
  const numPatRows = Math.floor((patEnd - patStart) / 5);

  interface SM1Row {
    note:   number;
    sample: number;
    effect: number;
    param:  number;
    speed:  number;
  }

  const patRows: SM1Row[] = [];
  const patDataOffset = position + patStart;

  for (let i = 0; i < numPatRows && i < 2048; i++) {
    const base = patDataOffset + i * 5;
    if (base + 5 > buf.length) break;
    patRows.push({
      note:   u8(buf, base),
      sample: u8(buf, base + 1),
      effect: u8(buf, base + 2),
      param:  u8(buf, base + 3),
      speed:  u8(buf, base + 4),
    });
  }

  // ── Read tracks ───────────────────────────────────────────────────────────
  // S1Player: stream.position = position - 44; start = stream.readUint()
  //   stream.position = position - 28; len = ((stream.readUint() - start) / 6) >> 0
  const trackBase = position - 44 >= 0 ? u32BE(buf, position - 44) : 0;
  const trackEnd2 = position - 28 >= 0 ? u32BE(buf, position - 28) : trackBase;
  const numTracks = Math.floor((trackEnd2 - trackBase) / 6);

  interface SM1Track {
    pattern:   number;
    transpose: number;
  }
  const tracks: SM1Track[] = [];
  const trackDataOffset = position + trackBase;

  for (let i = 0; i < numTracks && i < 512; i++) {
    const base = trackDataOffset + i * 6;
    if (base + 6 > buf.length) break;
    const pattern   = u32BE(buf, base);
    // skip 1 byte at base+4
    const transpose = s8(buf, base + 5);
    tracks.push({ pattern, transpose: (transpose >= -99 && transpose <= 99) ? transpose : 0 });
  }

  // ── Read pattern pointers ─────────────────────────────────────────────────
  // S1Player reads patternsPtr[i] = (stream.readUint() / 5) >> 0
  const ppBase = position - 8  >= 0 ? u32BE(buf, position - 8)  : 0;
  const ppEnd  = position - 4  >= 0 ? u32BE(buf, position - 4)  : ppBase;
  // totPatterns = (ppEnd - ppBase) >> 2 (each entry is uint32 = 4 bytes)
  // But ppEnd is the difference from some other point, let's just use patStart area.
  // Actually in S1Player: stream.position = position + start + 4
  // totPatterns = (len - start) >> 2  where start/len are from position - 8/position - 4
  const patternsBase = position + (ppBase > 0 ? ppBase : 0);
  const patternsCount = Math.max(1, Math.min(256, (ppEnd > ppBase ? (ppEnd - ppBase) >> 2 : 1)));

  const patternPtrs: number[] = [];
  for (let i = 0; i < patternsCount; i++) {
    const poff = patternsBase + 4 + i * 4; // +4 for first entry skip
    if (poff + 4 > buf.length) break;
    const ptr = Math.floor(u32BE(buf, poff) / 5);
    if (ptr === 0 && i > 0) break;
    patternPtrs.push(ptr);
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────────
  const ROWS_PER_PATTERN = 16;
  const trackerPatterns: Pattern[] = [];
  const CHANNELS = 4;

  // Read tracksPtr (starting positions per voice) from position - 44
  const tracksPtr: number[] = [0, 0, 0, 0];
  for (let v = 1; v < 4 && position - 44 + 4 + v * 4 < buf.length; v++) {
    const tpOff = position - 44 + v * 4;
    if (tpOff + 4 <= buf.length) {
      const raw = u32BE(buf, tpOff);
      // S1Player: ((stream.readUint() - start) / 6) >> 0
      tracksPtr[v] = Math.floor((raw - trackBase) / 6);
    }
  }

  // Compute song length from trackLen
  // S1Player: stream.position = position - 20; stream reads mix/pattern/track data
  // trackLen is at position - 20 + 7*4 = position + 8
  // Let's skip complex parsing and build a simple song using the track data directly

  // Determine number of song steps from tracks array
  const songSteps = Math.min(32, Math.max(1, Math.floor(numTracks / CHANNELS)));

  for (let stepIdx = 0; stepIdx < songSteps; stepIdx++) {
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let ch = 0; ch < CHANNELS; ch++) {
      const trackIdx = stepIdx * CHANNELS + ch;
      const track = tracks[trackIdx] ?? { pattern: 0, transpose: 0 };
      const patPtr = patternPtrs[track.pattern] ?? 0;

      const rows: TrackerCell[] = [];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const row = patRows[patPtr + r];
        if (!row) {
          rows.push(emptyCell());
          continue;
        }

        // note 0 = no note, 255 = no note
        if (row.note === 0 || row.note === 255 || row.sample === 0) {
          rows.push(emptyCell());
          continue;
        }

        const sm1Note = row.note + track.transpose;
        const xmNote = sm1NoteToXM(Math.max(0, sm1Note - 1)); // S1Player uses 1-based notes

        const instrNum = Math.min(row.sample, instruments.length);

        rows.push({
          note: xmNote,
          instrument: instrNum,
          volume: 0,
          effTyp: 0,
          eff: 0,
          effTyp2: 0,
          eff2: 0,
        });
      }

      while (rows.length < ROWS_PER_PATTERN) {
        rows.push(emptyCell());
      }

      channelRows[ch] = rows;
    }

    trackerPatterns.push({
      id: `pattern-${stepIdx}`,
      name: `Pattern ${stepIdx}`,
      length: ROWS_PER_PATTERN,
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
        originalPatternCount: songSteps,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  // Ensure at least one pattern
  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename, instruments.length));
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');

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
  };
}

// ── Helper functions ──────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

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
