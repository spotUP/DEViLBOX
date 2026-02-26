/**
 * ChuckBiscuitsParser.ts — Chuck Biscuits / Black Artist (.cba) format parser
 *
 * Chuck Biscuits (also known as Black Artist) is an Amiga tracker format.
 * This format appears to have been used only for the Expoze musicdisk by Heretics.
 *
 * Binary layout:
 *   +0    magic[4]          — 'CBA\xF9' (0x43 0x42 0x41 0xF9)
 *   +4    title[32]         — song title (maybe null-terminated)
 *   +36   eof(uint8)        — must be 0x1A
 *   +37   messageLength(u16le) — song message length in bytes
 *   +39   numChannels(uint8)   — number of channels (1-32)
 *   +40   lastPattern(uint8)   — last pattern index (patterns 0..lastPattern)
 *   +41   numOrders(uint8)     — number of orders
 *   +42   numSamples(uint8)    — number of samples
 *   +43   speed(uint8)         — initial speed (must be > 0)
 *   +44   tempo(uint8)         — initial tempo/BPM (must be >= 32)
 *   +45   panPos[32](uint8)    — per-channel panning (0=left, 128=center, 255=right → *2 in MPT)
 *   +77   orders[255](uint8)   — order list; 0xFF = end marker, 0xFE = loop marker
 *   Header total: 332 bytes (MPT_BINARY_STRUCT(CBAFileHeader, 332))
 *
 *   After header:
 *   Sample headers: numSamples × 48 bytes (CBASampleHeader)
 *     name[32], flags(u8), volume(u8), sampleRate(u16le), length(u32le),
 *     loopStart(u32le), loopEnd(u32le)
 *     flags & 0x08 → loop active
 *
 *   Song message: messageLength bytes
 *
 *   Pattern data: (lastPattern+1) patterns, each 64 rows × numChannels channels × 5 bytes/cell
 *     Cell encoding [instr, note, vol, command, param]:
 *       instr:   instrument number (1-based; 0 = no instrument)
 *       note:    0 = no note; 255 = note cut; 1-96 → pitch = 12 + note
 *       vol:     0 = no volume; 1-65 → volume = vol-1 (0-64)
 *       command: 0 = none; 1-0x0E → MOD command (command-1); 0x0F = Funky sync (dummy);
 *                0x10-0x1E → extended MOD (Exy) commands; 0x1F = set speed; 0x20 = set tempo
 *       param:   effect parameter
 *
 *   Sample data: numSamples samples, each 8-bit delta PCM (signed), Samples[smp].nLength bytes
 *
 *   Song message (after sample data): messageLength bytes
 *
 * Panning: panPos[ch] * 2 (MPT 0-512 range → DEViLBOX -50 to +50)
 * Sample rate: per-sample sampleRate field
 *
 * Reference: OpenMPT soundlib/Load_cba.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number    { return v.getUint8(off); }
function u16le(v: DataView, off: number): number { return v.getUint16(off, true); }
function u32le(v: DataView, off: number): number { return v.getUint32(off, true); }

function readMaybeNullString(v: DataView, off: number, len: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) {
    const b = v.getUint8(off + i);
    if (b === 0) break;
    bytes.push(b);
  }
  return String.fromCharCode(...bytes).trimEnd();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HEADER_SIZE         = 332;  // sizeof(CBAFileHeader)
const SAMPLE_HEADER_SIZE  = 48;   // sizeof(CBASampleHeader)
const ROWS_PER_PATTERN    = 64;
const BYTES_PER_CELL      = 5;

// Note: 254 = note cut (OpenMPT NOTE_NOTECUT maps to byte 255 in file)
const NOTE_CUT_BYTE = 255;

// Effect commands
const CMD_NOTE_CUT    = 254;   // DEViLBOX note cut
const CMD_SET_SPEED   = 0x0F;  // Fxx — set speed
const CMD_RETRIG      = 0x1B;  // Qxx — retrigger note

// ── Format detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the buffer looks like a Chuck Biscuits / Black Artist file.
 * Mirrors CBAFileHeader::IsValid() from OpenMPT Load_cba.cpp.
 */
export function isChuckBiscuitsFormat(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Magic: 'CBA\xF9'
  if (u8(v, 0) !== 0x43) return false;
  if (u8(v, 1) !== 0x42) return false;
  if (u8(v, 2) !== 0x41) return false;
  if (u8(v, 3) !== 0xF9) return false;

  // eof marker must be 0x1A
  if (u8(v, 36) !== 0x1A) return false;

  const numChannels = u8(v, 39);
  const speed       = u8(v, 43);
  const tempo       = u8(v, 44);

  if (numChannels === 0 || numChannels > 32) return false;
  if (speed === 0) return false;
  if (tempo < 32) return false;

  // Minimum additional size: numSamples * 48 + messageLength
  const messageLength = u16le(v, 37);
  const numSamples    = u8(v, 42);
  const minAdditional = numSamples * SAMPLE_HEADER_SIZE + messageLength;
  if (bytes.length < HEADER_SIZE + minAdditional) return false;

  return true;
}

// ── Effect translation ────────────────────────────────────────────────────────

/**
 * Translate a CBA effect command + param to a DEViLBOX TrackerCell effect.
 * Mirrors the OpenMPT ReadCBA pattern loop's command translation logic.
 *
 * The translation follows:
 *   command 0        → no effect
 *   command 1-0x0E   → ConvertModCommand(command-1, param) → MOD effects 0-13
 *   command 0x0F     → Funky sync (dummy, ignored)
 *   command 0x10-0x1E → Extended MOD Exy: ((command << 4) + 0x10) | min(param, 0x0F)
 *   command 0x1F     → Set speed (Fxx, Fxx < 20 = speed)
 *   command 0x20     → Set tempo (Fxx, Fxx >= 20 = BPM)
 *
 * MOD command mapping (command-1 → XM effect type):
 *   0 = Arpeggio (0xx)     → 0x00
 *   1 = Porta up (1xx)     → 0x01
 *   2 = Porta down (2xx)   → 0x02
 *   3 = Tone porta (3xx)   → 0x03
 *   4 = Vibrato (4xx)      → 0x04
 *   5 = Porta+Vol (5xx)    → 0x05
 *   6 = Vibr+Vol (6xx)     → 0x06
 *   7 = Tremolo (7xx)      → 0x07
 *   8 = Pan (8xx)          → 0x08
 *   9 = Sample offset (9xx)→ 0x09
 *   A = Volume slide (Axx) → 0x0A
 *   B = Position jump (Bxx)→ 0x0B
 *   C = Set volume (Cxx)   → 0x0C
 *   D = Pattern break (Dxx)→ 0x0D
 *
 * Extended MOD Exy commands (0x0E + nibble):
 *   command 0x10 → E1x fine porta up
 *   command 0x11 → E2x fine porta down
 *   etc. (the nibble from command maps to the sub-command)
 *   OpenMPT formula: ((command << 4) + 0x10) | min(param, 0x0F)
 *   For command=0x10: (0x10 << 4) + 0x10 = 0x110 → but actually looking at it:
 *     command=0x10, stored as ((0x10 << 4) + 0x10) | min(param,0xF) = (0x100 + 0x10) | param
 *   OpenMPT's CMD_MODCMDEX encodes the sub-command in high nibble and param in low nibble.
 *   The formula maps: command 0x10-0x1E → EX-style param byte.
 */
function translateEffect(command: number, param: number): { effTyp: number; eff: number } {
  if (command === 0) {
    return { effTyp: 0, eff: 0 };
  }

  if (command >= 1 && command <= 0x0E) {
    // ConvertModCommand(command - 1, param): standard MOD commands 0-13
    const modCmd = command - 1;
    return { effTyp: modCmd, eff: param };
  }

  if (command === 0x0F) {
    // "Funky sync" → dummy (ignored in playback)
    return { effTyp: 0, eff: 0 };
  }

  if (command === 0x18) {
    // CMD_RETRIG (Qxx) — retrigger note
    return { effTyp: CMD_RETRIG, eff: param };
  }

  if (command >= 0x10 && command <= 0x1E) {
    // Extended MOD Exy: OpenMPT CMD_MODCMDEX
    // OpenMPT formula: ((command << 4) + 0x10) | min(param, 0x0F)
    // This encodes as: high byte = (command << 4) + 0x10, low byte = param & 0x0F
    // In XM effect terms this is effect 0x0E with parameter nibbles
    // The sub-nibble (command - 0x10) goes into the high nibble of the param byte:
    const subCmd  = command - 0x10;  // 0-14
    const clampedParam = Math.min(param, 0x0F);
    // Effect 0x0E (extended effects), param = (subCmd << 4) | clampedParam
    return { effTyp: 0x0E, eff: (subCmd << 4) | clampedParam };
  }

  if (command === 0x1F) {
    // CMD_SPEED — set speed
    return { effTyp: CMD_SET_SPEED, eff: param };
  }

  if (command === 0x20) {
    // CMD_TEMPO — set tempo/BPM
    // In XM/MOD, Fxx with value >= 20 sets BPM; use effect 0x0F with param >= 20
    return { effTyp: CMD_SET_SPEED, eff: Math.max(param, 20) };
  }

  return { effTyp: 0, eff: 0 };
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a Chuck Biscuits / Black Artist (.cba) file into a TrackerSong.
 * Returns null on any parse failure (never throws).
 */
export function parseChuckBiscuitsFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parse(bytes, filename);
  } catch {
    return null;
  }
}

function _parse(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isChuckBiscuitsFormat(bytes)) return null;

  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ── Header fields ────────────────────────────────────────────────────────

  const title         = readMaybeNullString(v, 4, 32);
  const numChannels   = u8(v, 39);
  const lastPattern   = u8(v, 40);
  const numOrders     = u8(v, 41);
  const numSamples    = u8(v, 42);
  const speed         = u8(v, 43);
  const tempo         = u8(v, 44);

  // Per-channel panning: panPos[ch] * 2 → MPT 0-512 range (0=left, 256=center, 512=right)
  // Map to DEViLBOX -50 to +50: (panMPT / 256 - 1) * 50 = (panPos * 2 / 256 - 1) * 50
  const panValues: number[] = [];
  for (let ch = 0; ch < 32; ch++) {
    const panMPT = u8(v, 45 + ch) * 2;  // 0-510
    // (panMPT - 256) / 256 * 50 = (panMPT / 256 - 1) * 50
    const pan = Math.round((panMPT - 256) / 256 * 50);
    panValues.push(Math.max(-50, Math.min(50, pan)));
  }

  // Order list: orders[255], terminated by 0xFF (end) or 0xFE (loop)
  const orders: number[] = [];
  for (let i = 0; i < numOrders && i < 255; i++) {
    const ord = u8(v, 77 + i);
    if (ord === 0xFF || ord === 0xFE) break;
    orders.push(ord);
  }
  if (orders.length === 0) orders.push(0);

  // ── Sample headers ───────────────────────────────────────────────────────

  interface RawSampleHeader {
    name:       string;
    flags:      number;
    volume:     number;
    sampleRate: number;
    length:     number;
    loopStart:  number;
    loopEnd:    number;
  }

  let pos = HEADER_SIZE;

  const sampleHeaders: RawSampleHeader[] = [];
  for (let i = 0; i < numSamples; i++) {
    if (pos + SAMPLE_HEADER_SIZE > bytes.length) return null;
    sampleHeaders.push({
      name:       readMaybeNullString(v, pos, 32),
      flags:      u8(v,   pos + 32),
      volume:     u8(v,   pos + 33),
      sampleRate: u16le(v, pos + 34),
      length:     u32le(v, pos + 36),
      loopStart:  u32le(v, pos + 40),
      loopEnd:    u32le(v, pos + 44),
    });
    pos += SAMPLE_HEADER_SIZE;
  }

  // ── Song message (skip over it) ──────────────────────────────────────────
  // Per OpenMPT: message is read AFTER sample data, but the minimum additional size
  // check includes it. OpenMPT reads: sample headers → patterns → sample data → message.
  // We skip message here (just after headers), then read patterns, then samples.

  // Actually looking at OpenMPT code more carefully:
  //   1. Read header (332 bytes)
  //   2. Read sample headers (numSamples * 48)
  //   3. Read patterns (lastPattern+1 patterns, each 64*5*numChannels bytes)
  //   4. Read sample data (delta PCM)
  //   5. Read song message (messageLength bytes)
  //
  // So we continue at pos = HEADER_SIZE + numSamples * SAMPLE_HEADER_SIZE

  const patternDataOffset = pos;

  // ── Pattern data ─────────────────────────────────────────────────────────

  const numPatterns       = lastPattern + 1;
  const patternByteSize   = ROWS_PER_PATTERN * BYTES_PER_CELL * numChannels;

  // Build raw pattern cell grids
  const rawPatterns: TrackerCell[][][] = [];

  for (let pat = 0; pat < numPatterns; pat++) {
    const patStart = patternDataOffset + pat * patternByteSize;
    if (patStart + patternByteSize > bytes.length) {
      // Truncated — create empty pattern and stop
      rawPatterns.push(
        Array.from({ length: numChannels }, () =>
          Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
            note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
          }))
        )
      );
      continue;
    }

    // Allocate cell grid: numChannels × ROWS_PER_PATTERN
    const cells: TrackerCell[][] = Array.from(
      { length: numChannels },
      () => Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }))
    );

    // OpenMPT iterates: for(ModCommand &m : Patterns[pat]) reading row-major order
    // Each cell is [instr, note, vol, command, param] — 5 bytes
    let cellPos = patStart;
    for (let row = 0; row < ROWS_PER_PATTERN; row++) {
      for (let ch = 0; ch < numChannels; ch++) {
        if (cellPos + BYTES_PER_CELL > bytes.length) break;

        const instr   = u8(v, cellPos);
        const note    = u8(v, cellPos + 1);
        const vol     = u8(v, cellPos + 2);
        const command = u8(v, cellPos + 3);
        const param   = u8(v, cellPos + 4);
        cellPos += BYTES_PER_CELL;

        const cell = cells[ch][row];

        // Instrument
        cell.instrument = instr;

        // Note: 0 = no note; 255 = note cut; 1-96 → pitch = 12 + note (NOTE_MIDDLEC-49+note, MIDDLEC=61)
        if (note === NOTE_CUT_BYTE) {
          cell.note = CMD_NOTE_CUT;  // 254 = note cut in DEViLBOX
        } else if (note > 0 && note <= 96) {
          cell.note = 12 + note;
        }

        // Volume: 0 = no volume; 1-65 → volume = vol - 1 (0-64)
        if (vol > 0) {
          cell.volume = Math.min(vol, 65) - 1;
        }

        // Effect
        if (command > 0) {
          const { effTyp, eff } = translateEffect(command, param);
          cell.effTyp = effTyp;
          cell.eff    = eff;
        }
      }
    }

    rawPatterns.push(cells);
  }

  // ── Sample data (8-bit delta PCM) ────────────────────────────────────────

  let sampleDataOffset = patternDataOffset + numPatterns * patternByteSize;

  // Decode delta PCM: each byte is a delta; accumulate to get final PCM values
  const decodedSamples: (Uint8Array | null)[] = [];
  for (let i = 0; i < numSamples; i++) {
    const hdr = sampleHeaders[i];
    const len = hdr.length;

    if (len === 0 || sampleDataOffset + len > bytes.length) {
      decodedSamples.push(null);
      sampleDataOffset += len;
      continue;
    }

    // Delta PCM decoding: accumulate signed byte deltas
    const decoded = new Uint8Array(len);
    let accumulator = 0;
    for (let j = 0; j < len; j++) {
      // Raw byte reinterpreted as signed 8-bit
      const delta = bytes[sampleDataOffset + j];
      const signedDelta = delta < 128 ? delta : delta - 256;
      accumulator = (accumulator + signedDelta) & 0xFF;
      decoded[j] = accumulator;
    }
    decodedSamples.push(decoded);
    sampleDataOffset += len;
  }

  // ── Build InstrumentConfig list ───────────────────────────────────────────

  const instruments: InstrumentConfig[] = sampleHeaders.map((hdr, i) => {
    const id   = i + 1;
    const name = hdr.name || `Sample ${id}`;
    const pcm  = decodedSamples[i];

    if (!pcm || pcm.length === 0) {
      return {
        id,
        name,
        type:      'sample' as const,
        synthType: 'Sampler' as const,
        effects:   [],
        volume:    0,
        pan:       0,
      } as unknown as InstrumentConfig;
    }

    const hasLoop  = (hdr.flags & 0x08) !== 0 && hdr.loopEnd > hdr.loopStart;
    const loopStart = hasLoop ? hdr.loopStart : 0;
    const loopEnd   = hasLoop ? Math.min(hdr.loopEnd, hdr.length) : 0;
    const sampleRate = hdr.sampleRate > 0 ? hdr.sampleRate : 8363;

    return createSamplerInstrument(id, name, pcm, hdr.volume, sampleRate, loopStart, loopEnd);
  });

  // ── Build TrackerSong patterns ────────────────────────────────────────────

  const patterns: Pattern[] = orders.map((patIdx, orderPos) => {
    const cells = patIdx < rawPatterns.length ? rawPatterns[patIdx] : null;

    const channels: ChannelData[] = Array.from({ length: numChannels }, (_, ch) => {
      const rows: TrackerCell[] = Array.from({ length: ROWS_PER_PATTERN }, (_, row): TrackerCell => {
        if (!cells) {
          const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
          if (ch === 0 && row === 0) {
            cell.effTyp = CMD_SET_SPEED;
            cell.eff    = speed;
          }
          return cell;
        }

        const src  = cells[ch][row];
        const cell: TrackerCell = { ...src };

        // Inject initial speed on row 0, channel 0 if no existing effect
        if (ch === 0 && row === 0 && cell.effTyp === 0 && cell.eff === 0) {
          cell.effTyp = CMD_SET_SPEED;
          cell.eff    = speed;
        }

        return cell;
      });

      return {
        id:           `c${orderPos}-ch${ch}`,
        name:         `Channel ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          ch < numChannels ? panValues[ch] : 0,
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    return {
      id:     `pattern-${orderPos}-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'CBA',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    numChannels,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: numSamples,
      },
    };
  });

  const songPositions = patterns.map((_, i) => i);
  const songName      = title.trim() || filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed:    speed,
    initialBPM:      tempo,
    linearPeriods:   false,
  };
}
