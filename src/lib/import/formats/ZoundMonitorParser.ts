/**
 * ZoundMonitorParser.ts -- ZoundMonitor (.sng) Amiga format native parser
 *
 * ZoundMonitor is a 4-channel PCM sample-based Amiga tracker by A.J. van Dongen.
 * Files have NO magic bytes; detection uses a structural offset + Amiga device path check.
 *
 * File layout:
 *   [0..4]       Header (5 bytes: maxTable, maxPart, startTab, endTab, speed)
 *   [5..868]     Sample table (16 entries x 54 bytes)
 *   [869..]      Table data ((maxTable+1) x 16 bytes)
 *   [..]         Part data ((maxPart+1) x 128 bytes)
 *   [..]         Load paths (Amiga device paths, used for detection)
 *
 * Samples are stored as SEPARATE files on disk (not embedded in the .sng file).
 * The sample table contains filenames; the companion sample files can be passed
 * via the `companionFiles` map.
 *
 * Parts are shared across voices -- the table assigns each voice to a part
 * independently. Each table row specifies per-voice: partno, volume, instradd, noteadd.
 *
 * Part data encoding (32-bit BE longwords, 32 rows per part):
 *   Bit 31:      DMA control flag
 *   Bits 29-24:  Note number (0=none, 1-36=notes, 63=note-off)
 *   Bits 23-20:  Sample number (0=keep previous)
 *   Bits 19-16:  Control nibble (effect flags)
 *   Bits 15-8:   Volume add (signed byte)
 *   Bits 7-0:    Effect parameter
 *
 * Control nibble bits:
 *   bit 0: Arpeggio (when bit 1 clear)
 *   bit 1: Slide (when bit 0 clear)
 *   bit 0+1: Ultra-slide / portamento
 *   bit 2: NO_NOTE_ADD (suppress noteadd from table)
 *   bit 3: NO_INSTR_ADD (suppress instradd from table)
 *
 * Reference: docs/formats/Replayers/ZoundMon/Zound.c (structs)
 * Reference: docs/formats/Replayers/ZoundMon/Player.c (replayer)
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/ZoundMonitor/src/ZoundMonitor_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeZoundMonitorCell } from '@/engine/uade/encoders/ZoundMonitorEncoder';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ───────────────────────────────────────────────────────────────

/** Number of sample slots in the format (0-15, but 0 means "no sample") */
const NUM_SAMPLE_SLOTS = 16;

/** Rows per part in ZoundMonitor */
const ROWS_PER_PART = 32;

/** Bytes per sample descriptor in the file */
const SAMPLE_DESC_SIZE = 54;

/** Amiga LRRL panning for 4 channels */
const PANNING = [-50, 50, 50, -50] as const;

// ZoundMonitor period table (37 entries) for reference:
// Index 0 = silence (period 0), indices 1-36 = three octaves (C-1 to B-3).
// 0x0000, 0x0358, 0x0328, 0x02FA, 0x02D0, 0x02A6, 0x0280, 0x025C, 0x023A, 0x021A, 0x01FC, 0x01E0, 0x01C5,
// 0x01AC, 0x0194, 0x017D, 0x0168, 0x0153, 0x0140, 0x012E, 0x011D, 0x010D, 0x00FE, 0x00F0, 0x00E2,
// 0x00D6, 0x00CA, 0x00BE, 0x00B4, 0x00AA, 0x00A0, 0x0097, 0x008F, 0x0087, 0x007F, 0x0078, 0x0071

// ── Binary helpers ──────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number { return buf[off]; }
function u16BE(buf: Uint8Array, off: number): number { return (buf[off] << 8) | buf[off + 1]; }
function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}
function i8(buf: Uint8Array, off: number): number {
  const v = buf[off]; return v < 128 ? v : v - 256;
}

function readString(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const ch = buf[off + i];
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

// ── Data structures ─────────────────────────────────────────────────────────

interface ZMHeader {
  maxTable: number;
  maxPart: number;
  startTab: number;
  endTab: number;
  speed: number;
}

interface ZMSampleDesc {
  name: string;       // 40-byte filename from file
  volume: number;     // 0-64
  length: number;     // in words (multiply by 2 for bytes)
  replen: number;     // repeat length in words
  restart: number;    // loop start offset in words
  preset: number;     // unused
}

interface ZMTableEntry {
  partno: number;
  volume: number;     // signed byte
  instradd: number;
  noteadd: number;
}

interface ZMPartRow {
  dmaFlag: boolean;   // bit 31
  note: number;       // bits 29-24 (0=none, 1-36=note, 63=note-off)
  sample: number;     // bits 23-20 (0=keep previous)
  control: number;    // bits 19-16 (effect flags)
  volAdd: number;     // bits 15-8 (signed byte)
  effectParam: number; // bits 7-0
}

// ── Note mapping ────────────────────────────────────────────────────────────

/**
 * Convert a ZoundMonitor note number (1-36) to an XM note number.
 * ZM note 1 = C-1 (period 856) = ProTracker octave 1 = XM note 13.
 * ZM note 63 = note-off = XM 97.
 */
function zmNoteToXM(zmNote: number): number {
  if (zmNote === 0) return 0;
  if (zmNote === 63) return 97;  // note-off
  if (zmNote < 1 || zmNote > 36) return 0;
  return zmNote + 12;  // ZM 1 (C-1) -> XM 13 (displays "C-1")
}

// ── Effect mapping ──────────────────────────────────────────────────────────

/**
 * Map ZoundMonitor control nibble + effect param to XM effect columns.
 *
 * ZM control bits:
 *   bit 0 only:    Arpeggio (param = two nibbles: semitone offsets)
 *   bit 1 only:    Slide (param = signed speed)
 *   bits 0+1:      Ultra-slide / portamento (param = time)
 *   bit 2:         NO_NOTE_ADD (internal, no XM equivalent)
 *   bit 3:         NO_INSTR_ADD (internal, no XM equivalent)
 */
function zmEffectToXM(control: number, param: number): { effTyp: number; eff: number } {
  const bit0 = (control & 1) !== 0;
  const bit1 = (control & 2) !== 0;

  if (bit0 && !bit1) {
    // Arpeggio -> XM 0xy
    if (param !== 0) return { effTyp: 0x00, eff: param };
  } else if (!bit0 && bit1) {
    // Slide -> XM 1xx (slide up) or 2xx (slide down)
    const signed = param < 128 ? param : param - 256;
    if (signed < 0) {
      // Negative = slide up (lower period = higher pitch)
      return { effTyp: 0x01, eff: Math.min(Math.abs(signed), 0xFF) };
    } else if (signed > 0) {
      // Positive = slide down (higher period = lower pitch)
      return { effTyp: 0x02, eff: Math.min(signed, 0xFF) };
    }
  } else if (bit0 && bit1) {
    // Ultra-slide / portamento -> XM 3xx (portamento to note)
    return { effTyp: 0x03, eff: param };
  }

  return { effTyp: 0, eff: 0 };
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if `buffer` is a ZoundMonitor module.
 *
 * When `filename` is provided, the basename is checked for either:
 *   - ".sng" extension (e.g. "hittheroad.sng")
 *   - "sng." prefix (UADE convention, e.g. "sng.hittheroad")
 *
 * The structural binary check (DTP_Check2) is always performed.
 */
export function isZoundMonitorFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Filename check (optional fast-reject) ─────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.endsWith('.sng') && !base.startsWith('sng.')) return false;
  }

  if (buf.length < 870) return false;  // Need at least header + sample table + some data

  // ── Compute structural offset (DTP_Check2) ─────────────────────────────────
  const offset = (buf[0] + 1) * 16 + (buf[1] + 1) * 128 + 869;

  if (offset >= buf.length) return false;
  if (offset + 3 >= buf.length) return false;

  const b0 = buf[offset];
  const b1 = buf[offset + 1];
  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];

  if (b0 === 0x64 /* 'd' */) {
    // "df?:" pattern
    return b1 === 0x66 /* 'f' */ && b3 === 0x3a /* ':' */;
  } else {
    // "?amp" pattern
    return b1 === 0x61 /* 'a' */ && b2 === 0x6d /* 'm' */ && b3 === 0x70 /* 'p' */;
  }
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a ZoundMonitor module file into a TrackerSong.
 *
 * Fully parses the file structure: header, sample descriptors, table data,
 * and part/pattern data. Builds one pattern per table position (expanding
 * the per-voice part references into unified 4-channel patterns).
 *
 * @param buffer         Raw .sng file bytes
 * @param filename       Original filename (used to derive module name)
 * @param companionFiles Optional map of companion sample files (name -> ArrayBuffer)
 */
export async function parseZoundMonitorFile(
  buffer: ArrayBuffer,
  filename: string,
  companionFiles?: Map<string, ArrayBuffer>,
): Promise<TrackerSong> {
  if (!isZoundMonitorFormat(buffer, filename)) {
    throw new Error('Not a ZoundMonitor module');
  }

  const buf = new Uint8Array(buffer);

  // ── Parse header (5 bytes) ──────────────────────────────────────────────────

  const header: ZMHeader = {
    maxTable:  u8(buf, 0),
    maxPart:   u8(buf, 1),
    startTab:  u8(buf, 2),
    endTab:    u8(buf, 3),
    speed:     u8(buf, 4),
  };

  const speed = Math.max(1, header.speed);

  // ── Parse sample descriptors (16 x 54 bytes starting at offset 5) ──────────

  const sampleDescs: ZMSampleDesc[] = [];
  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const off = 5 + i * SAMPLE_DESC_SIZE;
    // Skip the 4-byte runtime pointer at offset 0 of each entry
    const name = readString(buf, off + 4, 40);
    const vol = u8(buf, off + 44);
    // Offset 45 is a padding byte
    const length = u16BE(buf, off + 46);
    const replen = u16BE(buf, off + 48);
    const restart = u16BE(buf, off + 50);
    const preset = u8(buf, off + 52);

    sampleDescs.push({ name, volume: Math.min(vol, 64), length, replen, restart, preset });
  }

  // ── Parse table data ((maxTable+1) entries, each 16 bytes) ──────────────────

  const tableDataStart = 5 + NUM_SAMPLE_SLOTS * SAMPLE_DESC_SIZE; // = 869
  const numTableEntries = header.maxTable + 1;
  const table: ZMTableEntry[][] = [];  // table[tableIdx][voiceIdx]

  for (let t = 0; t < numTableEntries; t++) {
    const row: ZMTableEntry[] = [];
    for (let v = 0; v < 4; v++) {
      const off = tableDataStart + t * 16 + v * 4;
      row.push({
        partno:   u8(buf, off),
        volume:   i8(buf, off + 1),
        instradd: u8(buf, off + 2),
        noteadd:  u8(buf, off + 3),
      });
    }
    table.push(row);
  }

  // ── Parse part/pattern data ((maxPart+1) entries, each 128 bytes) ──────────

  const partDataStart = tableDataStart + numTableEntries * 16;
  const numParts = header.maxPart + 1;
  const parts: ZMPartRow[][] = [];  // parts[partIdx][rowIdx]

  for (let p = 0; p < numParts; p++) {
    const rows: ZMPartRow[] = [];
    for (let r = 0; r < ROWS_PER_PART; r++) {
      const off = partDataStart + p * 128 + r * 4;
      const data = u32BE(buf, off);

      rows.push({
        dmaFlag:     (data & 0x80000000) !== 0,
        note:        (data >>> 24) & 0x3F,
        sample:      (data >>> 20) & 0x0F,
        control:     (data >>> 16) & 0x0F,
        volAdd:      ((data >>> 8) & 0xFF) < 128 ? ((data >>> 8) & 0xFF) : ((data >>> 8) & 0xFF) - 256,
        effectParam: data & 0xFF,
      });
    }
    parts.push(rows);
  }

  // ── Load companion samples if available ─────────────────────────────────────

  const samplePCM: (Uint8Array | null)[] = new Array(NUM_SAMPLE_SLOTS).fill(null);

  if (companionFiles && companionFiles.size > 0) {
    // Build a case-insensitive lookup for companion files
    const lowerMap = new Map<string, ArrayBuffer>();
    for (const [name, data] of companionFiles) {
      const baseName = (name.split('/').pop() ?? name).toLowerCase();
      lowerMap.set(baseName, data);
    }

    for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
      const desc = sampleDescs[i];
      if (!desc.name) continue;

      // Sample name in the file may be just a filename or a path
      const sampleBaseName = (desc.name.split('/').pop() ?? desc.name)
        .split(':').pop()!  // strip Amiga device prefix (e.g. "df0:Samples!")
        .split('!').pop()!  // strip directory separator
        .toLowerCase()
        .replace(/\.smp$/i, '');  // strip .smp extension for matching

      // Try exact match, then without .smp extension
      let pcmBuf = lowerMap.get(sampleBaseName)
        ?? lowerMap.get(sampleBaseName + '.smp')
        ?? lowerMap.get(desc.name.toLowerCase());

      if (pcmBuf) {
        const pcmBytes = new Uint8Array(pcmBuf);
        // The original loader zeros the first word: *(UWORD*)(start)=0
        // We do the same for accuracy
        const cleaned = new Uint8Array(pcmBytes.length);
        cleaned.set(pcmBytes);
        if (cleaned.length >= 2) {
          cleaned[0] = 0;
          cleaned[1] = 0;
        }
        samplePCM[i] = cleaned;
      }
    }
  }

  // ── Build instruments ───────────────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < NUM_SAMPLE_SLOTS; i++) {
    const desc = sampleDescs[i];
    const id = i + 1;  // 1-based instrument IDs

    // Derive a display name: strip Amiga path components, use basename only
    const displayName = desc.name
      ? (desc.name.split('/').pop() ?? desc.name)
          .split(':').pop()!
          .split('!').pop()!
          .replace(/\.smp$/i, '')
          .trim() || `Sample ${id}`
      : `Sample ${id}`;

    const pcm = samplePCM[i];

    if (pcm && pcm.length > 0) {
      // We have PCM data -- create a proper Sampler instrument
      const byteLenFromFile = desc.length * 2;
      const actualLen = Math.min(pcm.length, byteLenFromFile > 0 ? byteLenFromFile : pcm.length);
      const sampleData = pcm.subarray(0, actualLen);

      // Loop points: replen > 1 means loop is active
      // restart = loop start offset in words, replen = loop length in words
      let loopStart = 0;
      let loopEnd = 0;
      if (desc.replen > 1) {
        loopStart = desc.restart * 2;  // convert words to bytes
        loopEnd = loopStart + desc.replen * 2;
        loopEnd = Math.min(loopEnd, sampleData.length);
      }

      instruments.push(
        createSamplerInstrument(id, displayName, sampleData, desc.volume, 8287, loopStart, loopEnd)
      );
    } else {
      // No PCM data available -- create placeholder with metadata
      instruments.push({
        id,
        name: displayName,
        type: 'sample' as const,
        synthType: 'Sampler' as const,
        effects: [],
        volume: desc.volume > 0 ? 20 * Math.log10(desc.volume / 64) : -60,
        pan: 0,
        metadata: {
          modPlayback: {
            usePeriodPlayback: true,
            periodMultiplier: 3546895,
            finetune: 0,
            defaultVolume: desc.volume,
          },
        },
      } as InstrumentConfig);
    }
  }

  // ── Build patterns ─────────────────────────────────────────────────────────
  //
  // Each table position becomes one pattern. The table specifies per-voice
  // which part to play, so we expand the shared parts into unified patterns.

  const builtPatterns: Pattern[] = [];

  // Count actually-used samples for the metadata
  const usedSampleCount = sampleDescs.filter(s => s.name && s.length > 0).length;

  for (let tabIdx = 0; tabIdx < numTableEntries; tabIdx++) {
    const tabRow = table[tabIdx];

    const channels: ChannelData[] = Array.from({ length: 4 }, (_, ch) => {
      const tabEntry = tabRow[ch];
      const partIdx = Math.min(tabEntry.partno, numParts - 1);
      const part = parts[partIdx];
      if (!part) {
        // Safety: return empty rows if part index is out of range
        return {
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false, solo: false, collapsed: false,
          volume: 100, pan: PANNING[ch],
          instrumentId: null, color: null,
          rows: Array.from({ length: ROWS_PER_PART }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          })),
        } as ChannelData;
      }

      const rows: TrackerCell[] = [];

      for (let row = 0; row < ROWS_PER_PART; row++) {
        const pr = part[row];

        if (pr.note === 0 && pr.sample === 0 && pr.control === 0 && pr.volAdd === 0 && pr.effectParam === 0) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          continue;
        }

        // Apply table transpositions
        let noteNum = pr.note;
        if (noteNum > 0 && noteNum !== 63 && noteNum <= 36) {
          // Apply noteadd unless NO_NOTE_ADD (bit 2) is set
          if ((pr.control & 0x04) === 0 && tabEntry.noteadd > 0) {
            noteNum = Math.min(noteNum + tabEntry.noteadd, 36);
          }
        }

        const xmNote = zmNoteToXM(noteNum);

        // Sample number with instradd
        let sampleNum = pr.sample;
        if (sampleNum > 0 && (pr.control & 0x08) === 0 && tabEntry.instradd > 0) {
          sampleNum = Math.min(sampleNum + tabEntry.instradd, 15);
        }
        // ZM samples are 1-based in instrument list
        const instrNum = sampleNum;

        // Effects
        const { effTyp, eff } = zmEffectToXM(pr.control, pr.effectParam);

        // Volume: encode volume-add + table volume in the volume column.
        // XM volume column: 0x10-0x50 = set volume (0-64).
        // We compute the effective volume from: sample base vol + volAdd + table volume.
        // Since we don't know the current sample's base volume at parse time (it depends
        // on which sample was last set), we store the volume add as a relative indicator.
        // If there's a volume adjustment, encode it as an XM volume column value.
        let volCol = 0;
        if (pr.volAdd !== 0 || tabEntry.volume !== 0) {
          // Use a heuristic: assume base volume 64, compute effective
          const effectiveVol = Math.max(0, Math.min(64, 64 + pr.volAdd + tabEntry.volume));
          volCol = 0x10 + effectiveVol;
        }

        rows.push({
          note:       xmNote,
          instrument: instrNum,
          volume:     volCol,
          effTyp,
          eff,
          effTyp2:    0,
          eff2:       0,
        });
      }

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
      } as ChannelData;
    });

    builtPatterns.push({
      id:       `pattern-${tabIdx}`,
      name:     `Pattern ${tabIdx}`,
      length:   ROWS_PER_PART,
      channels,
      importMetadata: {
        sourceFormat:            'ZoundMonitor',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    4,
        originalPatternCount:    numParts,
        originalInstrumentCount: usedSampleCount,
      },
    });
  }

  // Fallback: ensure at least one pattern
  if (builtPatterns.length === 0) {
    builtPatterns.push({
      id: 'pattern-0', name: 'Pattern 0', length: ROWS_PER_PART,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: PANNING[ch], instrumentId: null, color: null,
        rows: Array.from({ length: ROWS_PER_PART }, (): TrackerCell => ({
          note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        })),
      } as ChannelData)),
      importMetadata: {
        sourceFormat: 'ZoundMonitor', sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4, originalPatternCount: 0, originalInstrumentCount: 0,
      },
    });
  }

  // ── Song order ──────────────────────────────────────────────────────────────
  // The table is the song order. Song plays from startTab to endTab (exclusive),
  // then loops back to startTab.

  const startTab = Math.min(header.startTab, builtPatterns.length - 1);
  const endTab = Math.min(header.endTab, builtPatterns.length);

  const songPositions: number[] = [];
  for (let p = startTab; p < endTab; p++) songPositions.push(p);
  if (songPositions.length === 0) {
    for (let p = 0; p < builtPatterns.length; p++) songPositions.push(p);
  }

  // ── Tempo calculation ───────────────────────────────────────────────────────
  // Standard Amiga: BPM = 125 when speed = 6 at 50 Hz VBlank.
  // ZoundMonitor uses speed as ticks-per-row at 50 Hz.
  // Formula: BPM = (50 * 60) / (speed * 24 / 6) ... simplified: BPM = 125 * 6 / speed
  // Actually, standard ProTracker: BPM = 125 maps to 50 Hz / (speed=6 ticks per row).
  // The "BPM" in XM terms for Amiga speed: keep BPM=125 and use speed directly.
  const initialBPM = 125;

  // ── Module name ─────────────────────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName
    .replace(/^sng\./i, '')     // strip "sng." prefix
    .replace(/\.sng$/i, '')     // strip ".sng" extension
    || baseName;

  // Build uadePatternLayout with getCellFileOffset for part-based indirection
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'zoundMonitor',
    patternDataFileOffset: partDataStart,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_PART,
    numChannels: 4,
    numPatterns: builtPatterns.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeZoundMonitorCell,
    decodeCell: (raw: Uint8Array): TrackerCell => {
      // 4 bytes as u32BE bitfield
      const data = ((raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3]) >>> 0;
      const zmNote      = (data >>> 24) & 0x3F;
      const sample      = (data >>> 20) & 0x0F;
      const control     = (data >>> 16) & 0x0F;
      // (data >>> 8) & 0xFF = volAdd — context-dependent, not mapped in decodeCell
      const effectParam = data & 0xFF;

      const note = zmNoteToXM(zmNote);
      const { effTyp, eff } = zmEffectToXM(control, effectParam);
      return { note, instrument: sample, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
    },
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      // Each pattern = one table entry; each channel references a part via table[pattern][channel].partno
      if (pattern >= table.length) return 0;
      const tabRow = table[pattern];
      const tabEntry = tabRow[channel];
      if (!tabEntry) return 0;
      const partIdx = Math.min(tabEntry.partno, numParts - 1);
      // Each part = 128 bytes (32 rows × 4 bytes)
      return partDataStart + partIdx * 128 + row * 4;
    },
  };

  return {
    name:            moduleName,
    format:          'MOD' as TrackerFormat,
    patterns:        builtPatterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed:    speed,
    initialBPM,
    linearPeriods:   false,
    uadePatternLayout,
  };
}
