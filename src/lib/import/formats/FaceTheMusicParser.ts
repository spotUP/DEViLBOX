/**
 * FaceTheMusicParser.ts — Face The Music (.ftm) Amiga format parser
 *
 * Face The Music was an Amiga tracker from around 1992. It is a linear-slide,
 * 8-channel module format with embedded or external IFF samples and a per-instrument
 * "effects" script system. This parser handles the embedded-sample (module) variant.
 *
 * File layout:
 *   Header (82 bytes):
 *     magic[4]        "FTMN"
 *     version(u8)     must be 3
 *     numSamples(u8)  0-63
 *     numMeasures(u16BE)
 *     tempo(u16BE)    default 14209 ≈ 125 BPM; BPM = 1777517.482 / tempo
 *     tonality(u8)    0-11
 *     muteStatus(u8)  bitmask, bit N = channel N muted
 *     globalVolume(u8) 0-63
 *     flags(u8)       bit 0 = module (embedded samples), bit 1 = LED filter
 *     ticksPerRow(u8)  1-24
 *     rowsPerMeasure(u8) 4-96; rowsPerMeasure == 96 / ticksPerRow
 *     title[32]
 *     artist[32]
 *     numEffects(u8)  0-64
 *     padding(u8)     must be 0
 *   Sample headers: numSamples × 32 bytes
 *     name[30], unknown(u8), iffOctave(u8)
 *   Effect table: numEffects × 4 bytes (u16BE numLines, u16BE index) — skipped
 *   Effect scripts: numEffects × numLines × 4 bytes — skipped
 *   Channel data: 8 channels, each:
 *     defaultSpacing(u16BE)
 *     chunkSize(u32BE)
 *     event stream: pairs of 2 bytes
 *       0xF0..0xFF xx: set spacing = ((hi & 0x0F) << 8) | lo
 *       others: note event at current globalRow + spacing
 *   Sample data (when flags & 0x01):
 *     per sample (with non-empty name):
 *       loopStart(u16BE, words → ×2 = bytes)
 *       loopLength(u16BE, words → ×2 = bytes)
 *       PCM data (8-bit signed, length = loopStart + loopLength bytes)
 *
 * Note encoding in 2-byte event pairs:
 *   byte0 & 0xF0:
 *     0x00  → set instrument, no effect; param = (b0 & 0x0F) << 2 | b1 >> 6
 *     0xB0  → SEL effect
 *     0xC0  → pitch bend
 *     0xD0  → volume down
 *     0xE0  → loop point (not a note event)
 *     0xF0  → spacing update (handled above)
 *     else  → set channel volume (1-9) + instrument
 *   byte1 & 0x3F:
 *     35+   → key off
 *     1-34  → note: NOTE_MIDDLEC - 13 + note (OpenMPT: NOTE_MIDDLEC=61 → C5=61 → note 49+note)
 *     0     → no note change
 *
 * References:
 *   Reference Code/openmpt-master/soundlib/Load_ftm.cpp (primary)
 *   thoughts/shared/research/nostalgicplayer/sources/FaceTheMusic/ (secondary)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEChipRamInfo } from '@/types/instrument';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────────

function u8(view: DataView, off: number): number  { return view.getUint8(off); }
function u16be(view: DataView, off: number): number { return view.getUint16(off, false); }
function u32be(view: DataView, off: number): number { return view.getUint32(off, false); }

function readString(view: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = u8(view, off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAGIC      = 'FTMN';
const NUM_CHANNELS = 8;
const HEADER_SIZE  = 82;  // FTMFileHeader
const SAMPLE_HDR_SIZE = 32;  // FTMSampleHeader

// ── Format detection ───────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a valid Face The Music module.
 * Mirrors Load_ftm.cpp's FTMFileHeader::IsValid() check.
 */
export function isFaceTheMusicFormat(bytes: Uint8Array): boolean {
  if (bytes.byteLength < HEADER_SIZE) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Magic "FTMN"
  for (let i = 0; i < 4; i++) {
    if (u8(view, i) !== MAGIC.charCodeAt(i)) return false;
  }

  const version        = u8(view, 4);
  const numSamples     = u8(view, 5);
  const tempo          = u16be(view, 8);
  const tonality       = u8(view, 10);
  const globalVolume   = u8(view, 12);
  const flags          = u8(view, 13);
  const ticksPerRow    = u8(view, 14);
  const rowsPerMeasure = u8(view, 15);
  const numEffects     = u8(view, 80);
  const padding        = u8(view, 81);

  if (version !== 3) return false;
  if (numSamples >= 64) return false;
  if (tempo < 0x1000 || tempo > 0x4FFF) return false;
  if (tonality >= 12) return false;
  if (globalVolume >= 64) return false;
  // flags: bit 0 = module, bit 1 = LED filter — bits 2-7 must be 0
  if (flags & 0xFC) return false;
  // We require embedded samples (flags & 0x01) for native parsing
  if (!(flags & 0x01)) return false;
  if (ticksPerRow < 1 || ticksPerRow > 24) return false;
  if (rowsPerMeasure < 4 || rowsPerMeasure > 96) return false;
  // rowsPerMeasure == 96 / ticksPerRow (integer division)
  if (rowsPerMeasure !== Math.floor(96 / ticksPerRow)) return false;
  if (numEffects > 64) return false;
  if (padding !== 0) return false;

  // Verify minimum file size covers sample headers + effect table
  const additionalSize = numSamples * SAMPLE_HDR_SIZE + numEffects * 4;
  if (bytes.byteLength < HEADER_SIZE + additionalSize) return false;

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parse a Face The Music (.ftm) file into a TrackerSong.
 * Returns null if the file does not match the format.
 */
export function parseFaceTheMusicFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isFaceTheMusicFormat(bytes)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ── File header ────────────────────────────────────────────────────────────
  const numSamples     = u8(view, 5);
  const numMeasures    = u16be(view, 6);
  const tempo          = u16be(view, 8);
  const muteStatus     = u8(view, 11);
  const globalVolume   = u8(view, 12);
  const flags          = u8(view, 13);
  const ticksPerRow    = u8(view, 14);
  const rowsPerMeasure = u8(view, 15);
  const title          = readString(view, 16, 32);
  const artist         = readString(view, 48, 32);
  const numEffects     = u8(view, 80);
  // padding at 81

  const moduleWithSamples = !!(flags & 0x01);

  // BPM from tempo: BPM = 1777517.482 / tempo (per Load_ftm.cpp)
  const initialBPM = Math.round(1777517.482 / tempo);

  // ── Sample headers ─────────────────────────────────────────────────────────
  const sampleNames: string[] = [];
  let pos = HEADER_SIZE;

  for (let s = 0; s < numSamples; s++) {
    sampleNames.push(readString(view, pos, 30));
    pos += SAMPLE_HDR_SIZE;  // 32 bytes (name[30] + unknown + iffOctave)
  }

  // ── Skip effect table + effect scripts ────────────────────────────────────
  // Each effect entry: u16BE numLines + u16BE index = 4 bytes
  // Each effect script: numLines × 4 bytes
  // We skip all of this for pattern-data purposes.
  for (let e = 0; e < numEffects; e++) {
    if (pos + 4 > bytes.byteLength) return null;
    const numLines = u16be(view, pos);
    if (numLines > 0x200) return null;
    pos += 4;            // effect table entry
    pos += numLines * 4; // effect script lines
  }

  // ── Build pattern grid ─────────────────────────────────────────────────────
  // We create numMeasures patterns, each with rowsPerMeasure rows × 8 channels.
  // The channel data is stored as a compressed event stream per channel.

  // Pre-allocate the pattern cell grid: [measure][row][channel]
  const grid: TrackerCell[][][] = Array.from({ length: numMeasures }, () =>
    Array.from({ length: rowsPerMeasure }, () =>
      Array.from({ length: NUM_CHANNELS }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    ),
  );

  // Read each channel's event stream and place events into the grid.
  for (let chn = 0; chn < NUM_CHANNELS; chn++) {
    if (pos + 6 > bytes.byteLength) break;  // Need at least defaultSpacing + chunkSize

    const defaultSpacing = u16be(view, pos);
    pos += 2;
    const chunkSize = u32be(view, pos);
    pos += 4;

    if (pos + chunkSize > bytes.byteLength) return null;
    const chunkEnd = pos + chunkSize;

    let globalRow = 0;
    let spacing   = defaultSpacing;

    while (pos + 2 <= chunkEnd) {
      const data0 = u8(view, pos);
      const data1 = u8(view, pos + 1);
      pos += 2;

      // Spacing update: high nibble 0xF0..0xFF
      if ((data0 & 0xF0) === 0xF0) {
        spacing = data1 | ((data0 & 0x0F) << 8);
        continue;
      }

      // Note event: place at measure[globalRow + spacing, row within measure]
      const eventRow = globalRow + spacing;
      const measureIdx = Math.floor(eventRow / rowsPerMeasure);
      const rowInMeasure = eventRow % rowsPerMeasure;

      if (measureIdx >= numMeasures) break;

      const cell = grid[measureIdx][rowInMeasure][chn];

      // param: bits [5:2] from data0 low nibble + bits [7:6] from data1
      const param = ((data0 & 0x0F) << 2) | (data1 >> 6);  // 0-63

      switch (data0 & 0xF0) {
        case 0x00:
          // Set instrument, no note-off effect
          cell.instrument = param;
          break;
        case 0xB0:
          // SEL effect (instrument synth jump) — store as effect 0x1C (CMD_MED_SYNTH_JUMP)
          // We record it as a generic effect for display; exact playback not implemented
          cell.effTyp = 0x1C;
          cell.eff    = param;
          break;
        case 0xC0:
          // Pitch bend (tone porta with duration) — effect 0x03-like
          cell.effTyp = 0x03;
          cell.eff    = param;
          break;
        case 0xD0:
          // Volume down — store as volume fade effect (0x0A portamento-style)
          cell.effTyp = 0x0A;
          cell.eff    = param;
          break;
        case 0xE0:
          // Loop point — skip (handled by OpenMPT's pattern loop expansion;
          // we don't replicate that here)
          break;
        default: {
          // High nibble 1-9: set channel volume (1-9, scaled 0..64) + instrument
          // channel volume nibble: (data0 >> 4) - 1 → 0-8 → scaled to 0-64
          // Per Load_ftm.cpp: Util::muldivr_unsigned((data0 >> 4) - 1, 64, 9)
          const volRaw = ((data0 >> 4) - 1) * 64 / 9;
          cell.effTyp = 0x41;  // CMD_CHANNELVOLUME (0x41 in OpenMPT; store as generic vol col)
          cell.volume = Math.round(volRaw);
          cell.instrument = param;
          break;
        }
      }

      // Note from data1 low 6 bits
      const noteBits = data1 & 0x3F;
      if (noteBits >= 35) {
        cell.note = 97;  // Key-off
      } else if (noteBits !== 0) {
        // Load_ftm.cpp: m.note = NOTE_MIDDLEC - 13 + note
        // NOTE_MIDDLEC = 61 in OpenMPT, C5 = 61 — but in XM/DEViLBOX note 1 = C-0
        // OpenMPT: NOTE_MIDDLEC=61 → minus 13 = 48, so note 1 → cell 49 = C4
        // In DEViLBOX XM convention: C4 = 49 (C-0=1, C-1=13, C-2=25, C-3=37, C-4=49)
        cell.note = 48 + noteBits;
      }

      globalRow += 1 + spacing;
      spacing = defaultSpacing;
    }

    // Advance pos to end of chunk if we broke early
    pos = chunkEnd;
  }

  // ── Sample data ────────────────────────────────────────────────────────────
  // Only present when flags & 0x01 (moduleWithSamples).
  // Per-sample: loopStart(u16BE words), loopLength(u16BE words), then PCM bytes.
  // length = loopStart + loopLength (in samples).

  const pcmData: (Uint8Array | null)[] = Array(numSamples).fill(null);
  const loopStarts: number[]  = Array(numSamples).fill(0);
  const loopLengths: number[] = Array(numSamples).fill(0);

  if (moduleWithSamples) {
    for (let s = 0; s < numSamples; s++) {
      if (!sampleNames[s]) continue;  // Empty name → no sample data

      if (pos + 4 > bytes.byteLength) break;
      const loopStartWords  = u16be(view, pos);
      const loopLengthWords = u16be(view, pos + 2);
      pos += 4;

      const loopStartBytes  = loopStartWords * 2;
      const loopLengthBytes = loopLengthWords * 2;
      const totalBytes      = loopStartBytes + loopLengthBytes;

      if (totalBytes === 0) continue;

      if (pos + totalBytes > bytes.byteLength) {
        // Truncated — read what's available
        const available = bytes.byteLength - pos;
        if (available > 0) {
          pcmData[s]      = bytes.slice(pos, pos + available);
          loopStarts[s]   = loopStartBytes;
          loopLengths[s]  = loopLengthBytes;
        }
        pos += Math.min(totalBytes, bytes.byteLength - pos);
      } else {
        pcmData[s]     = bytes.slice(pos, pos + totalBytes);
        loopStarts[s]  = loopStartBytes;
        loopLengths[s] = loopLengthBytes;
        pos += totalBytes;
      }
    }
  }

  // ── Build InstrumentConfig list ────────────────────────────────────────────
  // FTM samples use nC5Speed = 8287 Hz (per Load_ftm.cpp: Samples[smp].nC5Speed = 8287)

  const instruments: InstrumentConfig[] = [];

  for (let s = 0; s < numSamples; s++) {
    const id   = s + 1;
    const name = sampleNames[s] || `Sample ${id}`;
    const pcm  = pcmData[s];

    if (!pcm || pcm.length === 0) {
      const uadeChipRamEmpty: UADEChipRamInfo = {
        moduleBase: 0,
        moduleSize: bytes.byteLength,
        instrBase: HEADER_SIZE + s * SAMPLE_HDR_SIZE,
        instrSize: SAMPLE_HDR_SIZE,
        sections: {},
      };
      instruments.push({
        id,
        name,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: 0,
        pan: 0,
        uadeChipRam: uadeChipRamEmpty,
      } as unknown as InstrumentConfig);
      continue;
    }

    const loopStart  = loopStarts[s];
    const loopLength = loopLengths[s];
    const loopEnd    = loopLength > 0 ? loopStart + loopLength : 0;

    const uadeChipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: bytes.byteLength,
      instrBase: HEADER_SIZE + s * SAMPLE_HDR_SIZE,
      instrSize: SAMPLE_HDR_SIZE,
      sections: {},
    };
    const samplerInst = createSamplerInstrument(
      id,
      name,
      pcm,
      Math.round((globalVolume / 63) * 64),  // globalVolume 0-63 → 0-64
      8287,    // FTM C-3 sample rate (per Load_ftm.cpp nC5Speed = 8287)
      loopStart,
      loopEnd,
    );
    samplerInst.uadeChipRam = uadeChipRam;
    instruments.push(samplerInst);
  }

  // ── Build TrackerSong patterns ─────────────────────────────────────────────
  // FTM uses a linear measure layout: order = [0, 1, 2, ..., numMeasures-1].
  // Each measure becomes one DEViLBOX Pattern.

  // Channel panning: FTM channels 0/1/6/7 = left (64), 2/3/4/5 = right (192)
  // Mapped to DEViLBOX -100..+100 range: left = -50, right = +50
  const PANNING: number[] = [
    -50, -50, 50, 50, 50, 50, -50, -50,
  ];

  const patterns: Pattern[] = Array.from({ length: numMeasures }, (_, measureIdx) => {
    const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch) => {
      const rows: TrackerCell[] = grid[measureIdx].map((rowCells) => rowCells[ch]);
      return {
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        !!(muteStatus & (1 << ch)),
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
      id:       `pattern-${measureIdx}`,
      name:     `Pattern ${measureIdx}`,
      length:   rowsPerMeasure,
      channels,
      importMetadata: {
        sourceFormat:            'FaceTheMusic',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numMeasures,
        originalInstrumentCount: numSamples,
      },
    };
  });

  // Fallback: at least one pattern
  if (patterns.length === 0) {
    patterns.push({
      id:     'pattern-0',
      name:   'Pattern 0',
      length: rowsPerMeasure,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id:           `channel-${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          PANNING[ch],
        instrumentId: null,
        color:        null,
        rows: Array.from({ length: rowsPerMeasure }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0,
          effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      })),
      importMetadata: {
        sourceFormat:            'FaceTheMusic',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    0,
        originalInstrumentCount: numSamples,
      },
    });
  }

  const songPositions = patterns.map((_, i) => i);
  const songName = title.trim() || (artist.trim() ? `${artist.trim()}` : filename.replace(/\.[^/.]+$/, ''));

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    ticksPerRow,
    initialBPM,
    linearPeriods:   true,  // SONG_LINEARSLIDES per Load_ftm.cpp
  };
}
