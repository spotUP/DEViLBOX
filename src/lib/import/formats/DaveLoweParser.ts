/**
 * DaveLoweParser.ts — Dave Lowe Amiga music format (.dl / DL.*) native parser
 *
 * Dave Lowe (Uncle Tom) composed music for many famous Amiga games including
 * Lure of the Temptress, Worlds of Legend, and Flight of the Amazon Queen.
 *
 * The module is a compiled 68k HUNK executable containing:
 *   - Player code (Init, Play, End routines)
 *   - Pointer table to code/data sections
 *   - Sample descriptor table (14 bytes per sample)
 *   - Volume envelope data
 *   - Per-channel position lists (arrays of pointers to command sections)
 *   - Command stream sections (word-based: notes, commands, durations)
 *
 * Binary layout (CODE_BASE = 0x20, after HUNK header):
 *   +0x00: 70FF 4E75 (moveq #-1,d0; rts)
 *   +0x04: "UNCL" "EART" signature
 *   +0x0C: 9 longword pointers (Init, Play, End, SubsongCtr, SampleInfo,
 *           EndSampleInfo, Init2, InitPlayer, FirstSubsong)
 *   +0x30: 7 longword metadata (SongName, AuthorName, SpecialInfo,
 *           LoadSize, CalcSize, SamplesSize, SongSize)
 *
 * Command stream format (word-based):
 *   word > 100: NOTE — next word is duration in ticks
 *   word ==  4: SET_INSTRUMENT — next longword is pointer to sample descriptor
 *   word ==  8: SEQ_ADVANCE — end of this section
 *   word == 12: SET_VOL_ENV — next longword is pointer to volume envelope
 *   word == 32: REST — next word is duration in ticks
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import type { UADEVariablePatternLayout, VariableLengthEncoder } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

const HUNK_HEADER = 0x000003F3;
const CODE_BASE = 0x20;          // start of code section after HUNK header
const PTR_TABLE_OFF = 0x0C;     // offset from CODE_BASE to pointer table
const SAMPLE_DESC_SIZE = 14;     // bytes per sample descriptor

// Command codes in the DL command stream
const CMD_SET_INSTRUMENT = 4;
const CMD_SEQ_ADVANCE = 8;
const CMD_SET_VOL_ENV = 12;
const CMD_REST = 32;
const CMD_NOTE_THRESHOLD = 100;  // words > 100 are note periods

// Standard ProTracker period table for encoding
const MOD_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

// ── Binary helpers ────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function readNullStr(buf: Uint8Array, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    if (c < 0x20 || c > 0x7e) return '';
    s += String.fromCharCode(c);
  }
  return s;
}

// ── Format detection ──────────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Dave Lowe format module.
 *
 * Detection from UADE Dave Lowe_v3.asm DTP_Check2:
 *   cmp.l  #$000003F3,(A0)      ; HUNK magic
 *   cmp.l  #$70FF4E75,32(A0)   ; moveq #-1,d0 + rts
 *   cmp.l  #'UNCL',36(A0)
 *   cmp.l  #'EART',40(A0)
 */
export function isDaveLoweFormat(buf: Uint8Array): boolean {
  if (buf.length < 44) return false;
  if (u32BE(buf, 0) !== HUNK_HEADER) return false;
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;
  if (buf[36] !== 0x55 || buf[37] !== 0x4E || buf[38] !== 0x43 || buf[39] !== 0x4C) return false;
  if (buf[40] !== 0x45 || buf[41] !== 0x41 || buf[42] !== 0x52 || buf[43] !== 0x54) return false;
  return true;
}

// ── Command stream event types ────────────────────────────────────────────────

interface DLNote {
  type: 'note';
  period: number;
  duration: number;
}
interface DLRest {
  type: 'rest';
  duration: number;
}
interface DLSetInstrument {
  type: 'setInstrument';
  sampleInfoPtr: number;  // offset from module base
}
interface DLSetVolEnv {
  type: 'setVolEnv';
  envPtr: number;
}
interface DLSeqAdvance {
  type: 'seqAdvance';
}

type DLEvent = DLNote | DLRest | DLSetInstrument | DLSetVolEnv | DLSeqAdvance;

// ── Parse a single command stream section ─────────────────────────────────────

function parseCommandStream(buf: Uint8Array, fileOff: number): { events: DLEvent[]; byteSize: number } {
  const events: DLEvent[] = [];
  let pos = fileOff;
  const end = buf.length - 1;

  while (pos < end) {
    const word = u16BE(buf, pos);
    pos += 2;

    if (word > CMD_NOTE_THRESHOLD) {
      // NOTE: period in this word, duration in next word
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: 'note', period: word, duration });
    } else if (word === CMD_SET_INSTRUMENT) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: 'setInstrument', sampleInfoPtr: ptr });
    } else if (word === CMD_SET_VOL_ENV) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: 'setVolEnv', envPtr: ptr });
    } else if (word === CMD_REST) {
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: 'rest', duration });
    } else if (word === CMD_SEQ_ADVANCE) {
      events.push({ type: 'seqAdvance' });
      break;
    } else if (word === 0) {
      // end marker
      break;
    } else {
      // Unknown command — skip and hope for the best
      // Some modules may have additional commands
      break;
    }
  }

  return { events, byteSize: pos - fileOff };
}

// ── Convert events to tracker rows ────────────────────────────────────────────

interface RowData {
  note: number;      // XM note (0 = no note)
  instrument: number; // 1-based instrument (0 = no change)
  volume: number;
  effTyp: number;
  eff: number;
}

function eventsToRows(events: DLEvent[], sampleInfoBase: number): { rows: RowData[]; totalTicks: number } {
  const rows: RowData[] = [];
  let currentInstr = 0;
  let totalTicks = 0;

  for (const ev of events) {
    switch (ev.type) {
      case 'setInstrument': {
        // Convert sample info pointer to instrument index (1-based)
        if (sampleInfoBase > 0) {
          const idx = Math.floor((ev.sampleInfoPtr - sampleInfoBase) / SAMPLE_DESC_SIZE);
          if (idx >= 0) currentInstr = idx + 1;
        }
        break;
      }
      case 'setVolEnv':
        // Volume envelope changes don't produce rows
        break;
      case 'note': {
        const noteIdx = periodToNoteIndex(ev.period);
        const xmNote = amigaNoteToXM(noteIdx);
        // First row: note + instrument
        rows.push({
          note: xmNote,
          instrument: currentInstr,
          volume: 0,
          effTyp: 0,
          eff: 0,
        });
        // Remaining duration ticks: empty rows
        for (let t = 1; t < ev.duration; t++) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
        }
        totalTicks += ev.duration;
        break;
      }
      case 'rest': {
        for (let t = 0; t < ev.duration; t++) {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
        }
        totalTicks += ev.duration;
        break;
      }
      case 'seqAdvance':
        break;
    }
  }

  return { rows, totalTicks };
}

// ── Encoder ───────────────────────────────────────────────────────────────────

/**
 * Encode tracker rows back to DL command stream binary.
 * Groups consecutive note rows, rest rows, etc. into commands.
 */
function encodeRowsToStream(rows: TrackerCell[], _channel: number): Uint8Array {
  const out: number[] = [];
  let i = 0;

  while (i < rows.length) {
    const cell = rows[i];
    const note = cell.note ?? 0;

    if (note > 0) {
      // Find duration: count how many subsequent rows have no note
      let duration = 1;
      while (i + duration < rows.length && (rows[i + duration].note ?? 0) === 0 &&
             (rows[i + duration].instrument ?? 0) === 0) {
        duration++;
      }
      // Convert XM note to period
      const periodIdx = note - 13; // XM note 13 = C-1 = period index 0
      const period = (periodIdx >= 0 && periodIdx < MOD_PERIODS.length) ? MOD_PERIODS[periodIdx] : 0;
      if (period > 0) {
        // Write period word + duration word
        out.push((period >> 8) & 0xFF, period & 0xFF);
        out.push((duration >> 8) & 0xFF, duration & 0xFF);
      }
      i += duration;
    } else {
      // REST: count consecutive empty rows
      let duration = 0;
      while (i + duration < rows.length && (rows[i + duration].note ?? 0) === 0) {
        duration++;
      }
      if (duration > 0) {
        out.push(0x00, CMD_REST);  // word = 32
        out.push((duration >> 8) & 0xFF, duration & 0xFF);
        i += duration;
      } else {
        i++;
      }
    }
  }

  // SEQ_ADVANCE at end
  out.push(0x00, CMD_SEQ_ADVANCE);

  return new Uint8Array(out);
}

export const daveLoweEncoder: VariableLengthEncoder = {
  formatId: 'daveLowe',
  encodePattern: encodeRowsToStream,
};

// ── Main parser ───────────────────────────────────────────────────────────────

export async function parseDaveLoweFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isDaveLoweFormat(buf)) {
    throw new Error('Not a Dave Lowe module');
  }

  // ── Read pointer table ──────────────────────────────────────────────────
  const ptrBase = CODE_BASE + PTR_TABLE_OFF;
  // 9 longword pointers: Init, Play, End, SubsongCtr, SampleInfo, EndSampleInfo, Init2, InitPlayer, FirstSubsong
  const sampleInfoPtr  = u32BE(buf, ptrBase + 16);
  const endSampleInfo  = u32BE(buf, ptrBase + 20);
  const firstSubsongPtr = u32BE(buf, ptrBase + 32);

  // Metadata pointers (after the 9 code pointers)
  const metaBase = ptrBase + 36;
  const songNamePtr  = u32BE(buf, metaBase + 0);
  const authorNamePtr = u32BE(buf, metaBase + 4);

  // ── Module name ─────────────────────────────────────────────────────────
  const embeddedTitle = songNamePtr > 0 ? readNullStr(buf, CODE_BASE + songNamePtr, 64) : '';
  const embeddedAuthor = authorNamePtr > 0 ? readNullStr(buf, CODE_BASE + authorNamePtr, 64) : '';

  const baseName = filename.split('/').pop() ?? filename;
  const filenameDerived = baseName.replace(/^dl\./i, '').replace(/\.(dl|dl_deli)$/i, '') || baseName;
  const moduleName = embeddedTitle.trim() || filenameDerived;

  // ── Sample extraction ───────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];
  let numSamples = 0;

  if (sampleInfoPtr > 0 && endSampleInfo > sampleInfoPtr) {
    numSamples = Math.floor((endSampleInfo - sampleInfoPtr) / SAMPLE_DESC_SIZE);
    const sampleBase = CODE_BASE + sampleInfoPtr;

    for (let i = 0; i < numSamples; i++) {
      const descOff = sampleBase + i * SAMPLE_DESC_SIZE;
      if (descOff + SAMPLE_DESC_SIZE > buf.length) break;

      const loopType   = u16BE(buf, descOff + 0);
      const sampleAddr = u32BE(buf, descOff + 2);
      const sampleLen  = u16BE(buf, descOff + 6);  // in words
      const loopOff    = u32BE(buf, descOff + 8);   // loop start offset (in bytes from sample start, or words?)
      const loopLen    = u16BE(buf, descOff + 12);  // loop length in words

      const lenBytes = sampleLen * 2;
      const pcmFileOff = CODE_BASE + sampleAddr;

      if (sampleAddr === 0 || lenBytes === 0 || pcmFileOff + lenBytes > buf.length) {
        // Empty/invalid sample — create a silent placeholder
        instruments.push({
          id: i + 1,
          name: `Sample ${i + 1}`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
        } as InstrumentConfig);
        continue;
      }

      const pcm = new Uint8Array(lenBytes);
      for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];

      // Loop points: loopOff is a chip RAM address (same space as sampleAddr)
      // Convert to byte offset relative to sample start
      const loopStartRel = (loopType > 0 && loopOff >= sampleAddr) ? (loopOff - sampleAddr) : 0;
      const loopStart = loopType > 0 ? loopStartRel : 0;
      const loopEnd = loopType > 0 ? loopStartRel + loopLen * 2 : 0;

      instruments.push(createSamplerInstrument(
        i + 1,
        embeddedAuthor ? `${embeddedAuthor} ${i + 1}` : `DL Sample ${i + 1}`,
        pcm, 64, 8287,
        loopStart, loopEnd,
      ));
    }
  }

  // Ensure at least 1 instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── Parse subsong/position lists ────────────────────────────────────────
  //
  // FirstSubsong points to a table: 4 longwords per subsong (one per channel).
  // Each longword is a pointer to a position list for that channel.
  // The position list is an array of longwords, each pointing to a command stream section.
  // Position list entries of 0x00000000 terminate.
  //
  // We parse subsong 1 (the default). Each channel's position list has independent
  // pointers — multiple positions can share the same command data (pattern reuse).

  const channelPositionLists: number[][] = [[], [], [], []]; // per-channel arrays of cmd section pointers
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  if (firstSubsongPtr > 0) {
    const subsongTableOff = CODE_BASE + firstSubsongPtr;

    // Read 4 channel pointers for subsong 1
    const channelListPtrs: number[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const off = subsongTableOff + ch * 4;
      if (off + 4 > buf.length) {
        channelListPtrs.push(0);
      } else {
        channelListPtrs.push(u32BE(buf, off));
      }
    }

    // Read each channel's position list
    for (let ch = 0; ch < 4; ch++) {
      if (channelListPtrs[ch] === 0) continue;
      const listOff = CODE_BASE + channelListPtrs[ch];
      let pos = listOff;
      while (pos + 4 <= buf.length) {
        const ptr = u32BE(buf, pos);
        if (ptr === 0) break;
        channelPositionLists[ch].push(ptr);
        pos += 4;
      }
    }

    // Determine the number of song positions (max length across channels)
    const numPositions = Math.max(...channelPositionLists.map(l => l.length), 1);

    // Collect unique command section pointers → unique patterns
    const uniqueSections = new Map<number, number>(); // sectionPtr → patternIndex
    const allSectionPtrs: number[] = [];

    // Build trackMap: [position][channel] → filePatternIndex
    const trackMap: number[][] = [];

    for (let posIdx = 0; posIdx < numPositions; posIdx++) {
      const chPats: number[] = [];
      for (let ch = 0; ch < 4; ch++) {
        const sectionPtr = posIdx < channelPositionLists[ch].length
          ? channelPositionLists[ch][posIdx]
          : 0;
        if (sectionPtr === 0) {
          chPats.push(-1);
        } else {
          if (!uniqueSections.has(sectionPtr)) {
            uniqueSections.set(sectionPtr, allSectionPtrs.length);
            allSectionPtrs.push(sectionPtr);
          }
          chPats.push(uniqueSections.get(sectionPtr)!);
        }
      }
      trackMap.push(chPats);
    }

    // Parse each unique command section into rows
    const sectionRows = new Map<number, RowData[]>();   // sectionPtr → rows
    const sectionBytes = new Map<number, number>();      // sectionPtr → byte size

    for (const sectionPtr of allSectionPtrs) {
      const fileOff = CODE_BASE + sectionPtr;
      if (fileOff >= buf.length) {
        sectionRows.set(sectionPtr, []);
        sectionBytes.set(sectionPtr, 0);
        continue;
      }
      const { events, byteSize } = parseCommandStream(buf, fileOff);
      const { rows } = eventsToRows(events, sampleInfoPtr);
      sectionRows.set(sectionPtr, rows);
      sectionBytes.set(sectionPtr, byteSize);
    }

    // Build tracker patterns from positions
    // For each position, find the max row count across channels, then create a pattern
    for (let posIdx = 0; posIdx < numPositions; posIdx++) {
      let maxRows = 1;
      for (let ch = 0; ch < 4; ch++) {
        const sectionPtr = posIdx < channelPositionLists[ch].length
          ? channelPositionLists[ch][posIdx] : 0;
        if (sectionPtr > 0) {
          const rows = sectionRows.get(sectionPtr) ?? [];
          maxRows = Math.max(maxRows, rows.length);
        }
      }
      // Cap pattern length at 256 rows for sanity
      maxRows = Math.min(maxRows, 256);
      if (maxRows === 0) maxRows = 1;

      const channels: ChannelData[] = [];
      for (let ch = 0; ch < 4; ch++) {
        const sectionPtr = posIdx < channelPositionLists[ch].length
          ? channelPositionLists[ch][posIdx] : 0;
        const sRows = sectionPtr > 0 ? (sectionRows.get(sectionPtr) ?? []) : [];

        const trackerRows: TrackerCell[] = [];
        for (let r = 0; r < maxRows; r++) {
          if (r < sRows.length) {
            trackerRows.push({
              note: sRows[r].note,
              instrument: sRows[r].instrument,
              volume: sRows[r].volume,
              effTyp: sRows[r].effTyp,
              eff: sRows[r].eff,
              effTyp2: 0,
              eff2: 0,
            });
          } else {
            trackerRows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
          }
        }

        channels.push({
          id: `channel-${ch}`,
          name: `Channel ${ch + 1}`,
          muted: false,
          solo: false,
          collapsed: false,
          volume: 100,
          pan: (ch === 0 || ch === 3) ? -50 : 50,
          instrumentId: null,
          color: null,
          rows: trackerRows,
        });
      }

      patterns.push({
        id: `pattern-${posIdx}`,
        name: `Pattern ${posIdx}`,
        length: maxRows,
        channels,
        importMetadata: {
          sourceFormat: 'MOD' as const,
          sourceFile: filename,
          importedAt: new Date().toISOString(),
          originalChannelCount: 4,
          originalPatternCount: numPositions,
          originalInstrumentCount: numSamples,
        },
      });

      songPositions.push(posIdx);
    }

    // ── Build UADEVariablePatternLayout ─────────────────────────────────────
    const filePatternAddrs: number[] = [];
    const filePatternSizes: number[] = [];

    for (const sectionPtr of allSectionPtrs) {
      filePatternAddrs.push(CODE_BASE + sectionPtr);
      filePatternSizes.push(sectionBytes.get(sectionPtr) ?? 0);
    }

    const variableLayout: UADEVariablePatternLayout = {
      formatId: 'daveLowe',
      numChannels: 4,
      numFilePatterns: allSectionPtrs.length,
      rowsPerPattern: patterns.map(p => p.length),
      moduleSize: buf.length,
      encoder: daveLoweEncoder,
      filePatternAddrs,
      filePatternSizes,
      trackMap,
    };

    // Assign to result (done below)
    const result: TrackerSong = {
      name: `${moduleName} [Dave Lowe]`,
      format: 'MOD' as TrackerFormat,
      patterns,
      instruments,
      songPositions,
      songLength: songPositions.length,
      restartPosition: 0,
      numChannels: 4,
      initialSpeed: 1,  // 1 tick per row — durations are already expanded
      initialBPM: 125,
      linearPeriods: false,
      uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
      uadeEditableFileName: filename,
      uadeVariableLayout: variableLayout,
    };
    return result;
  }

  // ── Fallback: no subsong data found ─────────────────────────────────────
  const emptyRows: TrackerCell[] = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  patterns.push({
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null, color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length,
    },
  });
  songPositions.push(0);

  return {
    name: `${moduleName} [Dave Lowe]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
