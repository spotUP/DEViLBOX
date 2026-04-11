/**
 * SIDFactory2Parser.ts — SID Factory II (.sf2) file format parser
 *
 * Parses SID Factory II project files into TrackerSong format.
 * SF2 files are C64 PRG files containing an embedded 6502 music driver
 * with structured header blocks describing the music data layout.
 *
 * Audio playback: wraps the PRG in a PSID header → C64SIDEngine
 * Pattern display: extracts sequences + order lists from header metadata
 *
 * References:
 *   - https://github.com/Chordian/sidfactory2
 *   - SIDFactoryII/source/runtime/editor/driver/driver_info.cpp
 *   - SIDFactoryII/source/runtime/editor/datasources/datasource_orderlist.cpp
 *   - SIDFactoryII/source/runtime/editor/datasources/datasource_sequence.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig } from '@/types/instrument/defaults';

// ── Header block IDs ──────────────────────────────────────────────────────
const ID_DESCRIPTOR = 1;
const ID_DRIVER_COMMON = 2;
const ID_DRIVER_TABLES = 3;
const ID_INSTRUMENT_DESCRIPTOR = 4;
const ID_MUSIC_DATA = 5;
const ID_END = 0xFF;

// ── SF2 magic word at top of driver ───────────────────────────────────────
const SF2_MAGIC = 0x1337;

// ── Helpers ───────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function readWord(data: Uint8Array, off: number): number {
  return data[off] | (data[off + 1] << 8);
}

function readNullStr(data: Uint8Array, off: number, maxLen = 256): { str: string; end: number } {
  let s = '';
  let i = off;
  while (i < data.length && i < off + maxLen && data[i] !== 0) {
    const b = data[i];
    // PETSCII decoding: 0x01-0x1A = A-Z, 0x41-0x5A = a-z in PETSCII screen codes
    if (b >= 0x01 && b <= 0x1A) {
      s += String.fromCharCode(b + 0x40); // A-Z
    } else if (b >= 0x20 && b <= 0x7E) {
      s += String.fromCharCode(b); // printable ASCII
    } else {
      s += ' '; // replace non-printable
    }
    i++;
  }
  return { str: s.trim(), end: i + 1 }; // +1 to skip null terminator
}

// ── SF2 Detection ─────────────────────────────────────────────────────────

/**
 * Detect whether a buffer is a SID Factory II file.
 * SF2 files are C64 PRGs: first 2 bytes = load address (LE),
 * then the magic word 0x1337 at the loaded address.
 * We must distinguish from SoundFont (.sf2) which starts with RIFF.
 */
export function isSIDFactory2File(buffer: ArrayBuffer): boolean {
  const data = new Uint8Array(buffer);
  if (data.length < 8) return false;

  // SoundFont files start with RIFF — reject immediately
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
    return false; // RIFF header = SoundFont, not SID Factory II
  }

  // SF2: first 2 bytes = C64 load address, next 2 bytes = magic 0x1337
  const magic = data[2] | (data[3] << 8);
  return magic === SF2_MAGIC;
}

// ── Descriptor parsing ────────────────────────────────────────────────────

interface SF2Descriptor {
  driverType: number;
  driverSize: number;
  driverName: string;
  codeTop: number;
  codeSize: number;
  versionMajor: number;
  versionMinor: number;
}

interface SF2DriverCommon {
  initAddress: number;
  stopAddress: number;
  updateAddress: number;
}

interface SF2MusicData {
  trackCount: number;
  orderListPtrsLo: number;
  orderListPtrsHi: number;
  sequenceCount: number;
  sequencePtrsLo: number;
  sequencePtrsHi: number;
  orderListSize: number;
  orderListTrack1: number;
  sequenceSize: number;
  sequence00Addr: number;
}

interface SF2TableDef {
  type: number;
  id: number;
  name: string;
  address: number;
  columnCount: number;
  rowCount: number;
}

// ── PSID Header Builder ──────────────────────────────────────────────────

function buildPSIDHeader(
  initAddr: number, playAddr: number,
  title: string, author: string,
): Uint8Array {
  // PSID v2 header = 0x7C (124) bytes.
  // loadAddress = 0 means the data block starts with a 2-byte LE load address
  // (which is exactly what .sf2 / C64 PRG files have).
  const header = new Uint8Array(0x7C);
  const dv = new DataView(header.buffer);

  // Magic "PSID"
  header[0] = 0x50; header[1] = 0x53; header[2] = 0x49; header[3] = 0x44;
  dv.setUint16(4, 2);        // Version 2 (big-endian)
  dv.setUint16(6, 0x7C);     // Data offset
  dv.setUint16(8, 0);        // Load address = 0 → read from data block
  dv.setUint16(10, initAddr); // Init address (big-endian)
  dv.setUint16(12, playAddr); // Play address (big-endian)
  dv.setUint16(14, 1);       // Songs = 1
  dv.setUint16(16, 1);       // Start song = 1
  dv.setUint32(18, 0);       // Speed = 0 (VBI / 50Hz PAL)

  // Title (32 bytes at offset 0x16)
  const titleBytes = new TextEncoder().encode(title.slice(0, 31));
  header.set(titleBytes, 0x16);
  // Author (32 bytes at offset 0x36)
  const authorBytes = new TextEncoder().encode(author.slice(0, 31));
  header.set(authorBytes, 0x36);
  // Copyright (32 bytes at offset 0x56) — leave empty

  // Flags at 0x76: bits 2-3 = SID model (00 = unknown)
  dv.setUint16(0x76, 0x0000);

  return header;
}

// ── Main Parser ──────────────────────────────────────────────────────────

export async function parseSIDFactory2File(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const raw = new Uint8Array(buffer);
  if (raw.length < 8) throw new Error('SF2 file too small');

  const loadAddr = readWord(raw, 0);
  const magic = readWord(raw, 2);
  if (magic !== SF2_MAGIC) throw new Error('Not a SID Factory II file (missing 0x1337 magic)');

  // Build C64 memory image
  const mem = new Uint8Array(0x10000);
  mem.set(raw.subarray(2), loadAddr); // skip 2-byte load address prefix

  // ── Parse header blocks ──────────────────────────────────────────────
  let descriptor: SF2Descriptor | null = null;
  let driverCommon: SF2DriverCommon | null = null;
  let musicData: SF2MusicData | null = null;
  const tableDefs: SF2TableDef[] = [];
  const instrumentDescriptions: string[] = [];

  let fileOff = 4; // skip 2-byte load addr + 2-byte magic
  while (fileOff < raw.length) {
    const blockId = raw[fileOff];
    if (blockId === ID_END) break;

    const blockSize = raw[fileOff + 1];
    const blockStart = fileOff + 2;
    const blockEnd = blockStart + blockSize;
    let p = blockStart;

    switch (blockId) {
      case ID_DESCRIPTOR: {
        const driverType = raw[p++];
        const driverSize = readWord(raw, p); p += 2;
        const { str: driverName, end } = readNullStr(raw, p);
        p = end;
        const codeTop = readWord(raw, p); p += 2;
        const codeSize = readWord(raw, p); p += 2;
        const versionMajor = raw[p++];
        const versionMinor = raw[p++];
        descriptor = { driverType, driverSize, driverName, codeTop, codeSize, versionMajor, versionMinor };
        break;
      }

      case ID_DRIVER_COMMON: {
        const initAddress = readWord(raw, p); p += 2;
        const stopAddress = readWord(raw, p); p += 2;
        const updateAddress = readWord(raw, p); p += 2;
        driverCommon = { initAddress, stopAddress, updateAddress };
        break;
      }

      case ID_DRIVER_TABLES: {
        while (p < blockEnd) {
          const tType = raw[p++];
          if (tType === 0xFF) break;
          const tId = raw[p++];
          p++; // textFieldSize
          const { str: tName, end: nameEnd } = readNullStr(raw, p);
          p = nameEnd;
          p += 3; // dataLayout, properties, insDelRuleId
          p += 2; // enterActionRuleId, colorRuleId
          const address = readWord(raw, p); p += 2;
          const columnCount = readWord(raw, p); p += 2;
          const rowCount = readWord(raw, p); p += 2;
          p++; // visibleRowCount
          tableDefs.push({ type: tType, id: tId, name: tName, address, columnCount, rowCount });
        }
        break;
      }

      case ID_INSTRUMENT_DESCRIPTOR: {
        const count = raw[p++];
        for (let i = 0; i < count && p < blockEnd; i++) {
          const { str, end } = readNullStr(raw, p);
          p = end;
          instrumentDescriptions.push(str);
        }
        break;
      }

      case ID_MUSIC_DATA: {
        const trackCount = raw[p++];
        const orderListPtrsLo = readWord(raw, p); p += 2;
        const orderListPtrsHi = readWord(raw, p); p += 2;
        const sequenceCount = raw[p++];
        const sequencePtrsLo = readWord(raw, p); p += 2;
        const sequencePtrsHi = readWord(raw, p); p += 2;
        const orderListSize = readWord(raw, p); p += 2;
        const orderListTrack1 = readWord(raw, p); p += 2;
        const sequenceSize = readWord(raw, p); p += 2;
        const sequence00Addr = readWord(raw, p); p += 2;
        musicData = {
          trackCount, orderListPtrsLo, orderListPtrsHi,
          sequenceCount, sequencePtrsLo, sequencePtrsHi,
          orderListSize, orderListTrack1, sequenceSize, sequence00Addr,
        };
        break;
      }

      default:
        // Skip unknown blocks (color rules, action rules, etc.)
        break;
    }

    fileOff = blockEnd;
  }

  if (!descriptor) throw new Error('SF2: missing Descriptor block');
  if (!driverCommon) throw new Error('SF2: missing DriverCommon block');
  if (!musicData) throw new Error('SF2: missing MusicData block');

  const numChannels = musicData.trackCount; // typically 3

  // ── Parse order lists (packed format) ─────────────────────────────────
  // Each track's order list is at the address pointed to by the pointer tables
  interface OrderEntry { transpose: number; seqIdx: number }
  const orderLists: { entries: OrderEntry[]; loopIndex: number; hasLoop: boolean }[] = [];

  for (let t = 0; t < numChannels; t++) {
    const olAddrLo = mem[musicData.orderListPtrsLo + t];
    const olAddrHi = mem[musicData.orderListPtrsHi + t];
    const olAddr = olAddrLo | (olAddrHi << 8);

    const entries: OrderEntry[] = [];
    let loopIndex = 0;
    let hasLoop = false;
    let currentTranspose = 0;
    let a = olAddr;

    while (a < 0x10000) {
      const val = mem[a++];
      if (val === 0xFE) {
        break;
      }
      if (val === 0xFF) {
        hasLoop = true;
        loopIndex = 0;
        break;
      }
      if (val >= 0x80) {
        currentTranspose = val;
      } else {
        entries.push({ transpose: currentTranspose, seqIdx: val });
      }
    }

    orderLists.push({ entries, loopIndex, hasLoop });
  }

  // ── Parse sequences ──────────────────────────────────────────────────
  // Each sequence is variable-length, stored at addresses from pointer tables
  // Sequence format (packed): bytes that are:
  //   >= 0x80 with bit 7 set and bit 6..4 pattern = duration/tie byte
  //   other bytes = command, instrument, note
  // For simplicity, we treat sequences as fixed-length patterns of note events

  // First, find which sequences are actually used
  const usedSeqs = new Set<number>();
  for (const ol of orderLists) {
    for (const e of ol.entries) {
      usedSeqs.add(e.seqIdx);
    }
  }

  // Read instrument table to get names
  const instrTable = tableDefs.find(t => t.type === 0x80); // Instruments table
  const instruments: InstrumentConfig[] = [];
  const instCount = instrTable ? Math.min(instrTable.rowCount, 64) : 32;

  for (let i = 0; i < instCount; i++) {
    const instName = i < instrumentDescriptions.length && instrumentDescriptions[i]
      ? instrumentDescriptions[i]
      : `Instrument ${i + 1}`;

    // Extract raw instrument bytes from C64 memory
    let rawBytes = new Uint8Array(0);
    if (instrTable) {
      const addr = instrTable.address + i * instrTable.columnCount;
      rawBytes = new Uint8Array(instrTable.columnCount);
      for (let b = 0; b < instrTable.columnCount; b++) {
        rawBytes[b] = mem[addr + b];
      }
    }

    instruments.push({
      id: i + 1,
      name: instName,
      type: 'synth',
      synthType: 'SF2Synth',
      effects: [],
      volume: 0,
      pan: 0,
      sf2: {
        rawBytes,
        name: instName,
        instIndex: i,
        columnCount: instrTable?.columnCount ?? 0,
      },
    } as InstrumentConfig);
  }

  // ── Build patterns from sequences ─────────────────────────────────────
  // In SF2, a "pattern" in tracker terms corresponds to a position in the order list
  // where each track plays a specific sequence. We unify this into standard patterns.

  // First, determine the max order list length across all tracks
  const maxOlLen = Math.max(1, ...orderLists.map(ol => ol.entries.length));

  // Read each sequence's note events
  // ── Sequence format (from datasource_sequence.cpp) ──────────────────────
  //
  //   00       = Note off (rest)
  //   01 - 6f  = Notes
  //   70 - 7d  = Reserved
  //   7e       = Tie (hold previous note)
  //   7f       = End of sequence
  //   80 - 8f  = Duration (bits 0-3 = extra rows to fill with hold/rest)
  //   90 - 9f  = Duration with tie flag
  //   a0 - bf  = Set instrument ($00 - $1f)
  //   c0 - ff  = Set command ($00 - $3f)
  //
  // Byte order per event: [command?] [instrument?] [duration?] <note>
  // After each note, `duration` extra rows are filled with tie (0x7E) or rest (0x00)

  interface SeqEvent {
    note: number;      // 0=rest, 1-111=note, 126=tie
    instrument: number; // 0=no change, 1-32=instrument
    command: number;    // 0=no command, 1-64=command
  }

  function readSequence(seqIdx: number): SeqEvent[] {
    if (seqIdx >= musicData!.sequenceCount) return [];
    const lo = mem[musicData!.sequencePtrsLo + seqIdx];
    const hi = mem[musicData!.sequencePtrsHi + seqIdx];
    const seqAddr = lo | (hi << 8);
    if (seqAddr === 0) return [];

    const events: SeqEvent[] = [];
    let i = seqAddr;
    let duration = 0;
    let lastInst = 0;

    while (i < 0x10000 && events.length < 1024) {
      let value = mem[i++];

      // End of sequence
      if (value === 0x7F) break;

      let eventCmd = 0;
      let eventInst = 0;

      // Command byte (>= 0xC0)
      if (value >= 0xC0) {
        eventCmd = (value & 0x3F) + 1; // 1-based for display
        value = mem[i++];
        if (value === 0x7F) break;
      }

      // Instrument byte (>= 0xA0, < 0xC0)
      if (value >= 0xA0 && value < 0xC0) {
        lastInst = (value & 0x1F) + 1; // 1-based for display
        eventInst = lastInst;
        value = mem[i++];
        if (value === 0x7F) break;
      }

      // Duration byte (>= 0x80, < 0xA0)
      if (value >= 0x80 && value < 0xA0) {
        duration = value & 0x0F;
        // bit 4 = tie flag (0x90-0x9F)
        value = mem[i++];
        if (value === 0x7F) break;
      }

      // Note value (< 0x80)
      const note = value; // 0=rest, 1-111=note, 0x7E=tie
      events.push({
        note: note === 0x7E ? 0 : note, // tie shows as empty
        instrument: eventInst,
        command: eventCmd,
      });

      // Fill duration extra rows with hold/rest
      for (let d = 0; d < duration; d++) {
        events.push({ note: 0, instrument: 0, command: 0 }); // hold rows
      }
    }

    return events;
  }

  // Build pattern for each order position
  const ROWS_PER_PATTERN = 64; // default
  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  for (let pos = 0; pos < maxOlLen; pos++) {
    // For this position, each track plays a different sequence
    const channels: ChannelData[] = [];

    // Find max events across all tracks at this position
    let maxEvents = 0;
    const trackSeqs: SeqEvent[][] = [];
    for (let t = 0; t < numChannels; t++) {
      const ol = orderLists[t];
      const entry = pos < ol.entries.length ? ol.entries[pos] : null;
      const seqEvents = entry ? readSequence(entry.seqIdx) : [];
      trackSeqs.push(seqEvents);
      maxEvents = Math.max(maxEvents, seqEvents.length);
    }

    const patternLength = Math.max(1, Math.min(maxEvents || ROWS_PER_PATTERN, 256));

    for (let t = 0; t < numChannels; t++) {
      const rows: TrackerCell[] = [];
      const seqEvents = trackSeqs[t];

      for (let r = 0; r < patternLength; r++) {
        if (r < seqEvents.length) {
          const ev = seqEvents[r];
          rows.push({
            note: ev.note as any,
            instrument: ev.instrument as any,
            volume: 0 as any,
            effTyp: 0 as any,
            eff: ev.command as any,
            effTyp2: 0 as any,
            eff2: 0 as any,
          });
        } else {
          rows.push(emptyCell());
        }
      }

      channels.push({
        id: `ch${t}`,
        name: `SID ${t + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows,
      });
    }

    patterns.push({ id: `p${pos}`, name: `Pattern ${pos + 1}`, channels, length: patternLength });
    songPositions.push(pos);
  }

  // ── Build PSID header for audio playback ──────────────────────────────
  const driverName = descriptor.driverName.replace(/[^\x20-\x7E]/g, ' ').trim();
  const title = filename.replace(/\.sf2$/i, '');
  const psidHeader = buildPSIDHeader(
    driverCommon.initAddress,
    driverCommon.updateAddress,
    title,
    `SF2 Driver ${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')}`,
  );

  // Combine PSID header + full PRG data (including 2-byte load address)
  // PSID header has loadAddress=0, so the emulator reads the 2-byte addr from data
  const sidFile = new Uint8Array(psidHeader.length + raw.length);
  sidFile.set(psidHeader, 0);
  sidFile.set(raw, psidHeader.length);

  // BPM: PAL = 50Hz CIA timer, speed typically starts at 4-6
  // SF2 uses the driver's tempo system, default ~50Hz
  const speed = 6;
  const bpm = 125; // 50Hz PAL standard

  console.log(`[SF2] Parsed: "${title}" driver=${driverName} v${descriptor.versionMajor}.${String(descriptor.versionMinor).padStart(2, '0')} tracks=${numChannels} seqs=${usedSeqs.size} patterns=${patterns.length}`);

  // ── Build SF2 store data for the format editor ────────────────────────
  // Collect all sequences into a Map<seqIdx, SeqEvent[]>
  const sequenceMap = new Map<number, { note: number; instrument: number; command: number }[]>();
  for (const seqIdx of usedSeqs) {
    sequenceMap.set(seqIdx, readSequence(seqIdx));
  }

  // Build instrument data from driver tables
  const instrTableDef = tableDefs.find(t => t.type === 0x80);
  const sf2Instruments: { rawBytes: Uint8Array; name: string }[] = [];
  if (instrTableDef) {
    for (let i = 0; i < instrTableDef.rowCount && i < 64; i++) {
      const addr = instrTableDef.address + i * instrTableDef.columnCount;
      const rawBytes = new Uint8Array(instrTableDef.columnCount);
      for (let b = 0; b < instrTableDef.columnCount; b++) {
        rawBytes[b] = mem[addr + b];
      }
      sf2Instruments.push({
        rawBytes,
        name: i < instrumentDescriptions.length ? instrumentDescriptions[i] : `Inst ${i + 1}`,
      });
    }
  }

  return {
    name: title,
    format: 'SID' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm,
    c64SidFileData: sidFile,
    sf2StoreData: {
      rawFileData: raw,
      loadAddress: loadAddr,
      descriptor,
      driverCommon,
      musicData,
      tableDefs,
      instrumentDescriptions,
      c64Memory: mem,
      sequences: sequenceMap,
      orderLists,
      instruments: sf2Instruments,
      songName: title,
    },
  };
}
