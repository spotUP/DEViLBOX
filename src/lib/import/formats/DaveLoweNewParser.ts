/**
 * DaveLoweNewParser.ts — Dave Lowe New Amiga music format (DLN.*) native parser
 *
 * Dave Lowe New is an evolved version of Dave Lowe's Amiga music player, used in
 * games from the early-to-mid 1990s (Beneath A Steel Sky, Super Street Fighter II,
 * Flink, King's Quest VI).
 *
 * Unlike the original DL format (HUNK executable), DLN is raw data:
 *
 * Binary layout:
 *   +0x00: word — format indicator (4 or 8)
 *   +0x02: word — subsong table offset
 *   +firstCheckOffset: 4 longwords — channel position list pointers
 *
 * Position list: array of longword pointers to command stream sections, terminated by 0.
 *
 * Command stream format (identical to Dave Lowe):
 *   word > 100: NOTE — next word is duration in ticks
 *   word ==  4: SET_INSTRUMENT — next longword is offset to sample descriptor
 *   word ==  8: SEQ_ADVANCE — end of this section
 *   word == 12: SET_VOL_ENV — next longword is offset to volume envelope
 *   word == 32: REST — next word is duration in ticks
 *
 * Sample descriptors: 14 bytes each:
 *   +0: word (loop type), +2: long (PCM offset from file start),
 *   +6: word (sample length in words), +8: long (loop offset), +12: word (loop length in words)
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/DaveLoweNew/src/Dave Lowe New_v2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { createSamplerInstrument, periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';
import { daveLoweEncoder } from './DaveLoweParser';

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE_DESC_SIZE = 14;
const CMD_SET_INSTRUMENT = 4;
const CMD_SEQ_ADVANCE = 8;
const CMD_SET_VOL_ENV = 12;
const CMD_REST = 32;
const CMD_NOTE_THRESHOLD = 100;

// ── Binary helpers ────────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

// ── Format detection ──────────────────────────────────────────────────────────

function getFirstCheckOffset(buf: Uint8Array): number {
  if (buf.length < 32) return -1;
  const word0 = u16BE(buf, 0);
  if (word0 === 8) return 8;
  if (word0 === 4) {
    const long24 = u32BE(buf, 24);
    return long24 !== 0 ? 4 : 8;
  }
  return -1;
}

export function isDaveLoweNewFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const tableOff = getFirstCheckOffset(buf);
  if (tableOff === -1) return false;

  const endOff = tableOff + 4 * 4;
  if (endOff > buf.length) return false;

  for (let i = 0; i < 4; i++) {
    const base = tableOff + i * 4;
    const hiWord = u16BE(buf, base);
    const loWord = u16BE(buf, base + 2);
    if (hiWord !== 0) return false;
    if (loWord >= 0x8000) return false;
    if (loWord === 0) return false;
    if ((loWord & 1) !== 0) return false;
  }

  return true;
}

// ── Command stream parsing (shared with DaveLowe) ─────────────────────────────

interface DLEvent {
  type: 'note' | 'rest' | 'setInstrument' | 'setVolEnv' | 'seqAdvance';
  period?: number;
  duration?: number;
  ptr?: number;
}

function parseCommandStream(buf: Uint8Array, fileOff: number): { events: DLEvent[]; byteSize: number } {
  const events: DLEvent[] = [];
  let pos = fileOff;
  const end = buf.length - 1;

  while (pos < end) {
    const word = u16BE(buf, pos);
    pos += 2;

    if (word > CMD_NOTE_THRESHOLD) {
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: 'note', period: word, duration });
    } else if (word === CMD_SET_INSTRUMENT) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: 'setInstrument', ptr });
    } else if (word === CMD_SET_VOL_ENV) {
      if (pos + 4 > buf.length) break;
      const ptr = u32BE(buf, pos);
      pos += 4;
      events.push({ type: 'setVolEnv', ptr });
    } else if (word === CMD_REST) {
      if (pos + 2 > buf.length) break;
      const duration = u16BE(buf, pos);
      pos += 2;
      events.push({ type: 'rest', duration });
    } else if (word === CMD_SEQ_ADVANCE) {
      events.push({ type: 'seqAdvance' });
      break;
    } else if (word === 0) {
      break;
    } else {
      break;
    }
  }

  return { events, byteSize: pos - fileOff };
}

// ── Convert events to tracker rows ────────────────────────────────────────────

interface RowData {
  note: number;
  instrument: number;
  volume: number;
  effTyp: number;
  eff: number;
}

function eventsToRows(
  events: DLEvent[],
  instrPtrToId: Map<number, number>,
): { rows: RowData[]; totalTicks: number } {
  const rows: RowData[] = [];
  let currentInstr = 0;
  let totalTicks = 0;

  for (const ev of events) {
    if (ev.type === 'setInstrument') {
      const id = instrPtrToId.get(ev.ptr!) ?? 0;
      if (id > 0) currentInstr = id;
    } else if (ev.type === 'note') {
      const noteIdx = periodToNoteIndex(ev.period!);
      const xmNote = amigaNoteToXM(noteIdx);
      rows.push({ note: xmNote, instrument: currentInstr, volume: 0, effTyp: 0, eff: 0 });
      for (let t = 1; t < ev.duration!; t++) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      }
      totalTicks += ev.duration!;
    } else if (ev.type === 'rest') {
      for (let t = 0; t < ev.duration!; t++) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
      }
      totalTicks += ev.duration!;
    }
  }

  return { rows, totalTicks };
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseDaveLoweNewFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isDaveLoweNewFormat(buf)) {
    throw new Error('Not a Dave Lowe New module');
  }

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^dln\./i, '').replace(/\.dln$/i, '') || baseName;

  // ── Read channel pointer table ────────────────────────────────────────────
  const tableOff = getFirstCheckOffset(buf);
  const channelListPtrs: number[] = [];
  for (let ch = 0; ch < 4; ch++) {
    channelListPtrs.push(u32BE(buf, tableOff + ch * 4));
  }

  // ── Read position lists ───────────────────────────────────────────────────
  const channelPositionLists: number[][] = [[], [], [], []];

  for (let ch = 0; ch < 4; ch++) {
    const listOff = channelListPtrs[ch];
    if (listOff === 0 || listOff >= buf.length) continue;
    let pos = listOff;
    while (pos + 4 <= buf.length) {
      const ptr = u32BE(buf, pos);
      if (ptr === 0) break;
      // Skip separator markers (0x00000001)
      if (ptr > 1 && ptr < buf.length) {
        channelPositionLists[ch].push(ptr);
      } else {
        break;
      }
      pos += 4;
    }
  }

  const numPositions = Math.max(...channelPositionLists.map(l => l.length), 1);

  // ── Collect unique section pointers and parse ─────────────────────────────
  const uniqueSections = new Map<number, number>();
  const allSectionPtrs: number[] = [];
  const trackMap: number[][] = [];

  for (let posIdx = 0; posIdx < numPositions; posIdx++) {
    const chPats: number[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const sectionPtr = posIdx < channelPositionLists[ch].length
        ? channelPositionLists[ch][posIdx] : 0;
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

  // Parse all command streams and collect SET_INSTRUMENT pointers
  const sectionEvents = new Map<number, DLEvent[]>();
  const sectionBytes = new Map<number, number>();
  const instrPtrs = new Set<number>();

  for (const sectionPtr of allSectionPtrs) {
    if (sectionPtr >= buf.length) {
      sectionEvents.set(sectionPtr, []);
      sectionBytes.set(sectionPtr, 0);
      continue;
    }
    const { events, byteSize } = parseCommandStream(buf, sectionPtr);
    sectionEvents.set(sectionPtr, events);
    sectionBytes.set(sectionPtr, byteSize);
    for (const ev of events) {
      if (ev.type === 'setInstrument' && ev.ptr! > 0) {
        instrPtrs.add(ev.ptr!);
      }
    }
  }

  // ── Extract samples from collected descriptor pointers ────────────────────
  const sortedInstrPtrs = [...instrPtrs].sort((a, b) => a - b);
  const instrPtrToId = new Map<number, number>();
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < sortedInstrPtrs.length; i++) {
    const descOff = sortedInstrPtrs[i];
    instrPtrToId.set(descOff, i + 1);

    if (descOff + SAMPLE_DESC_SIZE > buf.length) {
      instruments.push({
        id: i + 1, name: `Sample ${i + 1}`,
        type: 'synth' as const, synthType: 'Synth' as const,
        effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    const loopType   = u16BE(buf, descOff + 0);
    const sampleAddr = u32BE(buf, descOff + 2);
    const sampleLen  = u16BE(buf, descOff + 6);  // words
    const loopOff    = u32BE(buf, descOff + 8);
    const loopLen    = u16BE(buf, descOff + 12);  // words

    const lenBytes = sampleLen * 2;

    if (sampleAddr === 0 || lenBytes === 0 || sampleAddr + lenBytes > buf.length) {
      instruments.push({
        id: i + 1, name: `Sample ${i + 1}`,
        type: 'synth' as const, synthType: 'Synth' as const,
        effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    const pcm = new Uint8Array(lenBytes);
    for (let k = 0; k < lenBytes; k++) pcm[k] = buf[sampleAddr + k];

    // loopOff is from module base; convert to byte offset relative to sample start
    const loopStartRel = (loopType > 0 && loopOff >= sampleAddr) ? (loopOff - sampleAddr) : 0;
    const loopStart = loopType > 0 ? loopStartRel : 0;
    const loopEnd = loopType > 0 ? loopStartRel + loopLen * 2 : 0;

    instruments.push(createSamplerInstrument(
      i + 1, `DLN Sample ${i + 1}`, pcm, 64, 8287, loopStart, loopEnd,
    ));
  }

  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1',
      type: 'synth' as const, synthType: 'Synth' as const,
      effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  // ── Build tracker patterns ────────────────────────────────────────────────
  const sectionRows = new Map<number, RowData[]>();
  for (const sectionPtr of allSectionPtrs) {
    const events = sectionEvents.get(sectionPtr) ?? [];
    const { rows } = eventsToRows(events, instrPtrToId);
    sectionRows.set(sectionPtr, rows);
  }

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

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
            note: sRows[r].note, instrument: sRows[r].instrument,
            volume: sRows[r].volume, effTyp: sRows[r].effTyp, eff: sRows[r].eff,
            effTyp2: 0, eff2: 0,
          });
        } else {
          trackerRows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
      }

      channels.push({
        id: `channel-${ch}`, name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null, rows: trackerRows,
      });
    }

    patterns.push({
      id: `pattern-${posIdx}`, name: `Pattern ${posIdx}`, length: maxRows, channels,
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename,
        importedAt: new Date().toISOString(), originalChannelCount: 4,
        originalPatternCount: numPositions, originalInstrumentCount: instruments.length,
      },
    });
    songPositions.push(posIdx);
  }

  // ── Build UADEVariablePatternLayout ─────────────────────────────────────
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  for (const sectionPtr of allSectionPtrs) {
    filePatternAddrs.push(sectionPtr);
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

  return {
    name: `${moduleName} [Dave Lowe New]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadeVariableLayout: variableLayout,
  };
}
