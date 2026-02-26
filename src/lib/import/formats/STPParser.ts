/**
 * STPParser.ts — SoundTracker Pro II (.stp) format parser
 *
 * SoundTracker Pro II is an Amiga tracker by Stefan Danes (1990).
 * It supports variable pattern lengths, multiple sample loops, and CIA-based tempo.
 *
 * File header (204 bytes):
 *   +0    magic[4]         — "STP3"
 *   +4    version (u16BE)  — 0, 1, or 2
 *   +6    numOrders (u8)   — number of orders (≤128)
 *   +7    patternLength (u8) — default pattern length in rows
 *   +8    orderList[128]   — pattern order list
 *   +136  speed (u16BE)    — initial speed (ticks per row)
 *   +138  speedFrac (u16BE)— fractional speed (low byte used)
 *   +140  timerCount (u16BE) — CIA timer count (non-zero; tempo = 125*3546/timerCount)
 *   +142  flags (u16BE)
 *   +144  reserved (u32BE)
 *   +148  midiCount (u16BE) — always 50
 *   +150  midi[50]
 *   +200  numSamples (u16BE)
 *   +202  sampleStructSize (u16BE) — size of each sample chunk (for version 0/1)
 *
 * Sample headers (version 0/1, per sample):
 *   actualSmp (u16BE)           — 1-based sample index
 *   [if version==2: chunkSize (u32BE)]
 *   Chunk containing:
 *     path[31]                  — sample disk path (version 0/1) or null-term string (v2)
 *     flags (u8)                — ignored
 *     name[30]                  — sample name (version 0/1) or null-term string (v2)
 *     length (u32BE)            — sample length in bytes
 *     volume (u8)               — 0-64
 *     reserved1 (u8)
 *     loopStart (u32BE)
 *     loopLength (u32BE)
 *     defaultCommand (u16BE)    — ignored for playback
 *     defaultPeriod (u16BE)     — version 1+
 *     finetune (u8)             — version 2 only
 *     reserved2 (u8)
 *   [if version>=1: numLoops (u16BE) + numLoops × {loopStart(u32BE), loopLength(u32BE)}]
 *
 * Pattern header (version 0: read numPatterns u16BE first):
 *   version 0: patterns are stored sequentially, each 4ch × patternLength × 4 bytes
 *   version 1+: each pattern prefixed by actualPat(u16BE), length(u16BE), channels(u16BE)
 *              terminated by actualPat==0xFFFF
 *
 * Pattern cell (4 bytes):
 *   [0] instr    — instrument number (1-based)
 *   [1] note     — note value (1-based, 0=empty; maps to NOTE_MIDDLEC-36+note)
 *   [2] command  — effect command byte
 *   [3] param    — effect parameter
 *
 * Reference: OpenMPT Load_stp.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ─────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number   { return v.getUint8(off); }
function u16be(v: DataView, off: number): number { return v.getUint16(off, false); }
function u32be(v: DataView, off: number): number { return v.getUint32(off, false); }

function readStringFixed(v: DataView, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = v.getUint8(off + i);
    if (c === 0) break;
    if (c >= 0x20) s += String.fromCharCode(c);
  }
  return s.trim();
}

function readStringNull(buf: Uint8Array, off: number, maxLen: number): { str: string; end: number } {
  let s = '';
  let i = 0;
  while (i < maxLen && off + i < buf.length) {
    const c = buf[off + i];
    i++;
    if (c === 0) break;
    if (c >= 0x20) s += String.fromCharCode(c);
  }
  return { str: s.trim(), end: off + i };
}

// ── Format constants ──────────────────────────────────────────────────────────

const FILE_HEADER_SIZE = 204;

// The STP3 magic bytes
const STP_MAGIC = [0x53, 0x54, 0x50, 0x33]; // "STP3"

// NOTE_MIDDLEC in OpenMPT = 61 (middle C, MIDI note 60)
// STP note formula: mptNote = NOTE_MIDDLEC - 36 + note  (when note > 0)
//                           = 61 - 36 + note = 25 + note
// Our XM-style notes: 1=C-0, 13=C-1, ... 60=C-4 (MIDI), 61=C#4 ...
// We align with OpenMPT: NOTE_MIDDLEC - 36 = 25 offset → XM note = 25 + stpNote
// This puts STP note 1 → XM note 26 (which is approximately D-1 in XM terms).
// NOTE_MIDDLEC in our system = 61 (same as OpenMPT), C-5 = 60+1 = 61? Let's use OpenMPT logic directly.
// OpenMPT NOTE_MIDDLEC = 61 = C-5. STP note 1 maps to the lowest C.
// NOTE_MIDDLEC - 36 + 1 = 26 = C-2 in ProTracker (1-indexed). This matches.
const STP_NOTE_OFFSET = 25; // XM note = STP_NOTE_OFFSET + stpNote

// ── CIA tempo conversion ────────────────────────────────────────────────────

/**
 * Convert a CIA timer count to BPM.
 * From OpenMPT: 3546 is the CIA timer for 125 BPM.
 * BPM = 125 * 3546 / timerCount
 */
function convertCIATempo(ciaSpeed: number): number {
  if (ciaSpeed === 0) return 125;
  return Math.round((125.0 * 3546.0) / ciaSpeed);
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Returns true if the buffer is a valid STP (SoundTracker Pro II) module.
 * Detection: magic "STP3" + version ≤ 2 + numOrders ≤ 128 + timerCount ≠ 0 + midiCount = 50.
 */
export function isSTPFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < FILE_HEADER_SIZE) return false;
  const v = new DataView(buffer);

  // Check magic "STP3"
  for (let i = 0; i < 4; i++) {
    if (v.getUint8(i) !== STP_MAGIC[i]) return false;
  }

  const version    = u16be(v, 4);
  const numOrders  = u8(v, 6);
  const timerCount = u16be(v, 140);
  const midiCount  = u16be(v, 148);

  if (version > 2)      return false;
  if (numOrders > 128)  return false;
  if (timerCount === 0) return false;
  if (midiCount !== 50) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a SoundTracker Pro II (.stp) file into a TrackerSong.
 * Follows OpenMPT ReadSTP() from Load_stp.cpp.
 */
export async function parseSTPFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const v   = new DataView(buffer);
  const raw = new Uint8Array(buffer);

  if (!isSTPFormat(buffer)) {
    throw new Error('STPParser: invalid STP3 file');
  }

  // ── File header ───────────────────────────────────────────────────────────
  const version       = u16be(v, 4);
  const numOrders     = u8(v, 6);
  const defaultPatLen = u8(v, 7);
  // orderList[128] at +8
  const speed         = u16be(v, 136);
  const speedFracRaw  = u16be(v, 138);  // low byte = fractional speed
  const timerCount    = u16be(v, 140);
  // flags at +142, reserved at +144
  // midi[50] at +150
  const numSamples      = u16be(v, 200);
  const sampleStructSize = u16be(v, 202);

  const orderList: number[] = [];
  for (let i = 0; i < 128; i++) {
    orderList.push(u8(v, 8 + i));
  }
  const songOrders = orderList.slice(0, Math.max(1, numOrders));

  const initialSpeed = Math.max(1, speed);
  const initialBPM   = convertCIATempo(timerCount);

  // ── Parse sample headers ──────────────────────────────────────────────────

  interface STPSampleInfo {
    index:     number;  // 1-based
    name:      string;
    length:    number;  // in bytes
    volume:    number;  // 0-64
    loopStart: number;  // in bytes
    loopEnd:   number;  // in bytes (loopStart + loopLength)
    hasLoop:   boolean;
  }

  const sampleInfos = new Map<number, STPSampleInfo>();
  let cursor = FILE_HEADER_SIZE;
  let maxSampleIndex = 0;

  for (let s = 0; s < numSamples; s++) {
    if (cursor + 2 > buffer.byteLength) break;
    const actualSmp = u16be(v, cursor); cursor += 2;
    if (actualSmp === 0 || actualSmp >= 1024) break;

    let chunkSize: number;
    if (version === 2) {
      if (cursor + 4 > buffer.byteLength) break;
      // chunkSize includes the 2 bytes already read for actualSmp
      chunkSize = u32be(v, cursor) - 2; cursor += 4;
    } else {
      chunkSize = sampleStructSize;
    }

    const chunkStart = cursor;
    const chunkEnd   = Math.min(chunkStart + chunkSize, buffer.byteLength);

    let sampleName = '';
    let samplePath = '';
    let chunkCursor = chunkStart;

    if (version < 2) {
      // path[31] + flags(1) + name[30]
      samplePath  = readStringFixed(v, chunkCursor, 31); chunkCursor += 31;
      chunkCursor += 1;  // flags
      sampleName  = readStringFixed(v, chunkCursor, 30); chunkCursor += 30;
    } else {
      // null-terminated path (max 257 bytes) + flags(1) + null-terminated name (max 31 bytes)
      const pathResult = readStringNull(raw, chunkCursor, 257);
      samplePath   = pathResult.str;
      chunkCursor  = pathResult.end;
      chunkCursor += 1;  // flags
      const nameResult = readStringNull(raw, chunkCursor, 31);
      sampleName   = nameResult.str;
      chunkCursor  = nameResult.end;
      // Align to even boundary
      if ((chunkCursor - chunkStart) % 2 !== 0) chunkCursor++;
    }

    if (chunkCursor + 20 > chunkEnd) {
      cursor = chunkEnd;
      continue;
    }

    // STPSampleHeader (20 bytes):
    //   length (u32BE) +0
    //   volume (u8)    +4
    //   reserved1 (u8) +5
    //   loopStart (u32BE) +6
    //   loopLength (u32BE) +10
    //   defaultCommand (u16BE) +14
    //   defaultPeriod (u16BE) +16  (version 1+)
    //   finetune (u8) +18          (version 2 only)
    //   reserved2 (u8) +19

    const length      = u32be(v, chunkCursor);
    const volume      = Math.min(u8(v, chunkCursor + 4), 64);
    const loopStart   = u32be(v, chunkCursor + 6);
    const loopLength  = u32be(v, chunkCursor + 10);

    let loopEnd   = loopStart + loopLength;
    let hasLoop   = false;

    // Sanitize loop points
    let effectiveLoopStart = loopStart >= length ? (length > 0 ? length - 1 : 0) : loopStart;
    if (loopEnd > length) loopEnd = length;
    if (effectiveLoopStart > loopEnd) { effectiveLoopStart = 0; loopEnd = 0; }
    else if (loopEnd > effectiveLoopStart) hasLoop = true;

    const finalName = sampleName || samplePath || `Sample ${actualSmp}`;

    sampleInfos.set(actualSmp, {
      index:     actualSmp,
      name:      finalName,
      length,
      volume,
      loopStart: effectiveLoopStart,
      loopEnd,
      hasLoop,
    });

    if (actualSmp > maxSampleIndex) maxSampleIndex = actualSmp;

    cursor = chunkEnd;

    // Version >=1: read extra loop list
    if (version >= 1) {
      if (cursor + 2 > buffer.byteLength) continue;
      const numLoops = u16be(v, cursor); cursor += 2;
      // Skip loop list (numLoops × 8 bytes)
      const loopListBytes = numLoops * 8;
      if (cursor + loopListBytes > buffer.byteLength) break;
      cursor += loopListBytes;
    }
  }

  // ── Parse patterns ────────────────────────────────────────────────────────

  const patternArray: Pattern[] = [];
  const patIdxToArrayIdx = new Map<number, number>();
  let numChannels = 4;

  if (version === 0) {
    // Version 0: read numPatterns u16BE, then sequential patterns
    if (cursor + 2 > buffer.byteLength) {
      // Return minimal song
      return buildMinimalSong(filename, initialSpeed, initialBPM, sampleInfos, maxSampleIndex, raw, buffer);
    }
    const numPatterns = u16be(v, cursor); cursor += 2;
    const patLen = defaultPatLen > 0 ? defaultPatLen : 64;

    for (let pat = 0; pat < numPatterns; pat++) {
      const bytesNeeded = numChannels * patLen * 4;
      if (cursor + bytesNeeded > buffer.byteLength) break;

      const channels = parsePatternChannels(v, cursor, numChannels, patLen, filename, pat, numPatterns, maxSampleIndex);
      cursor += bytesNeeded;

      patIdxToArrayIdx.set(pat, patternArray.length);
      patternArray.push({
        id:     `pattern-${pat}`,
        name:   `Pattern ${pat}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat:            'STP',
          sourceFile:              filename,
          importedAt:              new Date().toISOString(),
          originalChannelCount:    numChannels,
          originalPatternCount:    numPatterns,
          originalInstrumentCount: maxSampleIndex,
        },
      });
    }
  } else {
    // Version 1+: each pattern prefixed with actualPat(u16BE), length(u16BE), channels(u16BE)
    // terminated by actualPat == 0xFFFF

    // First pass: scan to find total channel count
    const scanStart = cursor;
    let scanPos = scanStart;
    let maxChannels = 4;

    while (scanPos + 6 <= buffer.byteLength) {
      const ap = u16be(v, scanPos); scanPos += 2;
      if (ap === 0xFFFF) break;
      const pLen = u16be(v, scanPos); scanPos += 2;
      const ch   = u16be(v, scanPos); scanPos += 2;
      if (ch > maxChannels) maxChannels = ch;
      if (ch > 256 || pLen > 1024) break;
      scanPos += ch * pLen * 4;
    }
    numChannels = Math.min(maxChannels, 32);

    // Second pass: actually parse patterns
    cursor = scanStart;
    let totalPatterns = 0;

    while (cursor + 6 <= buffer.byteLength) {
      const actualPat = u16be(v, cursor); cursor += 2;
      if (actualPat === 0xFFFF) break;

      const patLen  = u16be(v, cursor); cursor += 2;
      const patCh   = u16be(v, cursor); cursor += 2;

      if (patCh > 256 || patLen > 1024) break;
      const bytesNeeded = patCh * patLen * 4;
      if (cursor + bytesNeeded > buffer.byteLength) break;

      const channels = parsePatternChannels(v, cursor, patCh, patLen, filename, actualPat, 128, maxSampleIndex);
      cursor += bytesNeeded;
      totalPatterns++;

      patIdxToArrayIdx.set(actualPat, patternArray.length);
      patternArray.push({
        id:     `pattern-${actualPat}`,
        name:   `Pattern ${actualPat}`,
        length: patLen,
        channels,
        importMetadata: {
          sourceFormat:            'STP',
          sourceFile:              filename,
          importedAt:              new Date().toISOString(),
          originalChannelCount:    patCh,
          originalPatternCount:    totalPatterns,
          originalInstrumentCount: maxSampleIndex,
        },
      });
    }

    // Skip script section (version > 0)
    // Skip drumpad info (17 × 2 bytes)
    // We just consume until we reach sample data or end
    while (cursor + 4 <= buffer.byteLength) {
      const scriptNum = u16be(v, cursor);
      if (scriptNum === 0xFFFF) { cursor += 2; break; }
      cursor += 2;  // scriptNum
      cursor += 2;  // unknown
      if (cursor + 4 > buffer.byteLength) break;
      const scriptLen = u32be(v, cursor); cursor += 4;
      if (cursor + scriptLen > buffer.byteLength) break;
      cursor += scriptLen;
    }
    // Skip drumpad (17 entries × 2 bytes = 34 bytes)
    cursor += 34;
    if (cursor > buffer.byteLength) cursor = buffer.byteLength;
  }

  // ── Song positions ─────────────────────────────────────────────────────────
  const songPositions: number[] = [];
  for (const patIdx of songOrders) {
    const arrIdx = patIdxToArrayIdx.get(patIdx);
    if (arrIdx !== undefined) songPositions.push(arrIdx);
  }
  if (songPositions.length === 0 && patternArray.length > 0) songPositions.push(0);

  // ── Build instruments from sample data ────────────────────────────────────
  // Sample data: 8-bit signed PCM, little-endian (per OpenMPT SampleIO::littleEndian + signedPCM)
  // For 8-bit mono, LE/BE doesn't matter — just raw signed bytes.

  const instruments: InstrumentConfig[] = [];

  for (let i = 1; i <= maxSampleIndex; i++) {
    const info = sampleInfos.get(i);
    const id   = i;

    if (!info || info.length === 0) {
      instruments.push({
        id,
        name:      info?.name ?? `Sample ${id}`,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig);
      continue;
    }

    // Read sample data from current file position
    if (cursor + info.length > buffer.byteLength) {
      instruments.push({
        id,
        name:      info.name,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    -60,
        pan:       0,
      } as InstrumentConfig);
      cursor += Math.min(info.length, buffer.byteLength - cursor);
      continue;
    }

    const pcm = raw.slice(cursor, cursor + info.length);
    cursor += info.length;

    instruments.push(
      createSamplerInstrument(
        id,
        info.name,
        pcm,
        info.volume,
        8287,   // Amiga standard C-3 rate
        info.loopStart,
        info.hasLoop ? info.loopEnd : 0,
      ),
    );
  }

  return {
    name:            filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns:        patternArray.length > 0 ? patternArray : [makeEmptyPattern(filename, numChannels)],
    instruments,
    songPositions:   songPositions.length > 0 ? songPositions : [0],
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}

// ── Pattern channel parser ────────────────────────────────────────────────────

/**
 * Parse `numCh` channels × `numRows` rows of STP pattern data at `dataOff`.
 *
 * STP cell layout (4 bytes per cell, in row-major order):
 *   [0] instr    — 1-based instrument number (0 = no instrument)
 *   [1] note     — 1-based note (0 = no note; mapped via NOTE_MIDDLEC-36+note)
 *   [2] command  — effect command
 *   [3] param    — effect parameter
 *
 * Data is stored as: for each row, for each channel, 4 bytes.
 */
function parsePatternChannels(
  v: DataView,
  dataOff: number,
  numCh: number,
  numRows: number,
  filename: string,
  patIdx: number,
  totalPats: number,
  totalInstr: number,
): ChannelData[] {
  const channels: ChannelData[] = [];

  for (let ch = 0; ch < numCh; ch++) {
    const rows: TrackerCell[] = [];

    for (let row = 0; row < numRows; row++) {
      const cellBase = dataOff + (row * numCh + ch) * 4;
      if (cellBase + 4 > v.byteLength) {
        rows.push(emptyCell());
        continue;
      }

      const instr   = u8(v, cellBase);
      const noteRaw = u8(v, cellBase + 1);
      const command = u8(v, cellBase + 2);
      const param   = u8(v, cellBase + 3);

      // Note: STP note is 1-based, mapped to OpenMPT note as: NOTE_MIDDLEC - 36 + note
      // = 61 - 36 + note = 25 + note
      const note = noteRaw > 0 ? STP_NOTE_OFFSET + noteRaw : 0;

      // Effect conversion — following OpenMPT ReadSTP() switch(command)
      const { effTyp, eff } = convertSTPEffect(command, param);

      rows.push({
        note,
        instrument: instr,
        volume:     0,
        effTyp,
        eff,
        effTyp2:    0,
        eff2:       0,
      });
    }

    channels.push({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          ch % 2 === 0 ? -50 : 50,  // Amiga LRRL panning
      instrumentId: null,
      color:        null,
      rows,
    });
  }

  return channels;
}

// ── STP effect conversion ─────────────────────────────────────────────────────

/**
 * Convert an STP effect command + parameter to XM-style effTyp + eff.
 * Based on OpenMPT ReadSTP() switch(command) block.
 *
 * Note: Many STP effects (auto-effects, loop commands, etc.) have no direct
 * XM equivalent. For those, we emit the closest equivalent or ignore them.
 * Volume slides in STP have their nibbles swapped compared to MOD.
 */
function convertSTPEffect(command: number, param: number): { effTyp: number; eff: number } {
  // 12-bit CIA tempo: if top nibble of command is 0xF, it's a tempo command
  if ((command & 0xF0) === 0xF0) {
    const ciaTempo = ((command & 0x0F) << 8) | param;
    if (ciaTempo > 0) {
      const bpm = Math.min(255, Math.max(1, convertCIATempo(ciaTempo)));
      return { effTyp: 0x0F, eff: bpm };  // Fxx = set tempo
    }
    return { effTyp: 0, eff: 0 };
  }

  // Volume slide nibbles are swapped in STP: hi nibble = down, lo nibble = up
  // totalSlide = -(param>>4) + (param&0x0F)
  // slideParam: if totalSlide>0: totalSlide<<4; if totalSlide<0: -totalSlide
  const slideDown  = (param >> 4) & 0x0F;
  const slideUp    = param & 0x0F;
  const totalSlide = -slideDown + slideUp;
  const slideParam = totalSlide > 0
    ? (totalSlide << 4) & 0xFF
    : ((-totalSlide) & 0xFF);

  switch (command) {
    case 0x00:  // Arpeggio
      return param ? { effTyp: 0x00, eff: param } : { effTyp: 0, eff: 0 };
    case 0x01:  // Portamento up
      return param ? { effTyp: 0x01, eff: param } : { effTyp: 0, eff: 0 };
    case 0x02:  // Portamento down
      return param ? { effTyp: 0x02, eff: param } : { effTyp: 0, eff: 0 };
    case 0x03:  // Auto fine portamento up → CMD_PORTAMENTOUP (fine)
      return { effTyp: 0x01, eff: param };
    case 0x04:  // Auto fine portamento down → CMD_PORTAMENTODOWN (fine)
      return { effTyp: 0x02, eff: param };
    case 0x05:  // Auto portamento up
      return { effTyp: 0x01, eff: param };
    case 0x06:  // Auto portamento down
      return { effTyp: 0x02, eff: param };
    case 0x07:  // Set global volume → Gxx
      return { effTyp: 0x10, eff: Math.min(param, 64) };
    case 0x08:  // Auto global fine volume slide
      if (totalSlide < 0)
        return { effTyp: 0x0A, eff: (-totalSlide) & 0x0F };          // slide down
      else if (totalSlide > 0)
        return { effTyp: 0x0A, eff: (totalSlide << 4) & 0xFF };      // slide up
      return { effTyp: 0, eff: 0 };
    case 0x09:  // Fine portamento up → Exx (extended)
      return { effTyp: 0x0E, eff: 0x10 | Math.min(param, 15) };
    case 0x0A:  // Fine portamento down → Exx (extended)
      return { effTyp: 0x0E, eff: 0x20 | Math.min(param, 15) };
    case 0x0B:  // Auto fine volume slide
      if (totalSlide < 0)
        return { effTyp: 0x0A, eff: (-totalSlide) & 0x0F };
      else if (totalSlide > 0)
        return { effTyp: 0x0A, eff: (totalSlide << 4) & 0xFF };
      return { effTyp: 0, eff: 0 };
    case 0x0C:  // Set volume → Cxx
      return { effTyp: 0x0C, eff: Math.min(param, 64) };
    case 0x0D:  // Volume slide (nibbles swapped)
      if (totalSlide < 0)
        return { effTyp: 0x0A, eff: slideParam & 0x0F };
      else if (totalSlide > 0)
        return { effTyp: 0x0A, eff: slideParam & 0xF0 };
      return { effTyp: 0, eff: 0 };
    case 0x0E:  // Set filter → Exx (E0x: enable/disable filter)
      return { effTyp: 0x0E, eff: param ? 0x00 : 0x01 };
    case 0x0F:  // Set speed (STP: hi nibble = speed, low nibble = fractional)
      return { effTyp: 0x0F, eff: param >> 4 };
    case 0x10:  // Auto vibrato → Hxx
      return { effTyp: 0x04, eff: param };
    case 0x11:  // Auto tremolo → Rxx
      return { effTyp: 0x07, eff: param };
    case 0x12:  // Pattern break → Dxx
      return { effTyp: 0x0D, eff: 0 };
    case 0x13:  // Auto tone portamento → Gxx
      return { effTyp: 0x03, eff: param };
    case 0x14:  // Position jump → Bxx
      return { effTyp: 0x0B, eff: param };
    case 0x16:  // Start loop sequence → no direct XM equivalent, omit
      return { effTyp: 0, eff: 0 };
    case 0x17:  // Play only loop nn → no direct XM equivalent
      return { effTyp: 0, eff: 0 };
    case 0x18:  // Play sequence without loop → no direct XM equivalent
      return { effTyp: 0, eff: 0 };
    case 0x19:  // Play only loop nn without loop → no direct XM equivalent
      return { effTyp: 0, eff: 0 };
    case 0x1D:  // Fine volume slide (nibble order swapped)
      if (totalSlide < 0)
        return { effTyp: 0x0E, eff: 0xB0 | ((-totalSlide) & 0x0F) };
      else if (totalSlide > 0)
        return { effTyp: 0x0E, eff: 0xA0 | ((totalSlide) & 0x0F) };
      return { effTyp: 0, eff: 0 };
    case 0x20:  // Delayed fade: hi nibble = auto vol slide; lo nibble = note cut
      if (param & 0xF0)
        return { effTyp: 0x0A, eff: (param >> 4) };
      else
        return { effTyp: 0x0E, eff: 0xC0 | (param & 0x0F) };
    case 0x21:  // Note delay → Exx (SDx)
      return { effTyp: 0x0E, eff: 0xD0 | Math.min(param, 15) };
    case 0x22:  // Retrigger note → Exx (SEx)
      return { effTyp: 0x0E, eff: 0x90 | Math.min(param, 15) };
    case 0x49:  // Set sample offset → Oxx
      return { effTyp: 0x09, eff: param };
    case 0x4E:  // Other PT commands (pattern loop / delay)
      if ((param & 0xF0) === 0x60 || (param & 0xF0) === 0xE0)
        return { effTyp: 0x0E, eff: param };
      return { effTyp: 0, eff: 0 };
    case 0x4F:  // Set speed/tempo
      return { effTyp: 0x0F, eff: param };
    default:
      return { effTyp: 0, eff: 0 };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptyPattern(filename: string, numCh: number): Pattern {
  const channels: ChannelData[] = Array.from({ length: numCh }, (_, ch) => ({
    id:           `channel-${ch}`,
    name:         `Channel ${ch + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          ch % 2 === 0 ? -50 : 50,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: 64 }, () => emptyCell()),
  }));
  return {
    id:     'pattern-0',
    name:   'Pattern 0',
    length: 64,
    channels,
    importMetadata: {
      sourceFormat:            'STP',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    numCh,
      originalPatternCount:    0,
      originalInstrumentCount: 0,
    },
  };
}

function buildMinimalSong(
  filename: string,
  initialSpeed: number,
  initialBPM: number,
  sampleInfos: Map<number, { index: number; name: string; length: number; volume: number; loopStart: number; loopEnd: number; hasLoop: boolean }>,
  maxSampleIndex: number,
  _raw: Uint8Array,
  _buffer: ArrayBuffer,
): TrackerSong {
  const instruments: InstrumentConfig[] = [];
  for (let i = 1; i <= maxSampleIndex; i++) {
    const info = sampleInfos.get(i);
    instruments.push({
      id:        i,
      name:      info?.name ?? `Sample ${i}`,
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    -60,
      pan:       0,
    } as InstrumentConfig);
  }
  const pat = makeEmptyPattern(filename, 4);
  return {
    name:            filename.replace(/\.[^/.]+$/, ''),
    format:          'MOD' as TrackerFormat,
    patterns:        [pat],
    instruments,
    songPositions:   [0],
    songLength:      1,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed,
    initialBPM,
    linearPeriods:   false,
  };
}
