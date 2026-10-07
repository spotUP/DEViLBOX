/**
 * FuturePlayerParser.ts — Future Player Amiga format (.fp / FP.*) native parser
 *
 * Future Player is an Amiga 4-channel music player by Paul van der Valk.
 * Files are typically named with a "FP." prefix or ".fp" extension.
 *
 * This parser:
 *   1. Strips the AmigaDOS hunk header to find the code section
 *   2. Walks subsong 0 with the replayer's own reader (fpWalk.ts, held to the original 68k player in UADE
 *      by futurePlayerWalkMatchesPlayer.test.ts) and draws that walk as the grid (fpGrid.ts): one row per
 *      `speed` interrupts, notes named by the period the voice plays, instruments on note starts, note-offs
 *      only where a voice stops, commands in the effect columns (fpEffectGlyphs.ts)
 *   3. Carries the module's blocks byte-exact (uadeVariableLayout) and records what each cell was drawn
 *      from, so a grid edit is a byte patch of its command (fpGridEdits.ts)
 *   4. Stores the raw binary for WASM native playback
 *
 * A song the walk cannot be matched to opens in the scope view (gridUnmatchedReason), never a guessed grid.
 *
 * Reference: futureplayer-wasm/src/FuturePlayer.c (transpiled from 68k ASM)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { FuturePlayerConfig } from '@/types/instrument/exotic';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeFuturePlayerPattern } from '@/engine/uade/encoders/FuturePlayerEncoder';
import { fpCodeSection, fpSongs, walkFuturePlayer, FP_WALK, type FpWalk } from './fpWalk';
import { buildFpGridFromWalk, type FpGrid } from './fpGrid';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function rd8(code: Uint8Array, ptr: number): number {
  return ptr < code.length ? code[ptr] : 0;
}

function rd32(code: Uint8Array, ptr: number): number {
  return ptr + 3 < code.length ? u32BE(code, ptr) : 0;
}

function rd16(code: Uint8Array, ptr: number): number {
  return ptr + 1 < code.length ? u16BE(code, ptr) : 0;
}

// ── Format detection ───────────────────────────────────────────────────────

export function isFuturePlayerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 68) return false;

  return (
    u32BE(buf, 0)  === 0x000003F3 &&
    buf[20]        !== 0          &&
    u32BE(buf, 32) === 0x70FF4E75 &&
    u32BE(buf, 36) === 0x462E504C &&
    u32BE(buf, 40) === 0x41594552 &&
    u32BE(buf, 64) !== 0
  );
}

// ── FP note → Amiga period → XM note mapping ──────────────────────────────

// The FP period table spans 8 octaves × 12 notes (indices 0-95).
// FP note values 1-96 map directly to period_table[note-1].
// We convert to XM-style 1-96 note values (C-0 = 1).
function fpNoteToXM(fpNote: number): number {
  if (fpNote === 0 || fpNote > 96) return 0;
  return fpNote;  // FP notes 1-96 map directly to XM notes 1-96
}

// ── Per-voice row data ─────────────────────────────────────────────────────

interface FPRow {
  note: number;       // 0=empty, 1-96=note
  instrument: number; // 0=none, 1+=instrument
  volume: number;     // 0=none
  effTyp: number;
  eff: number;
  effTyp2: number;
  eff2: number;
}

// ── Per-block decode for the structural raw-block carrier ───────────────────
//
// Future Player voice data is not a single contiguous stream: a voice is a
// call-GRAPH over shared command BLOCKS (subroutine bodies + top-level voice
// sequences), each addressed by a code pointer. Every block IS a real
// contiguous byte range that runs from its start to its terminator — cmd 0
// (end / return-from-sub) or cmd 7 (unconditional jump). cmd 6 (call) does NOT
// terminate: the replayer returns just after the 4-byte pointer, so the block
// continues linearly. Notes are 2 bytes and continue.
//
// decodeBlock walks ONE block in isolation (never following calls/jumps),
// returns its real byte size, its decoded baseline rows, and the call/jump
// targets it references (so the parser can enumerate the whole reachable graph).

interface DecodedBlock {
  size: number;         // real byte length [start, start+size)
  rows: FPRow[];        // decoded baseline rows (carrier truth)
  targets: number[];    // cmd6/cmd7 target seq pointers (code-relative)
}

function decodeBlock(
  code: Uint8Array,
  start: number,
  instrumentMap: Map<number, number>,
): DecodedBlock {
  const rows: FPRow[] = [];
  const targets: number[] = [];
  let p = start;
  let currentInstr = 0;
  let guard = 0;
  const MAX = 100000;

  while (p < code.length && guard < MAX) {
    guard++;
    const byte0 = rd8(code, p);
    p++;

    if (byte0 & 0x80) {
      const cmdNum = byte0 & 0x3f;
      p++; // arg byte (always consumed)

      switch (cmdNum) {
        case 0: // end voice / return — block terminator
          return { size: p - start, rows, targets };
        case 1: { // set instrument (4-byte ptr)
          const instrPtr = rd32(code, p);
          p += 4;
          // a null pointer is no instrument (the player would read garbage): no slot, instrument 0
          if (instrPtr !== 0 && !instrumentMap.has(instrPtr)) {
            instrumentMap.set(instrPtr, instrumentMap.size + 1);
          }
          currentInstr = instrPtr === 0 ? 0 : instrumentMap.get(instrPtr)!;
          break;
        }
        case 2: // set arpeggio table (4-byte ptr)
          p += 4;
          break;
        case 4: // set portamento (2-byte word)
          p += 2;
          break;
        case 6: { // call subroutine — continues linearly after the ptr
          const targetPtr = rd32(code, p);
          const seqData = rd32(code, targetPtr + 8);
          targets.push(seqData);
          p += 4;
          break;
        }
        case 7: { // jump pattern — block terminator
          const targetPtr = rd32(code, p);
          const seqData = rd32(code, targetPtr + 8);
          targets.push(seqData);
          p += 4;
          return { size: p - start, rows, targets };
        }
        default: // 3,5,8,9,10,11,12,13,14 — no extra operand
          break;
      }
      continue;
    }

    // Note or rest + duration
    const note = byte0;
    const dur = rd8(code, p);
    p++;
    const duration = dur & 0x80 ? (dur & 0x7f) : dur;

    rows.push({
      note: fpNoteToXM(note),
      instrument: note > 0 ? currentInstr : 0,
      volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
    });
    for (let d = 1; d < duration; d++) {
      rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    }
  }

  return { size: p - start, rows, targets };
}

// ── Extract strings from code section ──────────────────────────────────────

function readCString(code: Uint8Array, ptr: number, maxLen = 64): string {
  if (ptr === 0 || ptr >= code.length) return '';
  let s = '';
  for (let i = 0; i < maxLen && ptr + i < code.length; i++) {
    const c = code[ptr + i];
    if (c === 0) break;
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Main parser ────────────────────────────────────────────────────────────

export interface FpModuleGrid {
  /** The module's code section (every pointer in the module is an offset into it). */
  code: Uint8Array;
  /** The walk of subsong 0; null when the module has none. */
  walk: FpWalk | null;
  /** The grid drawn from the walk; null when it cannot be matched (the song opens in the scope view). */
  grid: FpGrid | null;
  /** Why there is no grid. */
  unmatched?: string;
  /** Instrument pointer -> 1-based instrument id, in the order the walk first sets them (the carrier adds the rest). */
  instrumentMap: Map<number, number>;
}

/** Walk subsong 0 of a module with the replayer's own reader and draw it as the grid. */
export function buildFuturePlayerGrid(rawBuf: Uint8Array): FpModuleGrid {
  const code = fpCodeSection(rawBuf);
  const walk = walkFuturePlayer(code, 0);
  const instrumentMap = new Map<number, number>();
  const arpMap = new Map<number, number>();
  if (walk) {
    // Instruments in the order the walk first sets them, voice by voice as they happen
    for (const e of walk.events) {
      if (e.kind === FP_WALK.instrument && e.a !== 0 && !instrumentMap.has(e.a)) instrumentMap.set(e.a, instrumentMap.size + 1);
      if (e.kind === FP_WALK.arpTable && !arpMap.has(e.a)) arpMap.set(e.a, arpMap.size + 1);
    }
  }
  if (!walk) return { code, walk, grid: null, unmatched: 'the module has no subsong 0 to walk', instrumentMap };
  const grid = buildFpGridFromWalk(walk, {
    code,
    instrId: (ptr) => instrumentMap.get(ptr) ?? 0,
    arpId: (ptr) => arpMap.get(ptr) ?? 0,
  });
  if (grid.unnamedNotes > 0) {
    return { code, walk, grid: null, unmatched: `${grid.unnamedNotes} notes play table entries past the period table`, instrumentMap };
  }
  return { code, walk, grid, instrumentMap };
}

/** The config of an instrument whose data cannot be read: every slot is kept. */
function emptyFuturePlayerConfig(): FuturePlayerConfig {
  return {
    isWavetable: false,
    volume: 64,
    attackRate: 16, attackPeak: 255,
    decayRate: 4, sustainLevel: 128,
    sustainRate: 0, sustainTarget: 128,
    releaseRate: 8,
    pitchMod1Delay: 0, pitchMod1Shift: 0, pitchMod1Mode: 0, pitchMod1Negate: false, hasPitchMod1: false,
    pitchMod2Delay: 0, pitchMod2Shift: 0, pitchMod2Mode: 0, pitchMod2Negate: false, hasPitchMod2: false,
    sampleMod1Delay: 0, sampleMod1Shift: 0, sampleMod1Mode: 0, hasSampleMod1: false,
    sampleMod2Delay: 0, sampleMod2Shift: 0, sampleMod2Mode: 0, hasSampleMod2: false,
    sampleSize: 0,
  };
}

export function parseFuturePlayerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const rawBuf = new Uint8Array(buffer);

  if (!isFuturePlayerFormat(rawBuf)) {
    throw new Error('Not a Future Player module');
  }

  const code = fpCodeSection(rawBuf);

  // Verify code section signature
  if (code.length < 44 || u32BE(code, 0) !== 0x70FF4E75) {
    throw new Error('Invalid Future Player code section');
  }

  // ── Header parsing ──────────────────────────────────────────────────

  const songNamePtr = rd32(code, 12);
  const authorNamePtr = rd32(code, 16);
  const songName = readCString(code, songNamePtr);
  const authorName = readCString(code, authorNamePtr);

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  const moduleName = songName ||
    baseName.replace(/^fp\./i, '').replace(/\.fp$/i, '') || baseName;

  // ── Subsong table (offset 32, 8 bytes per entry) ─────────────────────

  const subsongs = fpSongs(code);
  if (subsongs.length === 0) {
    throw new Error('No subsongs found');
  }
  const sub = subsongs[0];

  // ── Walk subsong 0 with the replayer's own reader, draw it as the grid ─

  const { walk, grid, unmatched, instrumentMap } = buildFuturePlayerGrid(rawBuf);
  const ROWS_PER_PATTERN = 64;

  let patterns: TrackerSong['patterns'];
  let songPositions: number[];
  let restartPosition = 0;
  if (grid) {
    patterns = grid.patterns.map((pat) => ({
      ...pat,
      importMetadata: {
        sourceFormat: 'FuturePlayer' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: grid!.patterns.length,
        originalInstrumentCount: instrumentMap.size,
      },
    }));
    songPositions = grid.songPositions;
    restartPosition = grid.layout.restartPosition;
  } else {
    // No guessed grid: the song opens in the scope view (gridUnmatchedReason) over an empty pattern.
    console.warn(`[FuturePlayerParser] ${filename}: no grid - ${unmatched}`);
    patterns = [{
      id: 'pattern-0',
      name: 'Pattern 0',
      length: ROWS_PER_PATTERN,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null, color: null,
        rows: Array.from({ length: ROWS_PER_PATTERN }, () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })),
      })),
      importMetadata: {
        sourceFormat: 'FuturePlayer' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: 1,
        originalInstrumentCount: instrumentMap.size,
      },
    }];
    songPositions = [0];
  }

  // ── Build instruments list ──────────────────────────────────────────

  // Read instrument metadata and detail parameters from binary
  function extractInstrumentConfig(instrPtr: number): { meta: { isWavetable: boolean; sampleSize: number }; config: FuturePlayerConfig } | null {
    if (instrPtr === 0 || instrPtr + 16 > code.length) return null;
    const sampInfoPtr = rd32(code, instrPtr + 8);
    if (sampInfoPtr === 0 || sampInfoPtr + 14 > code.length) return null;
    const wtFlag = rd8(code, sampInfoPtr + 8);
    const isWavetable = wtFlag !== 0;
    // The sample struct sits behind the sample info (replayer: sample_ptr =
    // RD32(samp_info + 10); length in bytes at sample_ptr + 12, data at + 8).
    // Reading the length from the sample info itself gave 0 for every
    // instrument, so every one was skipped and the song showed a single
    // whole-song placeholder.
    const sampleStructPtr = isWavetable ? 0 : rd32(code, sampInfoPtr + 10);
    const sampleSize = sampleStructPtr !== 0 && sampleStructPtr + 14 <= code.length ? rd16(code, sampleStructPtr + 12) : 0;

    // Read detail pointer (instrPtr + 12)
    const detailPtr = rd32(code, instrPtr + 12);
    if (detailPtr === 0 || detailPtr + 0x3A > code.length) {
      // No detail data available — return basic config
      return {
        meta: { isWavetable, sampleSize },
        config: {
          isWavetable,
          volume: 64,
          attackRate: 16, attackPeak: 255,
          decayRate: 4, sustainLevel: 128,
          sustainRate: 0, sustainTarget: 128,
          releaseRate: 8,
          pitchMod1Delay: 0, pitchMod1Shift: 0, pitchMod1Mode: 0, pitchMod1Negate: false, hasPitchMod1: false,
          pitchMod2Delay: 0, pitchMod2Shift: 0, pitchMod2Mode: 0, pitchMod2Negate: false, hasPitchMod2: false,
          sampleMod1Delay: 0, sampleMod1Shift: 0, sampleMod1Mode: 0, hasSampleMod1: false,
          sampleMod2Delay: 0, sampleMod2Shift: 0, sampleMod2Mode: 0, hasSampleMod2: false,
          sampleSize,
        },
      };
    }

    // Extract detail fields (offsets match FuturePlayer.c update_audio).
    // detailPtr is the absolute byte offset of the detail struct inside the
    // loaded module buffer — passed through to the editor so it can write
    // back to the running WASM via FuturePlayerEngine.writeByte.
    const config: FuturePlayerConfig = {
      isWavetable,
      detailPtr,
      volume: rd8(code, detailPtr + 0x08),
      attackRate: rd8(code, detailPtr + 0x12),
      attackPeak: rd8(code, detailPtr + 0x13),
      decayRate: rd8(code, detailPtr + 0x14),
      sustainLevel: rd8(code, detailPtr + 0x15),
      sustainRate: rd8(code, detailPtr + 0x16),
      sustainTarget: rd8(code, detailPtr + 0x17),
      releaseRate: rd8(code, detailPtr + 0x18),
      // Pitch mod 1
      hasPitchMod1: rd32(code, detailPtr + 0x1A) !== 0,
      pitchMod1Shift: rd8(code, detailPtr + 0x1E),
      pitchMod1Delay: rd8(code, detailPtr + 0x1F),
      pitchMod1Mode: rd8(code, detailPtr + 0x20),
      pitchMod1Negate: rd8(code, detailPtr + 0x21) !== 0,
      // Pitch mod 2
      hasPitchMod2: rd32(code, detailPtr + 0x22) !== 0,
      pitchMod2Shift: rd8(code, detailPtr + 0x26),
      pitchMod2Delay: rd8(code, detailPtr + 0x27),
      pitchMod2Mode: rd8(code, detailPtr + 0x28),
      pitchMod2Negate: rd8(code, detailPtr + 0x29) !== 0,
      // Sample mod 1
      hasSampleMod1: rd32(code, detailPtr + 0x2A) !== 0,
      sampleMod1Shift: rd8(code, detailPtr + 0x2E),
      sampleMod1Delay: rd8(code, detailPtr + 0x2F),
      sampleMod1Mode: rd8(code, detailPtr + 0x30),
      // Sample mod 2
      hasSampleMod2: rd32(code, detailPtr + 0x32) !== 0,
      sampleMod2Shift: rd8(code, detailPtr + 0x36),
      sampleMod2Delay: rd8(code, detailPtr + 0x37),
      sampleMod2Mode: rd8(code, detailPtr + 0x38),
      sampleSize,
    };

    return { meta: { isWavetable, sampleSize }, config };
  }

  // ── The module's blocks: every one carried byte-exact ──────────────────────
  // FP voice data is a call-GRAPH over shared command BLOCKS, each a REAL
  // contiguous byte range (start -> cmd0/cmd7 terminator). Enumerate every
  // reachable block of subsong 0 (BFS from the voice sequence pointers,
  // following cmd6/cmd7 targets), dedupe by code offset, and carry each block's
  // real bytes + decoded baseline rows. encodeVariableBlock re-emits them
  // verbatim when unedited (byte-exact) and falls back to the packer on edit.
  // numChannels=1 because a block is not owned by one channel — the flat block
  // list is the file-pattern dimension. The blocks also name every instrument
  // subsong 0's streams set, so each gets its slot even where the walk never plays it.
  // code-relative ptr -> file offset: where the hunk's code starts in the file (not file length minus code length: relocations follow the code)
  const hdrOffset = code.byteOffset - rawBuf.byteOffset;

  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const blockRawBytes: Uint8Array[] = [];
  const blockRows: FPRow[][] = [];
  const seenBlocks = new Set<number>();
  const queue: number[] = sub.voiceSeqPtrs.filter(p => p > 0);
  while (queue.length > 0) {
    const off = queue.shift()!;
    if (off <= 0 || off >= code.length || seenBlocks.has(off)) continue;
    seenBlocks.add(off);
    const block = decodeBlock(code, off, instrumentMap);
    if (block.size <= 0) continue;
    const fileOff = hdrOffset + off;
    if (fileOff < 0 || fileOff + block.size > rawBuf.length) continue;
    filePatternAddrs.push(fileOff);
    filePatternSizes.push(block.size);
    blockRawBytes.push(rawBuf.slice(fileOff, fileOff + block.size));
    blockRows.push(block.rows);
    for (const t of block.targets) {
      if (t > 0 && t < code.length && !seenBlocks.has(t)) queue.push(t);
    }
  }

  // One FuturePlayerSynth per instrument pointer the module sets: every slot kept, none named (the module has no names)
  const instruments: InstrumentConfig[] = [];
  instrumentMap.forEach((id, instrPtr) => {
    const extracted = extractInstrumentConfig(instrPtr);
    const config: FuturePlayerConfig = extracted?.config ?? emptyFuturePlayerConfig();
    const meta = extracted?.meta ?? { isWavetable: false, sampleSize: 0 };
    instruments.push({
      id,
      name: '',
      type: 'synth' as const,
      synthType: 'FuturePlayerSynth' as const,
      effects: [],
      volume: -6,
      pan: 0,
      futurePlayer: config,
      metadata: { fpInstrPtr: instrPtr, fpIsWavetable: meta.isWavetable, fpSampleSize: meta.sampleSize, fpOctaveBias: grid?.bias ?? 0 },
    } as unknown as InstrumentConfig);
  });

  // ── Tempo: a row is `speed` player interrupts, the interrupt is the module's own CIA timer ──

  // tracker tick = 2.5 / BPM seconds, so BPM = 2.5 * interrupts per second (50 Hz -> 125)
  const initialSpeed = walk ? walk.speed : sub.speed;
  const initialBPM = walk ? Math.round(walk.tickHz * 2.5 * 100) / 100 : 125;

  const displayName = authorName
    ? `${moduleName} by ${authorName} [Future Player]`
    : `${moduleName} [Future Player]`;

  // trackMap is unused when blockRows is present (harness reads blockRows), but
  // the type requires it. One empty entry per tracker pattern is a safe default.
  const trackMap: number[][] = patterns.map(() => []);

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'futurePlayer',
    numChannels: 1,
    numFilePatterns: filePatternAddrs.length,
    rowsPerPattern: patterns.map((pat) => pat.length),
    moduleSize: rawBuf.length,
    encoder: {
      formatId: 'futurePlayer',
      encodePattern: encodeFuturePlayerPattern,
    },
    filePatternAddrs,
    filePatternSizes,
    blockRawBytes,
    blockRows,
    trackMap,
  };

  return {
    name: displayName,
    format: 'FuturePlayer' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition,
    numChannels: 4,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    futurePlayerFileData: buffer.slice(0),
    uadeVariableLayout,
    ...(grid ? {} : { gridUnmatchedReason: unmatched ?? 'the grid was not matched to the player' }),
  };
}
