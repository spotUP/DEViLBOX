/**
 * InStereo2Parser.ts — InStereo! 2.0 native parser
 *
 * InStereo! 2.0 is a 4-channel Amiga tracker with synth instruments
 * (waveforms, ADSR, LFO, EGC, arpeggios) and PCM sample playback.
 * The format uses named chunks within the file.
 *
 * Reference: NostalgicPlayer InStereo20Worker.cs (authoritative loader/replayer)
 * Reference music: /Users/spot/Code/DEViLBOX/Reference Music/InStereo! 2.0/
 *
 * File layout (all big-endian after magic):
 *   8-byte magic "IS20DF10"
 *   "STBL" + uint32 count  → sub-song table (count × 10 bytes each)
 *   "OVTB" + uint32 count  → position table (count positions × 4 channels × 4 bytes)
 *   "NTBL" + uint32 count  → track rows (count × 4 bytes each)
 *   "SAMP" + uint32 count  → sample descriptors (count × 16 bytes + count × 20 name bytes + repeat uint16 table)
 *   uint32 sample lengths + PCM data (in reverse order per NostalgicPlayer)
 *   "SYNT" + uint32 count  → synth instrument descriptors
 *     each: "IS20" mark + 20 name + WaveformLength(2) + Volume(1) + VibratoDelay(1) + ...
 *           ... VibratoSpeed(1) + VibratoLevel(1) + PortamentoSpeed(1) + AdsrLength(1) + AdsrRepeat(1)
 *           + [4 skip] + SustainPoint(1) + SustainSpeed(1) + AmfLength(1) + AmfRepeat(1)
 *           + egMode(1) + egEnabled(1) + StartLen(1) + StopRep(1) + SpeedUp(1) + SpeedDown(1)
 *           + [19 skip] + AdsrTable(128) + LfoTable(128 signed) + 3×Arpeggio(16) + EGTable(128)
 *           + Waveform1(256 signed) + Waveform2(256 signed)
 *
 * Magic: "IS20DF10" at offset 0. Minimum file size: 16 bytes.
 * Extensions: .is, .is20
 *
 * InStereo 1 uses "ISM!V1.2" and InStereo 2 uses "IS20DF10" — both may have .is extension.
 * Detection order: check IS20 magic first; then IS10 magic.
 *
 * Note mapping (same period table as InStereo 1.0 and Sonic Arranger):
 *   Note index 64..127 = sample instruments (instrNum >= 64 in player)
 *   Note index 0..63   = synth instruments
 *   Period table index + 12 → XM note number
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import type { UADEChipRamInfo } from '@/types/instrument';

// ── Constants ──────────────────────────────────────────────────────────────

const PAL_CLOCK = 3546895;

/**
 * IS20 period table (109 entries, index 0 = 0 silence).
 * Identical to InStereo10 / SonicArranger Tables.Periods.
 */
const IS20_PERIODS = [
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

function readChunkTag(buf: Uint8Array, off: number): string {
  if (off + 4 > buf.length) return '';
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

/** Convert IS20 period-table note index to XM note number */
function is20NoteToXm(noteIndex: number): number {
  if (noteIndex <= 0 || noteIndex >= IS20_PERIODS.length) return 0;
  return Math.min(96, noteIndex + 12);
}

// ── Format Identification ──────────────────────────────────────────────────

/**
 * Returns true if `bytes` is an InStereo! 2.0 module.
 * Checks for "IS20DF10" magic at offset 0 and minimum file size 16.
 */
export function isInStereo2Format(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  return (
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x53 && // 'S'
    bytes[2] === 0x32 && // '2'
    bytes[3] === 0x30 && // '0'
    bytes[4] === 0x44 && // 'D'
    bytes[5] === 0x46 && // 'F'
    bytes[6] === 0x31 && // '1'
    bytes[7] === 0x30    // '0'
  );
}

// ── Internal types ─────────────────────────────────────────────────────────

interface IS20SongInfo {
  startSpeed: number;
  rowsPerTrack: number;
  firstPosition: number;
  lastPosition: number;
  restartPosition: number;
  tempo: number;
}

interface IS20Position {
  startTrackRow: number;
  soundTranspose: number;
  noteTranspose: number;
}

interface IS20TrackLine {
  note: number;
  instrument: number;
  disableSoundTranspose: boolean;
  disableNoteTranspose: boolean;
  arpeggio: number;
  effect: number;
  effectArg: number;
}

interface IS20Sample {
  name: string;
  oneShotLength: number;
  repeatLength: number;
  sampleNumber: number;
  volume: number;
}

interface IS20Instrument {
  name: string;
  waveformLength: number;
  volume: number;
  vibratoDelay: number;
  vibratoSpeed: number;
  vibratoLevel: number;
  portamentoSpeed: number;
  adsrLength: number;
  adsrRepeat: number;
  sustainPoint: number;
  sustainSpeed: number;
  amfLength: number;
  amfRepeat: number;
  egMode: number;
  waveform1: Int8Array;
  waveform2: Int8Array;
}

// ── Main Parser ────────────────────────────────────────────────────────────

/**
 * Parse an InStereo! 2.0 module file and return a TrackerSong.
 * Returns null if the file cannot be parsed.
 */
export function parseInStereo2File(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isInStereo2Format(bytes)) return null;

  let off = 8; // skip magic

  // ── "STBL" chunk — sub-song table ────────────────────────────────────
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== 'STBL') return null;
  off += 4;

  const numberOfSubSongs = u32BE(bytes, off); off += 4;
  if (off + numberOfSubSongs * 10 > bytes.length) return null;

  const subSongs: IS20SongInfo[] = [];
  for (let i = 0; i < numberOfSubSongs; i++) {
    const startSpeed      = u8(bytes, off++);
    const rowsPerTrack    = u8(bytes, off++);
    const firstPosition   = u16BE(bytes, off); off += 2;
    const lastPosition    = u16BE(bytes, off); off += 2;
    const restartPosition = u16BE(bytes, off); off += 2;
    const tempo           = u16BE(bytes, off); off += 2;

    subSongs.push({ startSpeed, rowsPerTrack, firstPosition, lastPosition, restartPosition, tempo });
  }

  if (subSongs.length === 0) return null;
  const song = subSongs[0];

  // ── "OVTB" chunk — position table ────────────────────────────────────
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== 'OVTB') return null;
  off += 4;

  const numberOfPositions = u32BE(bytes, off); off += 4;
  const positions: IS20Position[][] = [];
  for (let i = 0; i < numberOfPositions; i++) {
    if (off + 16 > bytes.length) break;
    const row: IS20Position[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const startTrackRow  = u16BE(bytes, off); off += 2;
      const soundTranspose = s8(bytes[off++]);
      const noteTranspose  = s8(bytes[off++]);
      row.push({ startTrackRow, soundTranspose, noteTranspose });
    }
    positions.push(row);
  }

  // ── "NTBL" chunk — track rows ─────────────────────────────────────────
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== 'NTBL') return null;
  off += 4;

  const numberOfTrackRows = u32BE(bytes, off); off += 4;
  const trackLines: IS20TrackLine[] = [];
  for (let i = 0; i < numberOfTrackRows; i++) {
    if (off + 4 > bytes.length) {
      trackLines.push({ note: 0, instrument: 0, disableSoundTranspose: false, disableNoteTranspose: false, arpeggio: 0, effect: 0, effectArg: 0 });
      continue;
    }
    const byt1 = bytes[off++];
    const byt2 = bytes[off++];
    const byt3 = bytes[off++];
    const byt4 = bytes[off++];
    trackLines.push({
      note:                  byt1,
      instrument:            byt2,
      disableSoundTranspose: (byt3 & 0x80) !== 0,
      disableNoteTranspose:  (byt3 & 0x40) !== 0,
      arpeggio:              (byt3 & 0x30) >> 4,
      effect:                byt3 & 0x0f,
      effectArg:             byt4,
    });
  }

  // ── "SAMP" chunk — sample descriptors ────────────────────────────────
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== 'SAMP') return null;
  off += 4;

  const numberOfSamples = u32BE(bytes, off); off += 4;
  const sampDescTableStart = off;  // file offset of first 16-byte SAMP descriptor entry
  const samplesInfo: IS20Sample[] = [];

  // Each sample descriptor: 16 bytes
  // oneShotLength(2) + repeatLength(2) + sampleNumber(s1) + volume(1) +
  // vibratoDelay(1) + vibratoSpeed(1) + vibratoLevel(1) + portamentoSpeed(1) + [6 skip] = 16 bytes
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 16 > bytes.length) break;
    const oneShotLength  = u16BE(bytes, off); off += 2;
    const repeatLength   = u16BE(bytes, off); off += 2;
    const sampleNumber   = s8(bytes[off++]);
    const volume         = u8(bytes, off++);
    off += 1; // vibratoDelay
    off += 1; // vibratoSpeed
    off += 1; // vibratoLevel
    off += 1; // portamentoSpeed
    off += 6; // reserved
    samplesInfo.push({ name: '', oneShotLength, repeatLength, sampleNumber, volume });
  }

  // Sample names: numberOfSamples × 20 bytes
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 20 > bytes.length) break;
    samplesInfo[i].name = readString(bytes, off, 20); off += 20;
  }

  // Skip copy of sample lengths/loop lengths stored in words (numberOfSamples × 4 × 2 bytes)
  off += numberOfSamples * 4 * 2;

  // ── Sample data section ───────────────────────────────────────────────
  // First: numberOfSamples uint32 lengths
  const sampleLengths: number[] = [];
  for (let i = 0; i < numberOfSamples; i++) {
    if (off + 4 > bytes.length) { sampleLengths.push(0); continue; }
    sampleLengths.push(u32BE(bytes, off)); off += 4;
  }

  // Sample PCM data stored in REVERSE order (last sample first)
  const sampleData: (Uint8Array | null)[] = new Array(numberOfSamples).fill(null);
  for (let i = numberOfSamples - 1; i >= 0; i--) {
    const slen = sampleLengths[i];
    if (slen > 0 && off + slen <= bytes.length) {
      const pcm = new Uint8Array(slen);
      for (let j = 0; j < slen; j++) {
        pcm[j] = bytes[off + j];
      }
      sampleData[i] = pcm;
      off += slen;
    }
  }

  // ── "SYNT" chunk — synth instrument descriptors ───────────────────────
  if (off + 8 > bytes.length) return null;
  if (readChunkTag(bytes, off) !== 'SYNT') return null;
  off += 4;

  const numberOfInstruments = u32BE(bytes, off); off += 4;
  const syntTableStart = off;  // file offset of first IS20 synth instrument entry
  const synthInstruments: IS20Instrument[] = [];

  for (let i = 0; i < numberOfInstruments; i++) {
    // Each instrument starts with "IS20" mark (4 bytes)
    if (off + 4 > bytes.length) break;
    if (readChunkTag(bytes, off) !== 'IS20') break;
    off += 4;

    if (off + 20 > bytes.length) break;
    const name = readString(bytes, off, 20); off += 20;

    if (off + 2 > bytes.length) break;
    const waveformLength  = u16BE(bytes, off); off += 2;
    const volume          = u8(bytes, off++);
    const vibratoDelay    = u8(bytes, off++);
    const vibratoSpeed    = u8(bytes, off++);
    const vibratoLevel    = u8(bytes, off++);
    const portamentoSpeed = u8(bytes, off++);
    const adsrLength      = u8(bytes, off++);
    const adsrRepeat      = u8(bytes, off++);

    off += 4; // skip

    const sustainPoint = u8(bytes, off++);
    const sustainSpeed = u8(bytes, off++);
    const amfLength    = u8(bytes, off++);
    const amfRepeat    = u8(bytes, off++);

    const egMode    = u8(bytes, off++);
    const egEnabled = u8(bytes, off++);

    // EnvelopeGeneratorMode: disabled if egEnabled==0; if egMode==0 → Calc, else → Free
    const effectiveEgMode = egEnabled === 0 ? 0 : (egMode === 0 ? 1 : 2);

    const startLen  = u8(bytes, off++);
    const stopRep   = u8(bytes, off++);
    const speedUp   = u8(bytes, off++);
    const speedDown = u8(bytes, off++);

    void startLen; void stopRep; void speedUp; void speedDown;

    off += 19; // skip

    // ADSR table: 128 unsigned bytes
    off += 128;

    // LFO table: 128 signed bytes
    off += 128;

    // 3 arpeggios × (1 length + 1 repeat + 14 values) = 3 × 16 = 48 bytes
    off += 48;

    // EGC table: 128 unsigned bytes
    off += 128;

    // Waveform 1: 256 signed bytes
    const waveform1 = new Int8Array(256);
    if (off + 256 <= bytes.length) {
      for (let j = 0; j < 256; j++) {
        waveform1[j] = s8(bytes[off + j]);
      }
      off += 256;
    }

    // Waveform 2: 256 signed bytes
    const waveform2 = new Int8Array(256);
    if (off + 256 <= bytes.length) {
      for (let j = 0; j < 256; j++) {
        waveform2[j] = s8(bytes[off + j]);
      }
      off += 256;
    }

    synthInstruments.push({
      name, waveformLength, volume, vibratoDelay, vibratoSpeed, vibratoLevel,
      portamentoSpeed, adsrLength, adsrRepeat, sustainPoint, sustainSpeed,
      amfLength, amfRepeat, egMode: effectiveEgMode, waveform1, waveform2,
    });
  }

  // ── Build InstrumentConfig[] ─────────────────────────────────────────
  // IS20 numbering: instrument numbers 64..127 → PCM samples (instrNum - 64 = sample index)
  //                 instrument numbers 1..63   → synth instruments (instrNum - 1 = synth index)
  // We combine samples + synth into one flat list with IDs starting at 1.
  // Pattern cells: if instrNum >= 64 → sampleData[instrNum - 64], else synthInstruments[instrNum - 1]
  // For the TrackerSong, we map sample instrNums to IDs 1..N and synth to N+1..

  const PAL_C3_RATE = Math.round(PAL_CLOCK / (2 * 214));  // ~8287 Hz
  const SYNTH_RATE  = Math.round(PAL_CLOCK / (2 * 856));  // ~2072 Hz

  // Build sample instruments (IDs 1..numberOfSamples)
  const instrConfigs: InstrumentConfig[] = [];

  for (let i = 0; i < numberOfSamples; i++) {
    const samp = samplesInfo[i];
    const id = i + 1;
    const sampChipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: sampDescTableStart + i * 16,
      instrSize: 16,
      sections: { instTable: sampDescTableStart },
    };
    const rawPcm = samp.sampleNumber >= 0 && samp.sampleNumber < sampleData.length
      ? sampleData[samp.sampleNumber]
      : sampleData[i] ?? null;

    if (rawPcm && rawPcm.length > 0) {
      const hasLoop = samp.repeatLength !== 1 && samp.oneShotLength !== 0;
      let loopStart = 0;
      let loopEnd   = 0;
      if (hasLoop) {
        if (samp.repeatLength === 0) {
          loopStart = 0;
          loopEnd   = rawPcm.length;
        } else {
          loopStart = samp.oneShotLength * 2;
          loopEnd   = (samp.oneShotLength + samp.repeatLength) * 2;
        }
      }
      instrConfigs.push({
        ...createSamplerInstrument(id, samp.name || `Sample ${i}`, rawPcm, samp.volume, PAL_C3_RATE, loopStart, loopEnd),
        uadeChipRam: sampChipRam,
      });
    } else {
      instrConfigs.push({ ...makeSynthPlaceholder(id, samp.name || `Sample ${i}`), uadeChipRam: sampChipRam });
    }
  }

  // Build synth instruments (IDs numberOfSamples+1..numberOfSamples+numberOfInstruments)
  for (let i = 0; i < synthInstruments.length; i++) {
    const instr = synthInstruments[i];
    const id = numberOfSamples + i + 1;
    const syntChipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.length,
      instrBase: syntTableStart + i * 1010,
      instrSize: 1010,
      sections: { instTable: syntTableStart },
    };
    const wave = instr.waveform1;
    const playLen = Math.min(Math.max(2, instr.waveformLength), 256);
    const pcmUint8 = new Uint8Array(playLen);
    for (let j = 0; j < playLen; j++) {
      pcmUint8[j] = wave[j % 256] & 0xff;
    }
    instrConfigs.push({
      ...createSamplerInstrument(id, instr.name || `Synth ${i}`, pcmUint8, instr.volume, SYNTH_RATE, 0, playLen),
      uadeChipRam: syntChipRam,
    });
  }

  // ── Build instrument number remap table ───────────────────────────────
  // In IS20 pattern cells:
  //   instrNum 0      = no instrument
  //   instrNum 1..63  = synth instrument (index instrNum-1 into synthInstruments)
  //   instrNum 64..127 = sample (index instrNum-64 into samplesInfo/sampleData)
  //   instrNum 0x80   = restore (no new instrument trigger)
  // We map these to our flat 1-based instrConfigs IDs:
  //   synth index k (0-based) → ID = numberOfSamples + k + 1
  //   sample index k (0-based) → ID = k + 1

  function remapInstrNum(instrNum: number): number {
    if (instrNum === 0 || instrNum === 0x80) return 0;
    if (instrNum >= 64) {
      // Sample
      const sampIdx = instrNum - 64;
      if (sampIdx < numberOfSamples) return sampIdx + 1;
      return 0;
    } else {
      // Synth
      const synthIdx = instrNum - 1;
      if (synthIdx < synthInstruments.length) return numberOfSamples + synthIdx + 1;
      return 0;
    }
  }

  // ── Build patterns ────────────────────────────────────────────────────
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

        // note 0x7f = mute, 0x80 = restore (treat as no-note for display)
        if (line.note === 0x7f) {
          channelRows[ch].push({ note: 97, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }
        if (line.note === 0x80) {
          channelRows[ch].push(emptyCell());
          continue;
        }

        let noteIdx = line.note;
        if (!line.disableNoteTranspose) {
          noteIdx = Math.max(1, Math.min(108, noteIdx + pos.noteTranspose));
        }

        let instrNum = line.instrument;
        if (instrNum > 0 && instrNum !== 0x80 && !line.disableSoundTranspose) {
          // Transpose only applies to synth instruments (< 64); samples are absolute
          if (instrNum < 64) {
            instrNum = Math.max(1, Math.min(63, instrNum + pos.soundTranspose));
          }
        }

        const xmNote = is20NoteToXm(noteIdx);
        const instrId = remapInstrNum(instrNum);

        const { effTyp, eff } = is20EffectToXm(line.effect, line.effectArg);

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
        sourceFormat: 'IS20',
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: positions.length,
        originalInstrumentCount: instrConfigs.length,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push(makeEmptyPattern(filename, 4, rowsPerTrack));
  }

  const moduleName = filename.replace(/\.[^/.]+$/, '');
  const tempo = song.tempo > 0 ? song.tempo : 50;

  return {
    name: moduleName,
    format: 'IS20' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: Math.max(1, song.startSpeed),
    initialBPM: tempo,
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
      sourceFormat: 'IS20',
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 0,
      originalInstrumentCount: 0,
    },
  };
}

/**
 * Map InStereo! 2.0 effect codes to XM effTyp/eff.
 * IS20 effects (from InStereo20 Containers/Effect.cs):
 *   0 = Arpeggio, 1 = SetSlideSpeed, 2 = RestartAdsr, 4 = SetVibrato,
 *   7 = SetPortamento, 8 = SkipPortamento, 9 = SetTrackLen,
 *   A = SetVolumeIncrement, B = PositionJump, C = SetVolume,
 *   D = TrackBreak, E = SetFilter, F = SetSpeed
 */
function is20EffectToXm(effect: number, arg: number): { effTyp: number; eff: number } {
  switch (effect) {
    case 0x0: // Arpeggio
      if (arg !== 0) return { effTyp: 0x00, eff: arg };
      return { effTyp: 0, eff: 0 };
    case 0x7: // SetPortamento
      return { effTyp: 0x03, eff: arg };
    case 0xA: // SetVolumeIncrement (signed increment to current volume)
      // Map as XM volume slide: arg > 127 = slide down (arg - 256), else slide up
      if (arg > 127) {
        const down = 256 - arg;
        return { effTyp: 0x0A, eff: down & 0x0f };
      }
      return { effTyp: 0x0A, eff: (arg & 0x0f) << 4 };
    case 0xB: // PositionJump
      return { effTyp: 0x0B, eff: arg };
    case 0xC: // SetVolume (0-64 Amiga or 0-255 synth)
      return { effTyp: 0x0C, eff: Math.min(64, arg) };
    case 0xD: // TrackBreak (pattern break)
      return { effTyp: 0x0D, eff: 0 };
    case 0xF: // SetSpeed
      if (arg > 0 && arg <= 31) return { effTyp: 0x0F, eff: arg };
      return { effTyp: 0, eff: 0 };
    default:
      return { effTyp: 0, eff: 0 };
  }
}
