/**
 * InStereo1Parser.ts — InStereo! 1.0 native parser
 *
 * InStereo! 1.0 (also called ISM 1.2) is a 4-channel Amiga tracker with
 * synth-based instruments (waveforms + ADSR + EGC) and PCM sample playback.
 *
 * Reference: NostalgicPlayer InStereo10Worker.cs (authoritative loader/replayer)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/InStereo!/
 *
 * File layout (all big-endian after the 8-byte magic):
 *   Offset  8: uint16 totalNumberOfPositions
 *   Offset 10: uint16 totalNumberOfTrackRows
 *   Offset 12: 4 bytes reserved
 *   Offset 16: uint8 numberOfSamples
 *   Offset 17: uint8 numberOfWaveforms
 *   Offset 18: uint8 numberOfInstruments
 *   Offset 19: uint8 numberOfSubSongs
 *   Offset 20: uint8 numberOfEnvelopeGeneratorTables
 *   Offset 21: uint8 numberOfAdsrTables
 *   Offset 22: 14 bytes reserved
 *   Offset 36: moduleName (28 bytes Amiga string)
 *   Offset 64: 140 bytes reserved (text/padding)
 *   Offset 204: sample info (numberOfSamples × 28 bytes: [1 reserved, 23 name, 4 reserved])
 *   After sample info: sample lengths (numberOfSamples × uint32)
 *   After lengths: EGC tables (numberOfEnvelopeGeneratorTables × 128 bytes)
 *   After EGC: ADSR tables (numberOfAdsrTables × 256 bytes)
 *   After ADSR: instrument info (numberOfInstruments × ~20 bytes each)
 *   After instruments: arpeggio tables (16 × 16 bytes = 256 bytes)
 *   After arpeggio: sub-song info (numberOfSubSongs × 16 bytes)
 *   After sub-song: 14 bytes extra sub-song padding
 *   After padding: waveforms (numberOfWaveforms × 256 signed bytes)
 *   After waveforms: positions (totalNumberOfPositions × 4 channels × 4 bytes)
 *   After positions: track rows ((totalNumberOfTrackRows + 64) × 4 bytes)
 *   After track rows: sample PCM data
 *
 * Magic: "ISM!V1.2" at offset 0. Minimum file size: 204 bytes.
 * Extensions: .is, .is10
 *
 * Note mapping: same Amiga period table as Sonic Arranger (identical Tables.cs).
 *   noteIndex + 12 → XM note number (index 49 = period 856 = XM note 61 = C-5)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ──────────────────────────────────────────────────────────────

const PAL_CLOCK = 3546895;

/**
 * IS10 period table (109 entries, index 0 = 0 silence).
 * Identical to SonicArranger Tables.Periods.
 */
const IS10_PERIODS = [
  0,
  13696, 12928, 12192, 11520, 10848, 10240,  9664,  9120,  8608,  8128,  7680,  7248,
   6848,  6464,  6096,  5760,  5424,  5120,  4832,  4560,  4304,  4064,  3840,  3624,
   3424,  3232,  3048,  2880,  2712,  2560,  2416,  2280,  2152,  2032,  1920,  1812,
   1712,  1616,  1524,  1440,  1356,  1280,  1208,  1140,  1076,  1016,   960,   906,
    856,   808,   762,   720,   678,   640,   604,   570,   538,   508,   480,   453,
    428,   404,   381,   360,   339,   320,   302,   285,   269,   254,   240,   226,
    214,   202,   190,   180,   170,   160,   151,   143,   135,   127,   120,   113,
    107,   101,    95,    90,    85,    80,    75,    71,    67,    63,    60,    56,
     53,    50,    47,    45,    42,    40,    37,    35,    33,    31,    30,    28,
];

const EGC_TABLE_LEN  = 128;
const ADSR_TABLE_LEN = 256;
const ARPEGGIO_TABLE_LEN = 16;

// ── Utility ────────────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number { return buf[off]; }
function u16BE(buf: Uint8Array, off: number): number { return (buf[off] << 8) | buf[off + 1]; }
function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}
function s8(v: number): number { return v < 128 ? v : v - 256; }

function readString(buf: Uint8Array, off: number, len: number): string {
  let str = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str.trim();
}

/** Convert IS10 period-table note index to XM note number */
function is10NoteToXm(noteIndex: number): number {
  if (noteIndex <= 0 || noteIndex >= IS10_PERIODS.length) return 0;
  return Math.min(96, noteIndex + 12);
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` is an InStereo! 1.0 module.
 * Checks for "ISM!V1.2" magic at offset 0 and minimum file size 204.
 */
export function isInStereo1Format(bytes: Uint8Array): boolean {
  if (bytes.length < 204) return false;
  return (
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x53 && // 'S'
    bytes[2] === 0x4d && // 'M'
    bytes[3] === 0x21 && // '!'
    bytes[4] === 0x56 && // 'V'
    bytes[5] === 0x31 && // '1'
    bytes[6] === 0x2e && // '.'
    bytes[7] === 0x32    // '2'
  );
}

// ── Internal types ─────────────────────────────────────────────────────────

interface IS10SongInfo {
  startSpeed: number;
  rowsPerTrack: number;
  firstPosition: number;
  lastPosition: number;
  restartPosition: number;
}

interface IS10Position {
  startTrackRow: number;
  soundTranspose: number;
  noteTranspose: number;
}

interface IS10TrackLine {
  note: number;
  instrument: number;
  arpeggio: number;
  effect: number;
  effectArg: number;
}

interface IS10Instrument {
  waveformNumber: number;
  synthesisEnabled: boolean;
  waveformLength: number;
  repeatLength: number;
  volume: number;
  portamentoSpeed: number;
  adsrEnabled: boolean;
  adsrTableNumber: number;
  adsrTableLength: number;
  portamentoEnabled: boolean;
  vibratoDelay: number;
  vibratoSpeed: number;
  vibratoLevel: number;
  egcOffset: number;
  egcMode: number;
  egcTableNumber: number;
  egcTableLength: number;
}

interface IS10Sample {
  name: string;
  length: number;
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse an InStereo! 1.0 module file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseInStereo1File(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isInStereo1Format(bytes)) return null;

  // ── Header at offset 8 ───────────────────────────────────────────────
  let off = 8;
  const totalNumberOfPositions = u16BE(bytes, off); off += 2;
  const totalNumberOfTrackRows = u16BE(bytes, off); off += 2;

  off += 4; // reserved

  const numberOfSamples                  = u8(bytes, off++);
  const numberOfWaveforms                = u8(bytes, off++);
  const numberOfInstruments              = u8(bytes, off++);
  const numberOfSubSongs                 = u8(bytes, off++);
  const numberOfEnvelopeGeneratorTables  = u8(bytes, off++);
  const numberOfAdsrTables               = u8(bytes, off++);

  off += 14; // reserved

  const moduleName = readString(bytes, off, 28); off += 28;

  off += 140; // skip extra text

  // ── Sample info: numberOfSamples × 28 bytes ─────────────────────────
  // Each entry: [1 reserved, 23 name, 4 reserved] = 28 bytes
  const samplesInfo: IS10Sample[] = [];
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 28 > bytes.length) return null;
    off += 1; // reserved
    const name = readString(bytes, off, 23); off += 23;
    off += 4; // reserved
    samplesInfo.push({ name, length: 0 });
  }

  // Sample lengths: numberOfSamples × uint32
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 4 > bytes.length) return null;
    samplesInfo[i].length = u32BE(bytes, off); off += 4;
  }

  // ── EGC tables: numberOfEnvelopeGeneratorTables × EGC_TABLE_LEN bytes
  const egcTablesOff = off;
  off += numberOfEnvelopeGeneratorTables * EGC_TABLE_LEN;

  // ── ADSR tables: numberOfAdsrTables × ADSR_TABLE_LEN bytes ──────────
  const adsrTablesOff = off;
  off += numberOfAdsrTables * ADSR_TABLE_LEN;

  // ── Instrument info: numberOfInstruments × ~20 bytes each ───────────
  // Per InStereo10Worker.cs Load() method:
  //   WaveformNumber (1), SynthesisEnabled (1), WaveformLength (2), RepeatLength (2),
  //   Volume (1), PortamentoSpeed (s1), AdsrEnabled (1), AdsrTableNumber (1),
  //   AdsrTableLength (2), [2 skip], PortamentoEnabled (1), [5 skip],
  //   VibratoDelay (1), VibratoSpeed (1), VibratoLevel (1),
  //   EGCOffset (1), EGCMode (1), EGCTableNumber (1), EGCTableLength (2)
  // Total = 1+1+2+2+1+1+1+1+2+2+1+5+1+1+1+1+1+1+2 = 28 bytes
  const instruments: IS10Instrument[] = [];
  for (let i = 0; i < numberOfInstruments; i++) {
    if (off + 28 > bytes.length) return null;
    const waveformNumber   = u8(bytes, off++);
    const synthesisEnabled = u8(bytes, off++) !== 0;
    const waveformLength   = u16BE(bytes, off); off += 2;
    const repeatLength     = u16BE(bytes, off); off += 2;
    const volume           = u8(bytes, off++);
    const portamentoSpeed  = s8(bytes[off++]);
    const adsrEnabled      = u8(bytes, off++) !== 0;
    const adsrTableNumber  = u8(bytes, off++);
    const adsrTableLength  = u16BE(bytes, off); off += 2;
    off += 2; // skip
    const portamentoEnabled = u8(bytes, off++) !== 0;
    off += 5; // skip
    const vibratoDelay  = u8(bytes, off++);
    const vibratoSpeed  = u8(bytes, off++);
    const vibratoLevel  = u8(bytes, off++);
    const egcOffset     = u8(bytes, off++);
    const egcMode       = u8(bytes, off++);
    const egcTableNumber= u8(bytes, off++);
    const egcTableLength= u16BE(bytes, off); off += 2;

    instruments.push({
      waveformNumber, synthesisEnabled, waveformLength, repeatLength, volume,
      portamentoSpeed: portamentoSpeed, adsrEnabled, adsrTableNumber, adsrTableLength,
      portamentoEnabled, vibratoDelay, vibratoSpeed, vibratoLevel,
      egcOffset, egcMode, egcTableNumber, egcTableLength,
    });
  }

  // ── Arpeggio tables: 16 × ARPEGGIO_TABLE_LEN bytes ──────────────────
  off += 16 * ARPEGGIO_TABLE_LEN;

  // ── Sub-song info: numberOfSubSongs × 16 bytes ───────────────────────
  // Per InStereo10Worker.cs:
  //   [4 skip], StartSpeed (1), RowsPerTrack (1), FirstPosition (2),
  //   LastPosition (2), RestartPosition (2), [2 skip] = 14 bytes visible but 4+14=18?
  // Actually: [4 skip] StartSpeed(1) RowsPerTrack(1) FirstPos(2) LastPos(2) RestartPos(2) [2 skip] = 14 bytes after skip = 18 total
  // But the C# skips 14 more after the sub-songs. Let's match exactly.
  const subSongs: IS10SongInfo[] = [];
  for (let i = 0; i < numberOfSubSongs; i++) {
    if (off + 14 > bytes.length) return null;
    off += 4; // reserved
    const startSpeed      = u8(bytes, off++);
    const rowsPerTrack    = u8(bytes, off++);
    const firstPosition   = u16BE(bytes, off); off += 2;
    const lastPosition    = u16BE(bytes, off); off += 2;
    const restartPosition = u16BE(bytes, off); off += 2;
    off += 2; // skip
    subSongs.push({ startSpeed, rowsPerTrack, firstPosition, lastPosition, restartPosition });
  }

  // Skip extra sub-song info
  off += 14;

  // ── Waveforms: numberOfWaveforms × 256 signed bytes ──────────────────
  const waveforms: Int8Array[] = [];
  for (let i = 0; i < numberOfWaveforms; i++) {
    if (off + 256 > bytes.length) break;
    const wave = new Int8Array(256);
    for (let j = 0; j < 256; j++) {
      wave[j] = s8(bytes[off + j]);
    }
    waveforms.push(wave);
    off += 256;
  }

  // ── Position data: totalNumberOfPositions × 4 channels × 4 bytes ─────
  const positions: IS10Position[][] = [];
  for (let i = 0; i < totalNumberOfPositions; i++) {
    if (off + 16 > bytes.length) break;
    const row: IS10Position[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const startTrackRow  = u16BE(bytes, off); off += 2;
      const soundTranspose = s8(bytes[off++]);
      const noteTranspose  = s8(bytes[off++]);
      row.push({ startTrackRow, soundTranspose, noteTranspose });
    }
    positions.push(row);
  }

  // ── Track rows: (totalNumberOfTrackRows + 64) × 4 bytes ──────────────
  // The 64 extra rows are empty padding added by the C# loader.
  const totalRows = totalNumberOfTrackRows + 64;
  const trackLines: IS10TrackLine[] = [];
  for (let i = 0; i < totalRows; i++) {
    if (off + 4 > bytes.length) {
      trackLines.push({ note: 0, instrument: 0, arpeggio: 0, effect: 0, effectArg: 0 });
      continue;
    }
    const byt1 = bytes[off++];
    const byt2 = bytes[off++];
    const byt3 = bytes[off++];
    const byt4 = bytes[off++];
    trackLines.push({
      note:       byt1,
      instrument: byt2,
      arpeggio:  (byt3 & 0xf0) >> 4,
      effect:     byt3 & 0x0f,
      effectArg:  byt4,
    });
  }

  // ── Sample PCM data ─────────────────────────────────────────────────
  const sampleData: (Uint8Array | null)[] = [];
  for (let i = 0; i < numberOfSamples; i++) {
    const slen = samplesInfo[i].length;
    if (slen > 0 && off + slen <= bytes.length) {
      const pcm = new Uint8Array(slen);
      for (let j = 0; j < slen; j++) {
        pcm[j] = bytes[off + j];
      }
      sampleData.push(pcm);
      off += slen;
    } else {
      sampleData.push(null);
    }
  }

  // ── Build InstrumentConfig[] ─────────────────────────────────────────
  const PAL_C3_RATE  = Math.round(PAL_CLOCK / (2 * 214));  // ~8287 Hz
  const SYNTH_RATE   = Math.round(PAL_CLOCK / (2 * 856));  // ~2072 Hz

  const instrConfigs: InstrumentConfig[] = [];
  for (let i = 0; i < instruments.length; i++) {
    const instr = instruments[i];
    const id = i + 1;

    if (!instr.synthesisEnabled) {
      // PCM sample instrument — waveformNumber is the sample index
      const sampleIdx = instr.waveformNumber & 0x3f;
      const pcmData = sampleIdx < sampleData.length ? sampleData[sampleIdx] : null;
      if (pcmData && pcmData.length > 0) {
        // Loop: repeatLength == 0 → full loop, == 2 → no loop, else loop from waveformLength
        const hasLoop = instr.repeatLength !== 2;
        let loopStart = 0;
        let loopEnd   = 0;
        if (hasLoop) {
          if (instr.repeatLength === 0) {
            loopStart = 0;
            loopEnd   = pcmData.length;
          } else {
            loopStart = instr.waveformLength;
            loopEnd   = instr.waveformLength + instr.repeatLength;
          }
        }
        instrConfigs.push(
          createSamplerInstrument(id, samplesInfo[sampleIdx]?.name || `Sample ${i}`, pcmData, instr.volume, PAL_C3_RATE, loopStart, loopEnd)
        );
      } else {
        instrConfigs.push(makeSynthPlaceholder(id, `Sample ${i}`));
      }
    } else {
      // Synth instrument — use waveform table
      const waveIdx = instr.waveformNumber < waveforms.length ? instr.waveformNumber : 0;
      if (waveforms.length > 0 && waveIdx < waveforms.length) {
        const wave = waveforms[waveIdx];
        const playLen = Math.min(Math.max(2, instr.waveformLength), 256);
        const pcmUint8 = new Uint8Array(playLen);
        for (let j = 0; j < playLen; j++) {
          pcmUint8[j] = wave[j % 256] & 0xff;
        }
        instrConfigs.push(
          createSamplerInstrument(id, `Synth ${i}`, pcmUint8, instr.volume, SYNTH_RATE, 0, playLen)
        );
      } else {
        instrConfigs.push(makeSynthPlaceholder(id, `Synth ${i}`));
      }
    }
  }

  // ── Build patterns ────────────────────────────────────────────────────
  if (subSongs.length === 0) return null;
  const song = subSongs[0];
  const rowsPerTrack = Math.max(1, song.rowsPerTrack);
  const firstPos = song.firstPosition;
  const lastPos  = song.lastPosition;

  const trackerPatterns: Pattern[] = [];

  for (let posIdx = firstPos; posIdx <= lastPos; posIdx++) {
    if (posIdx >= positions.length) break;
    const posRow = positions[posIdx];
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let row = 0; row < rowsPerTrack; row++) {
      for (let ch = 0; ch < 4; ch++) {
        const pos = posRow[ch];
        const lineIdx = pos.startTrackRow + row;
        const line = lineIdx < trackLines.length ? trackLines[lineIdx] : null;

        if (!line || line.note === 0) {
          channelRows[ch].push(emptyCell());
          continue;
        }

        if (line.note === 0x7f) {
          channelRows[ch].push({ note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        const noteIdx = Math.max(1, Math.min(108, line.note + pos.noteTranspose));
        const instrNum = line.instrument > 0
          ? Math.max(1, Math.min(255, line.instrument + pos.soundTranspose))
          : 0;

        const xmNote = is10NoteToXm(noteIdx);
        const instrId = instrNum > 0 && instrNum <= instruments.length ? instrNum : 0;

        const { effTyp, eff } = is10EffectToXm(line.effect, line.effectArg);

        channelRows[ch].push({
          note: xmNote,
          instrument: instrId,
          volume: 0,
          effTyp,
          eff,
          effTyp2: 0,
          eff2: 0,
        });
      }
    }

    const patIdx = posIdx - firstPos;
    trackerPatterns.push({
      id: `pattern-${patIdx}`,
      name: `Position ${patIdx}`,
      length: rowsPerTrack,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'IS10',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: positions.length,
        originalInstrumentCount: instruments.length,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, 4, rowsPerTrack));
  }

  const name = moduleName || filename.replace(/\.[^/.]+$/, '');

  // Suppress unused variable warnings for tables we read but only validate
  void egcTablesOff;
  void adsrTablesOff;

  return {
    name,
    format: 'IS10' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: Math.max(1, song.startSpeed),
    initialBPM: 125,
    linearPeriods: false,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeSynthPlaceholder(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig;
}

function makeEmptyPattern(filename: string, numChannels: number, rowsPerTrack: number): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: rowsPerTrack,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rowsPerTrack }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat: 'IS10',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}

/**
 * Map InStereo! 1.0 effect codes to XM effTyp/eff.
 * IS10 effects (from InStereo10 Containers/Effect.cs):
 *   0 = None, 1 = SetSlideSpeed, 2 = RestartAdsr, 3 = RestartEgc,
 *   4 = SetSlideIncrement, 5 = SetVibratoDelay, 6 = SetVibratoPosition,
 *   7 = SetVolume (0-63), 8 = SkipNt, 9 = SkipSt, A = SetTrackLen,
 *   B = SkipPortamento, C = EffC (no-op), D = EffD (no-op),
 *   E = SetFilter, F = SetSpeed
 */
function is10EffectToXm(effect: number, arg: number): { effTyp: number; eff: number } {
  switch (effect) {
    case 0x7: // SetVolume (0-63 Amiga)
      return { effTyp: 0x0C, eff: Math.min(64, arg & 0x3f) };
    case 0xF: // SetSpeed
      if (arg > 0 && arg <= 31) return { effTyp: 0x0F, eff: arg };
      return { effTyp: 0, eff: 0 };
    default:
      return { effTyp: 0, eff: 0 };
  }
}
