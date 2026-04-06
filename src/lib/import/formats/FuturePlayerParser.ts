/**
 * FuturePlayerParser.ts — Future Player Amiga format (.fp / FP.*) native parser
 *
 * Future Player is an Amiga 4-channel music player by Paul van der Valk.
 * Files are typically named with a "FP." prefix or ".fp" extension.
 *
 * This parser:
 *   1. Strips the AmigaDOS hunk header to find the code section
 *   2. Parses the subsong table and voice sequence pointers
 *   3. Linearizes each voice's variable-length byte stream into fixed rows
 *   4. Maps FP commands to tracker effects (instrument, portamento, transpose, etc.)
 *   5. Stores the raw binary for WASM native playback
 *
 * Reference: futureplayer-wasm/src/FuturePlayer.c (transpiled from 68k ASM)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { FuturePlayerConfig } from '@/types/instrument/exotic';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeFuturePlayerPattern } from '@/engine/uade/encoders/FuturePlayerEncoder';

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

// ── Hunk header stripping ──────────────────────────────────────────────────

function stripHunkHeader(buf: Uint8Array): Uint8Array {
  if (buf.length < 20 || u32BE(buf, 0) !== 0x000003F3) return buf;
  const numHunks = u32BE(buf, 8);
  let offset = 20 + numHunks * 4;
  if (offset + 8 <= buf.length && u32BE(buf, offset) === 0x000003E9) {
    const codeSize = u32BE(buf, offset + 4) * 4;
    offset += 8;
    return buf.subarray(offset, offset + codeSize);
  }
  return buf;
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

// ── Linearize voice sequence stream into rows ──────────────────────────────

interface VoiceLinearizeState {
  seqPos: number;
  callStack: number[];
  loopAddrs: number[];
  loopCounts: number[];
  currentInstr: number;
  ended: boolean;
}

function linearizeVoice(
  code: Uint8Array,
  startPos: number,
  maxRows: number,
  instrumentMap: Map<number, number>,
): FPRow[] {
  const rows: FPRow[] = [];
  const st: VoiceLinearizeState = {
    seqPos: startPos,
    callStack: [],
    loopAddrs: [],
    loopCounts: [],
    currentInstr: 0,
    ended: false,
  };

  let safetyCounter = 0;
  const MAX_ITERATIONS = 100000;

  while (rows.length < maxRows && !st.ended && safetyCounter < MAX_ITERATIONS) {
    safetyCounter++;
    const byte0 = rd8(code, st.seqPos);
    st.seqPos++;

    if (byte0 & 0x80) {
      // Command byte
      const cmdNum = ((byte0 << 2) & 0xFF) >> 2;  // == byte0 & 0x3F, i.e. byte0 - 0x80
      const arg = rd8(code, st.seqPos);
      st.seqPos++;

      switch (cmdNum) {
        case 0: // end voice / return from sub
          if (st.callStack.length > 0) {
            st.seqPos = st.callStack.pop()!;
          } else {
            st.ended = true;
          }
          break;

        case 1: { // set instrument (4-byte pointer)
          const instrPtr = rd32(code, st.seqPos);
          st.seqPos += 4;
          if (!instrumentMap.has(instrPtr)) {
            instrumentMap.set(instrPtr, instrumentMap.size + 1);
          }
          st.currentInstr = instrumentMap.get(instrPtr)!;
          break;
        }

        case 2: // set arpeggio table (4-byte ptr)
          st.seqPos += 4;
          break;

        case 3: // reset arpeggio
          break;

        case 4: { // set portamento (2-byte word)
          const rate = rd16(code, st.seqPos);
          st.seqPos += 2;
          // Insert a portamento effect on the next note row
          if (rows.length > 0 && rate > 0) {
            const last = rows[rows.length - 1];
            if (last.effTyp === 0 && last.eff === 0) {
              last.effTyp = 0x03;  // Tone portamento
              last.eff = Math.min(0xFF, rate & 0xFF);
            }
          }
          break;
        }

        case 5: // nop
          break;

        case 6: { // call subroutine (4-byte ptr)
          st.callStack.push(st.seqPos + 4);
          const targetPtr = rd32(code, st.seqPos);
          const seqData = rd32(code, targetPtr + 8);
          st.seqPos = seqData;
          break;
        }

        case 7: { // jump pattern (4-byte ptr)
          const targetPtr2 = rd32(code, st.seqPos);
          const seqData2 = rd32(code, targetPtr2 + 8);
          st.seqPos = seqData2;
          break;
        }

        case 8: { // repeat start
          st.loopAddrs.push(st.seqPos);
          st.loopCounts.push(arg);
          break;
        }

        case 9: { // repeat check (decrement, loop if not done)
          if (st.loopCounts.length > 0) {
            const idx = st.loopCounts.length - 1;
            st.loopCounts[idx]--;
            if (st.loopCounts[idx] > 0 && st.loopAddrs.length > idx) {
              st.seqPos = st.loopAddrs[idx];
            } else {
              st.loopCounts.pop();
              st.loopAddrs.pop();
            }
          }
          break;
        }

        case 10: { // repeat jump (conditional)
          if (st.loopAddrs.length > 0) {
            st.seqPos = st.loopAddrs[st.loopAddrs.length - 1];
          }
          break;
        }

        case 11: // set transpose 1 — map to E5x (fine tune)
          break;

        case 12: // set transpose 2
          break;

        case 13: // check flag
          st.ended = true;
          break;

        case 14: // reset counter (nop)
          break;

        default:
          // Unknown command — safety exit
          st.ended = true;
          break;
      }
      continue;
    }

    // Note or rest + duration
    const note = byte0;  // 0=rest, 1-96=note
    const dur = rd8(code, st.seqPos);
    st.seqPos++;

    const duration = dur & 0x80 ? (dur & 0x7F) : dur;

    // First row gets the note trigger
    const row: FPRow = {
      note: fpNoteToXM(note),
      instrument: note > 0 ? st.currentInstr : 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0,
    };
    rows.push(row);

    // Remaining duration rows are empty (sustain)
    for (let d = 1; d < duration && rows.length < maxRows; d++) {
      rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    }
  }

  // Pad to maxRows if sequence ended early
  while (rows.length < maxRows) {
    rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  }

  return rows;
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

export function parseFuturePlayerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const rawBuf = new Uint8Array(buffer);

  if (!isFuturePlayerFormat(rawBuf)) {
    throw new Error('Not a Future Player module');
  }

  const code = stripHunkHeader(rawBuf);

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

  // ── Parse subsong table (offset 32, 8 bytes per entry) ──────────────

  interface Subsong {
    songDataPtr: number;
    speedVal: number;
    voiceSeqPtrs: number[];
    tickSpeed: number;
  }

  const subsongs: Subsong[] = [];
  let scan = 32;
  while (scan + 8 <= code.length) {
    const songDataPtr = rd32(code, scan);
    if (songDataPtr === 0) break;
    const speedVal = rd16(code, scan + 4);

    const voiceSeqPtrs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const blockPtr = rd32(code, songDataPtr + 8 + i * 4);
      if (blockPtr !== 0 && blockPtr + 8 < code.length) {
        voiceSeqPtrs.push(rd32(code, blockPtr + 8));
      } else {
        voiceSeqPtrs.push(0);
      }
    }

    let tickSpeed = rd8(code, songDataPtr + 0x18) & 7;
    if (tickSpeed === 0) tickSpeed = 8;

    subsongs.push({ songDataPtr, speedVal, voiceSeqPtrs, tickSpeed });
    scan += 8;
  }

  if (subsongs.length === 0) {
    throw new Error('No subsongs found');
  }

  // ── Linearize all voices for subsong 0 into rows ────────────────────

  const sub = subsongs[0];
  const instrumentMap = new Map<number, number>(); // instrPtr → 1-based ID
  const ROWS_PER_PATTERN = 64;

  // First pass: linearize all 4 voices to find the total row count
  const voiceRows: FPRow[][] = [];
  let maxVoiceLen = 0;
  for (let ch = 0; ch < 4; ch++) {
    if (sub.voiceSeqPtrs[ch] !== 0) {
      const rows = linearizeVoice(code, sub.voiceSeqPtrs[ch], 4096, instrumentMap);
      // Trim trailing empty rows
      let lastNonEmpty = rows.length - 1;
      while (lastNonEmpty > 0 && rows[lastNonEmpty].note === 0 && rows[lastNonEmpty].effTyp === 0) {
        lastNonEmpty--;
      }
      voiceRows.push(rows.slice(0, lastNonEmpty + 1));
      maxVoiceLen = Math.max(maxVoiceLen, lastNonEmpty + 1);
    } else {
      voiceRows.push([]);
    }
  }

  // Pad shorter voices to match longest
  for (let ch = 0; ch < 4; ch++) {
    while (voiceRows[ch].length < maxVoiceLen) {
      voiceRows[ch].push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
    }
  }

  // ── Split into patterns of ROWS_PER_PATTERN rows ────────────────────

  const numPatterns = Math.max(1, Math.ceil(maxVoiceLen / ROWS_PER_PATTERN));

  const patterns = [];
  const songPositions: number[] = [];

  for (let pidx = 0; pidx < numPatterns; pidx++) {
    const startRow = pidx * ROWS_PER_PATTERN;
    const patLen = Math.min(ROWS_PER_PATTERN, maxVoiceLen - startRow);

    const channels = Array.from({ length: 4 }, (_, ch) => {
      const rows = [];
      for (let r = 0; r < patLen; r++) {
        const srcRow = voiceRows[ch][startRow + r];
        rows.push(srcRow || { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      // Pad to ROWS_PER_PATTERN
      while (rows.length < ROWS_PER_PATTERN) {
        rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
      }
      return {
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
      };
    });

    patterns.push({
      id: `pattern-${pidx}`,
      name: `Pattern ${pidx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: 'FuturePlayer' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: instrumentMap.size,
      },
    });

    songPositions.push(pidx);
  }

  // ── Build instruments list ──────────────────────────────────────────

  // Read instrument metadata and detail parameters from binary
  function extractInstrumentConfig(instrPtr: number): { meta: { isWavetable: boolean; sampleSize: number }; config: FuturePlayerConfig } | null {
    if (instrPtr === 0 || instrPtr + 16 > code.length) return null;
    const sampInfoPtr = rd32(code, instrPtr + 8);
    if (sampInfoPtr === 0 || sampInfoPtr + 14 > code.length) return null;
    const wtFlag = rd8(code, sampInfoPtr + 8);
    const isWavetable = wtFlag !== 0;
    const lenWords = isWavetable ? 0 : rd16(code, sampInfoPtr + 4);
    const sampleSize = lenWords * 2;

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

    // Extract detail fields (offsets match FuturePlayer.c update_audio)
    const config: FuturePlayerConfig = {
      isWavetable,
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

  // One FuturePlayerSynth per discovered instrument pointer
  const instruments: InstrumentConfig[] = [];
  instrumentMap.forEach((id, instrPtr) => {
    // Skip null pointers — instrPtr=0 means the voice stream had a malformed set-instrument
    // command. A FuturePlayerSynth with instrPtr=0 would call engine.play() on click instead
    // of engine.noteOn(), causing whole-song playback (audible as a double-beep).
    if (instrPtr === 0) return;

    const extracted = extractInstrumentConfig(instrPtr);
    if (!extracted) return;

    const { meta, config: fpConfig } = extracted;

    // Skip instruments with no audio data at all (no wavetable, no PCM sample).
    // These produce silence or a WASM-default tone that causes an unexpected beep.
    if (!meta.isWavetable && meta.sampleSize === 0) return;

    const typeLabel = meta.isWavetable ? 'Synth' : 'Sample';
    const sizeLabel = meta.sampleSize > 0 ? ` (${meta.sampleSize}B)` : '';
    instruments.push({
      id,
      name: `${typeLabel} ${id}${sizeLabel}`,
      type: 'synth' as const,
      synthType: 'FuturePlayerSynth' as const,
      effects: [],
      volume: -6,
      pan: 0,
      futurePlayer: fpConfig,
      metadata: { fpInstrPtr: instrPtr, fpIsWavetable: meta.isWavetable, fpSampleSize: meta.sampleSize },
    } as unknown as InstrumentConfig);
  });

  // If no instruments found, add a default one
  if (instruments.length === 0) {
    instruments.push({
      id: 1,
      name: 'Future Player',
      type: 'synth' as const,
      synthType: 'FuturePlayerSynth' as const,
      effects: [],
      volume: -6,
      pan: 0,
    } as unknown as InstrumentConfig);
  }

  // ── Build BPM from tick speed ──────────────────────────────────────

  // FP runs at 50Hz (PAL). BPM = 50 * 60 / (tickSpeed * rowsPerBeat)
  // With 4 rows/beat: BPM = 50 * 60 / (tickSpeed * 4) = 750 / tickSpeed
  const initialSpeed = sub.tickSpeed;
  const initialBPM = 125;  // Standard Amiga BPM (50Hz CIA)

  const displayName = authorName
    ? `${moduleName} by ${authorName} [Future Player]`
    : `${moduleName} [Future Player]`;

  // ── Build uadeVariableLayout for chip RAM editing ─────────────────────────
  // FP stores 4 independent voice streams. Each voice stream is a single
  // file-level "pattern". trackMap maps (trackerPatIdx, chIdx) -> voice index.
  const voiceStreamAddrs = sub.voiceSeqPtrs.map(ptr => {
    // Convert voice seq pointer (code-relative) back to raw file offset
    // by finding the hunk header size
    const hdrCode = stripHunkHeader(rawBuf);
    const hdrOffset = rawBuf.length - hdrCode.length;
    // The voiceSeqPtrs are code-relative offsets used during linearization
    return hdrOffset + ptr;
  });

  // Estimate voice stream sizes from linearized row counts
  const voiceStreamSizes = voiceRows.map(rows => {
    // Each note = 2 bytes (note + duration), plus command bytes
    // Conservative estimate: 2 bytes per non-empty row + overhead
    let nonEmpty = 0;
    for (const r of rows) {
      if (r.note > 0 || r.effTyp > 0) nonEmpty++;
    }
    return Math.max(nonEmpty * 4, 64); // minimum 64 bytes
  });

  const trackMap: number[][] = [];
  for (let pidx = 0; pidx < numPatterns; pidx++) {
    trackMap.push([0, 1, 2, 3]); // all tracker patterns map to the 4 voice streams
  }

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'futurePlayer',
    numChannels: 4,
    numFilePatterns: 4, // one file pattern per voice stream
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: rawBuf.length,
    encoder: {
      formatId: 'futurePlayer',
      encodePattern: encodeFuturePlayerPattern,
    },
    filePatternAddrs: voiceStreamAddrs,
    filePatternSizes: voiceStreamSizes,
    trackMap,
  };

  return {
    name: displayName,
    format: 'FuturePlayer' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed,
    initialBPM,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    futurePlayerFileData: buffer.slice(0),
    uadeVariableLayout,
  };
}
