/**
 * CheeseCutterParser.ts — CheeseCutter (.ct) file format parser
 *
 * CheeseCutter is a C64 SID music tracker. The .ct format stores a 64KB C64
 * memory image plus metadata, instruments, sequences, and track lists.
 *
 * Binary format: 3-byte magic "CC2" + zlib-compressed payload (167,832 bytes).
 *
 * Audio playback: wraps the C64 memory image in a PSID v2 header → C64SIDEngine
 * Pattern display: extracts sequences + order lists from structured metadata
 *
 * References:
 *   - https://github.com/theyamo/CheeseCutter
 *   - CheeseCutter source: src/cht2/song.d (binary format)
 */

import pako from 'pako';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig } from '@/types/instrument/defaults';
import type {
  CheeseCutterLoadPayload,
  CCSequenceRow,
  CCTrackListEntry,
  CCInstrument,
  CCWaveTable,
} from '@/stores/useCheeseCutterStore';

// ── Constants ────────────────────────────────────────────────────────────

const CC2_MAGIC = [0x43, 0x43, 0x32]; // "CC2"
const C64_MEM_SIZE = 0x10000; // 64KB
const MIN_DECOMPRESSED_SIZE = C64_MEM_SIZE + 256;
const META_BASE = 0x10000;
const POINTER_TABLE_ADDR = 0x0FA0;
const POINTER_TABLE_COUNT = 96;
const MAX_SEQ_ROWS = 64;
const MAX_INSTRUMENTS = 48;
const MAX_SEQUENCES = 128;
const MAX_SUBTUNES = 32;
const INST_NAME_LEN = 32;
const METADATA_STR_LEN = 32;

// Metadata offsets (relative to META_BASE)
const OFF_VERSION       = 0x00000;
const OFF_CLOCK         = 0x00001;
const OFF_SPEED_MULT    = 0x00002;
const OFF_SID_MODEL     = 0x00003;
// OFF_FILTER_PRESET    = 0x00004;  // not used in TrackerSong
const OFF_SUBTUNE_SPEEDS = 0x00005; // 32 bytes (version >= 6)
const OFF_HIGHLIGHT      = 0x00025; // (version > 10)
const OFF_HIGHLIGHT_OFF  = 0x00026; // (version > 10)

// Absolute offsets in the decompressed payload:
const ABS_TITLE    = 0x10105;
const ABS_AUTHOR   = 0x10125;
const ABS_RELEASE  = 0x10145;
// Insnames = Title + 40*4 = 0x10105 + 160 = 0x101A5
const ABS_INST_NAMES = 0x101A5;  // 48 × 32 bytes
// Subtunes = Insnames + 1024*2 = 0x101A5 + 2048 = 0x109A5
const ABS_SUBTUNE_TRACKS = 0x109A5; // ubyte[1024][3][32]

// Pointer table key indices
const PTR_ARP1    = 14; // Wave table start
const PTR_FILTTAB = 16; // Filter table
const PTR_PULSTAB = 17; // Pulse table
const PTR_INST    = 18; // Instrument table
const PTR_TRACK1  = 19; // Track list voice 1
const PTR_TRACK2  = 20; // Track list voice 2
const PTR_TRACK3  = 21; // Track list voice 3
const PTR_SEQLO   = 22; // Sequence pointer LO bytes
const PTR_SEQHI   = 23; // Sequence pointer HI bytes
const PTR_CMD1    = 24; // Command table

// Sequence byte meanings
const SEQ_END_MARKER = 0xBF;
const SEQ_INST_NONE  = 0xF0;
const SEQ_INST_BASE  = 0xC0;
const SEQ_TIE_YES    = 0x5F;
const SEQ_NOTE_BASE  = 0x60;

// ── Helpers ──────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function readStr(data: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const b = data[off + i];
    if (b === 0) break;
    if (b >= 0x20 && b <= 0x7E) {
      s += String.fromCharCode(b);
    } else {
      s += ' ';
    }
  }
  return s.trim();
}

function readWord(data: Uint8Array, off: number): number {
  return data[off] | (data[off + 1] << 8);
}

/**
 * Convert CheeseCutter note index to tracker note value.
 * CC note byte = 0x60+n: 0=empty, 1=OFF, 2=ON, 3-94=C-0 through B-7
 * TrackerSong: 0=empty, 97=note off, 1-96=notes (C-0=1, C#0=2, ...)
 */
export function ccNoteToTracker(rawNote: number): number {
  const n = rawNote - SEQ_NOTE_BASE;
  if (n <= 0) return 0;        // empty
  if (n === 1) return 97;      // note OFF
  if (n === 2) return 0;       // note ON (gate on, no pitch change) — treat as empty
  // n=3 → C-0 → tracker note 1
  // n=4 → C#0 → tracker note 2
  const note = n - 2;          // 1-92
  return note >= 1 && note <= 96 ? note : 0;
}

// ── Detection ────────────────────────────────────────────────────────────

/**
 * Check if a buffer is a CheeseCutter .ct file.
 * First 3 bytes must be "CC2" (0x43, 0x43, 0x32).
 */
export function isCheeseCutterFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const data = new Uint8Array(buffer);
  return data[0] === CC2_MAGIC[0] && data[1] === CC2_MAGIC[1] && data[2] === CC2_MAGIC[2];
}

// ── Parser ───────────────────────────────────────────────────────────────

export async function parseCheeseCutterFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const raw = new Uint8Array(buffer);

  // Strip the 3-byte "CC2" magic and decompress the rest
  const compressed = raw.subarray(3);
  let data: Uint8Array;
  try {
    data = pako.inflate(compressed);
  } catch (e) {
    throw new Error(`CheeseCutter: zlib decompression failed — ${e}`);
  }

  if (data.length < MIN_DECOMPRESSED_SIZE) {
    throw new Error(
      `CheeseCutter: decompressed size ${data.length} too small (need at least ${MIN_DECOMPRESSED_SIZE})`,
    );
  }

  // ── C64 memory image (first 64KB) ───────────────────────────────────
  const mem = data.subarray(0, C64_MEM_SIZE);

  // ── Metadata ────────────────────────────────────────────────────────
  const version = data[META_BASE + OFF_VERSION];
  const clock = data[META_BASE + OFF_CLOCK]; // 0=PAL, 1=NTSC
  const speedMultiplier = data[META_BASE + OFF_SPEED_MULT] || 1;
  const sidModel = data[META_BASE + OFF_SID_MODEL]; // 0=6581, 1=8580

  // Per-subtune speeds (version >= 6)
  const subtuneSpeeds: number[] = [];
  if (version >= 6) {
    for (let i = 0; i < MAX_SUBTUNES; i++) {
      subtuneSpeeds.push(data[META_BASE + OFF_SUBTUNE_SPEEDS + i]);
    }
  } else {
    // Default speed
    subtuneSpeeds.push(6);
  }

  // Highlight (version > 10)
  const highlight = version > 10 ? data[META_BASE + OFF_HIGHLIGHT] || 4 : 4;
  const highlightOffset = version > 10 ? data[META_BASE + OFF_HIGHLIGHT_OFF] : 0;

  // Strings (bounds-guarded — newer versions may have different layouts)
  const title = ABS_TITLE + METADATA_STR_LEN <= data.length
    ? readStr(data, ABS_TITLE, METADATA_STR_LEN) : filename.replace(/\.ct$/i, '');
  const author = ABS_AUTHOR + METADATA_STR_LEN <= data.length
    ? readStr(data, ABS_AUTHOR, METADATA_STR_LEN) : '';
  const release = ABS_RELEASE + METADATA_STR_LEN <= data.length
    ? readStr(data, ABS_RELEASE, METADATA_STR_LEN) : '';

  // Instrument names (bounds-guarded)
  const instrumentNames: string[] = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const off = ABS_INST_NAMES + i * INST_NAME_LEN;
    instrumentNames.push(off + INST_NAME_LEN <= data.length
      ? readStr(data, off, INST_NAME_LEN) : '');
  }

  // ── Pointer table ───────────────────────────────────────────────────
  const ptrs: number[] = [];
  for (let i = 0; i < POINTER_TABLE_COUNT; i++) {
    ptrs.push(readWord(mem, POINTER_TABLE_ADDR + i * 2));
  }

  // ── Wave table (PTR_ARP1): 256+256 bytes ────────────────────────────
  const waveAddr = ptrs[PTR_ARP1];
  let waveTable: CCWaveTable | null = null;
  if (waveAddr && waveAddr + 512 <= C64_MEM_SIZE) {
    waveTable = {
      wave1: mem.slice(waveAddr, waveAddr + 256),
      wave2: mem.slice(waveAddr + 256, waveAddr + 512),
    };
  }

  // ── Filter table (PTR_FILTTAB): 64×4 bytes ─────────────────────────
  const filtAddr = ptrs[PTR_FILTTAB];
  let filterTable: Uint8Array | null = null;
  if (filtAddr && filtAddr + 256 <= C64_MEM_SIZE) {
    filterTable = mem.slice(filtAddr, filtAddr + 256);
  }

  // ── Pulse table (PTR_PULSTAB): 64×4 bytes ──────────────────────────
  const pulsAddr = ptrs[PTR_PULSTAB];
  let pulseTable: Uint8Array | null = null;
  if (pulsAddr && pulsAddr + 256 <= C64_MEM_SIZE) {
    pulseTable = mem.slice(pulsAddr, pulsAddr + 256);
  }

  // ── Command table (PTR_CMD1): 4×64 bytes ───────────────────────────
  const cmdAddr = ptrs[PTR_CMD1];
  let commandTable: Uint8Array | null = null;
  if (cmdAddr && cmdAddr + 256 <= C64_MEM_SIZE) {
    commandTable = mem.slice(cmdAddr, cmdAddr + 256);
  }

  // ── Instruments (PTR_INST): 48×8, column-major ─────────────────────
  const instAddr = ptrs[PTR_INST];
  const ccInstruments: CCInstrument[] = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const bytes: number[] = [];
    // Column-major: byte j of instrument i is at instAddr + j*48 + i
    for (let j = 0; j < 8; j++) {
      const addr = instAddr + j * MAX_INSTRUMENTS + i;
      bytes.push(addr < C64_MEM_SIZE ? mem[addr] : 0);
    }
    ccInstruments.push({
      name: instrumentNames[i],
      ad: bytes[0],
      sr: bytes[1],
      wavePtr: bytes[2],
      pulsePtr: bytes[3],
      filterPtr: bytes[4],
      bytes,
    });
  }

  // ── Sequence pointer tables ─────────────────────────────────────────
  const seqLoAddr = ptrs[PTR_SEQLO];
  const seqHiAddr = ptrs[PTR_SEQHI];

  // Resolve sequence addresses from LO/HI tables
  const seqAddrs: number[] = [];
  for (let i = 0; i < MAX_SEQUENCES; i++) {
    const lo = seqLoAddr + i < C64_MEM_SIZE ? mem[seqLoAddr + i] : 0;
    const hi = seqHiAddr + i < C64_MEM_SIZE ? mem[seqHiAddr + i] : 0;
    seqAddrs.push(lo | (hi << 8));
  }

  // ── Parse all sequences ─────────────────────────────────────────────
  const sequences: Array<{ rows: CCSequenceRow[] }> = [];
  for (let i = 0; i < MAX_SEQUENCES; i++) {
    const addr = seqAddrs[i];
    const rows: CCSequenceRow[] = [];
    if (addr > 0 && addr + 4 <= C64_MEM_SIZE) {
      for (let r = 0; r < MAX_SEQ_ROWS; r++) {
        const off = addr + r * 4;
        if (off + 3 >= C64_MEM_SIZE) break;
        const b0 = mem[off];
        if (b0 === SEQ_END_MARKER) break;
        const b1 = mem[off + 1];
        const b2 = mem[off + 2];
        const b3 = mem[off + 3];
        rows.push({
          instrument: b0 >= SEQ_INST_BASE && b0 < SEQ_INST_NONE ? b0 - SEQ_INST_BASE : -1,
          tied: b1 === SEQ_TIE_YES,
          note: b2 - SEQ_NOTE_BASE,
          command: b3,
        });
      }
    }
    sequences.push({ rows });
  }

  // ── Track lists (per voice) ─────────────────────────────────────────
  const trackPtrs = [ptrs[PTR_TRACK1], ptrs[PTR_TRACK2], ptrs[PTR_TRACK3]];
  const trackLists: Array<CCTrackListEntry[]> = [[], [], []];

  for (let v = 0; v < 3; v++) {
    const tAddr = trackPtrs[v];
    if (!tAddr || tAddr >= C64_MEM_SIZE) continue;
    for (let e = 0; e < 512; e++) {
      const off = tAddr + e * 2;
      if (off + 1 >= C64_MEM_SIZE) break;
      const b0 = mem[off];
      const b1 = mem[off + 1];
      const isEnd = b0 >= 0xF0;
      let transpose = 0;
      if (b0 !== 0x80 && !isEnd) {
        transpose = b0 >= 0x81 && b0 <= 0xBF ? b0 - 0xA0 : 0;
      }
      trackLists[v].push({
        transpose,
        sequence: b1,
        isEnd,
      });
      if (isEnd) break;
    }
  }

  // ── Count subtunes ──────────────────────────────────────────────────
  // Subtune track data at ABS_SUBTUNE_TRACKS: ubyte[1024][3][32]
  // A subtune is non-empty if any of its 1024×3 bytes are non-zero
  let subtuneCount = 1;
  for (let st = 0; st < MAX_SUBTUNES; st++) {
    let hasData = false;
    const stBase = ABS_SUBTUNE_TRACKS + st * (1024 * 3);
    for (let b = 0; b < 1024 * 3 && !hasData; b++) {
      if (stBase + b < data.length && data[stBase + b] !== 0) hasData = true;
    }
    if (hasData) subtuneCount = st + 1;
  }

  // ── Compute BPM ─────────────────────────────────────────────────────
  const speed = subtuneSpeeds[0] || 6;
  // PAL: 50 Hz VBI, NTSC: 60 Hz VBI
  const vbiRate = clock === 1 ? 60 : 50;
  // BPM = (vbiRate / speed) * 60 / 4  (assuming 4 rows per beat)
  // Simplified: BPM = vbiRate * 60 / (speed * 4) = vbiRate * 15 / speed
  const bpm = Math.round((vbiRate * 15) / speed);

  // ── Build PSID header ───────────────────────────────────────────────
  const psidHeader = new Uint8Array(124);
  const psidView = new DataView(psidHeader.buffer);

  // Magic "PSID"
  psidHeader[0] = 0x50; psidHeader[1] = 0x53;
  psidHeader[2] = 0x49; psidHeader[3] = 0x44;

  psidView.setUint16(4, 0x0002);  // version = 2
  psidView.setUint16(6, 0x007C);  // dataOffset = 124
  psidView.setUint16(8, 0x0000);  // loadAddress (in data)
  psidView.setUint16(10, 0x1000); // initAddress
  psidView.setUint16(12, 0x1003); // playAddress
  psidView.setUint16(14, subtuneCount); // songs
  psidView.setUint16(16, 0x0001); // startSong
  psidView.setUint32(18, 0x00000000); // speed (VBI for all)

  // Title (32 bytes at offset 22)
  const titleBytes = new TextEncoder().encode(title.substring(0, 31));
  psidHeader.set(titleBytes, 22);

  // Author (32 bytes at offset 54)
  const authorBytes = new TextEncoder().encode(author.substring(0, 31));
  psidHeader.set(authorBytes, 54);

  // Released (32 bytes at offset 86)
  const releaseBytes = new TextEncoder().encode(release.substring(0, 31));
  psidHeader.set(releaseBytes, 86);

  // Flags at offset 118 (PSID v2)
  // bits 2-3: clock (00=unknown, 01=PAL, 10=NTSC, 11=PAL+NTSC)
  // bits 4-5: SID model (00=unknown, 01=6581, 10=8580, 11=6581+8580)
  let flags = 0;
  if (clock === 0) flags |= (0x01 << 2);      // PAL
  else if (clock === 1) flags |= (0x02 << 2);  // NTSC
  if (sidModel === 0) flags |= (0x01 << 4);    // 6581
  else if (sidModel === 1) flags |= (0x02 << 4); // 8580
  psidView.setUint16(118, flags);

  // Load $0002-$CFFF: includes zero page vars, frequency tables, pointer
  // table at $0FA0, player at $0E00+, and all music data. Stop before
  // $D000 (I/O space) to leave $D000-$FFFF free for the PSID driver
  // and KERNAL vectors — loading to $FFFF causes websid's "no free
  // memory for driver" error.
  const LOAD_START = 0x0002;
  const LOAD_END = 0xD000; // exclusive — stop before I/O space
  const loadPrefix = new Uint8Array([LOAD_START & 0xFF, LOAD_START >> 8]);
  const memSlice = mem.subarray(LOAD_START, LOAD_END);

  // Assemble PSID file
  const sidFileData = new Uint8Array(124 + 2 + memSlice.length);
  sidFileData.set(psidHeader, 0);
  sidFileData.set(loadPrefix, 124);
  sidFileData.set(memSlice, 126);

  // ── Build patterns for tracker display ──────────────────────────────
  // Determine order length as max non-end entries across the 3 voices
  const orderLengths = trackLists.map(
    tl => tl.findIndex(e => e.isEnd),
  ).map(idx => (idx === -1 ? 0 : idx));
  const maxOrderLen = Math.max(1, ...orderLengths);

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];

  for (let pos = 0; pos < maxOrderLen; pos++) {
    const channels: ChannelData[] = [];
    let patternLength = 0;

    for (let v = 0; v < 3; v++) {
      const entry = pos < orderLengths[v] ? trackLists[v][pos] : null;
      const seqIdx = entry ? entry.sequence : -1;
      const transpose = entry ? entry.transpose : 0;
      const seq = seqIdx >= 0 && seqIdx < sequences.length ? sequences[seqIdx] : null;
      const rows: TrackerCell[] = [];

      if (seq && seq.rows.length > 0) {
        for (const row of seq.rows) {
          const cell = emptyCell();
          // Note
          let rawNote = row.note;
          if (rawNote <= 0) {
            cell.note = 0; // empty
          } else if (rawNote === 1) {
            cell.note = 97; // note OFF
          } else if (rawNote === 2) {
            cell.note = 0; // note ON (gate trigger, no pitch)
          } else {
            // rawNote 3-94 → C-0 through B-7
            let noteVal = rawNote - 2 + transpose;
            noteVal = Math.max(1, Math.min(96, noteVal));
            cell.note = noteVal;
          }

          // Instrument
          if (row.instrument >= 0 && row.instrument < MAX_INSTRUMENTS) {
            cell.instrument = row.instrument + 1; // 1-indexed
          }

          // Tie → effect (use effect column to show tie)
          if (row.tied) {
            cell.effTyp = 0x0C; // volume column could be used, but use effTyp for visibility
            cell.eff = 0x00;    // tie indicator
          }

          // Command → effect column
          if (row.command !== 0) {
            if (row.tied) {
              cell.effTyp2 = row.command >> 4;
              cell.eff2 = row.command & 0x0F;
            } else {
              cell.effTyp = row.command >> 4;
              cell.eff = row.command & 0x0F;
            }
          }

          rows.push(cell);
        }
        patternLength = Math.max(patternLength, rows.length);
      }

      // Pad to at least 1 row
      if (rows.length === 0) rows.push(emptyCell());

      channels.push({
        id: `ch-${v}`,
        name: `Voice ${v + 1}`,
        shortName: `V${v + 1}`,
        rows,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
      });
    }

    // Normalize pattern length — pad shorter channels
    patternLength = Math.max(patternLength, 1);
    for (const ch of channels) {
      while (ch.rows.length < patternLength) {
        ch.rows.push(emptyCell());
      }
    }

    const patIdx = patterns.length;
    patterns.push({
      id: `pat-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: patternLength,
      channels,
    });
    songPositions.push(patIdx);
  }

  // Tag all patterns with sourceFormat so usePatternPlayback routes to C64SIDEngine
  const meta = { sourceFormat: 'SID' as const, originalIndex: 0 };
  for (const p of patterns) (p as any).importMetadata = meta;

  // ── Build instrument configs ────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];
  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    const ci = ccInstruments[i];
    // Only include instruments that have a name or non-zero data
    const hasContent = ci.name.length > 0 || ci.bytes.some(b => b !== 0);
    if (hasContent || i === 0) {
      instruments.push({
        id: i + 1, // 1-indexed
        name: ci.name || `Inst ${i + 1}`,
        type: 'synth',
        synthType: 'C64SID',
      } as unknown as InstrumentConfig);
    }
  }

  // Ensure at least 1 instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Default',
      type: 'synth',
      synthType: 'C64SID',
    } as unknown as InstrumentConfig);
  }

  // ── CheeseCutter store data ─────────────────────────────────────────
  const storeData: CheeseCutterLoadPayload = {
    version,
    clock,
    speedMultiplier,
    sidModel,
    title,
    author,
    release,
    subtuneCount,
    currentSubtune: 0,
    subtuneSpeeds,
    highlight,
    highlightOffset,
    sequences,
    trackLists,
    instruments: ccInstruments,
    waveTable,
    pulseTable,
    filterTable,
    commandTable,
  };

  // ── Assemble TrackerSong ────────────────────────────────────────────
  return {
    name: title || filename.replace(/\.ct$/i, ''),
    format: 'SID',
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: speed,
    initialBPM: bpm,
    c64SidFileData: sidFileData,
    cheeseCutterStoreData: storeData,
  };
}
