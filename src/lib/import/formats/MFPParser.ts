/**
 * MFPParser.ts -- Magnetic Fields Packer (.mfp) Amiga format parser
 *
 * Magnetic Fields Packer is a 4-channel Amiga module packer created by Shaun
 * Southern. The song data lives in a file whose basename has a '.' at position
 * 3 (e.g. `mfp.songname`, `mfp.kid_chaos`). Sample PCM data lives in a
 * companion `smp.*` file that is not parsed here; all 31 instruments are
 * created as placeholders carrying the metadata needed for external loading.
 *
 * Detection is filename-based -- there are no magic bytes. The basename's 4th
 * character (index 3) must be '.'. The header is also structurally validated.
 *
 * Binary layout:
 *   [0..247]   31 instrument headers x 8 bytes each:
 *                len(u16BE), finetune(u8), volume(u8),
 *                loopStart(u16BE), loopSize(u16BE)
 *   [248]      Number of patterns / song length (u8)
 *   [249]      Restart byte (always 0x7F)
 *   [250..377] 128-entry order table (u8 each)
 *   [378..379] size1: entries in pattern table (u16BE)
 *   [380..381] size2: same as size1 (u16BE, cross-check only)
 *   [382..]    Pattern table: size1 x 4 channels x u16BE channel offsets
 *   [patAddr..] Per-channel pattern data blocks
 *
 * Pattern encoding: each channel block holds up to 1024 bytes. The 64 rows
 * are addressed via a 4-level indirect lookup (k, x, y each in [0..3]):
 *   l1 = k
 *   l2 = chanBuf[l1] + x
 *   l3 = chanBuf[l2] + y
 *   eventBase = chanBuf[l3] * 2
 *   -> 4-byte ProTracker event at chanBuf[eventBase]
 *
 * Reference: Reference Code/libxmp-master/src/loaders/mfp_load.c
 * See also:  http://www.exotica.org.uk/wiki/Magnetic_Fields_Packer
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, InstrumentConfig } from '@/types';
import { periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// -- Utility functions -------------------------------------------------------

function u8(buf: Uint8Array, off: number): number {
  return buf[off];
}

function s8(buf: Uint8Array, off: number): number {
  const v = buf[off];
  return v < 128 ? v : v - 256;
}

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

// -- Format detection --------------------------------------------------------

/**
 * Detect whether the buffer and filename describe a Magnetic Fields Packer
 * module. Detection is filename-based (basename[3] === '.') plus structural
 * header validation.
 *
 * @param buffer   - Raw file bytes
 * @param filename - Original filename including path (basename is checked)
 */
export function isMFPFormat(buffer: ArrayBuffer, filename?: string): boolean {
  // Filename: the basename must have '.' at index 3 (e.g. 'mfp.songname')
  if (filename) {
    const base = filename.split('/').pop() ?? filename;
    if (base.length < 4 || base[3] !== '.') return false;
  }

  if (buffer.byteLength < 384) return false;

  const buf = new Uint8Array(buffer);

  // Restart byte at offset 249 must always be 0x7F
  if (buf[249] !== 0x7f) return false;

  // Validate all 31 instrument headers (8 bytes each, offsets 0-247)
  for (let i = 0; i < 31; i++) {
    const base = i * 8;
    const len = u16BE(buf, base);
    if (len > 0x7fff) return false;

    // High nibble of finetune byte must be zero (finetune lives in low nibble)
    if (buf[base + 2] & 0xf0) return false;

    // Volume must be 0-64
    if (buf[base + 3] > 0x40) return false;

    const lps = u16BE(buf, base + 4);
    const lsz = u16BE(buf, base + 6);

    if (lps > len) return false;
    if (lps + lsz - 1 > len) return false;
    if (len > 0 && lsz === 0) return false;
  }

  // Pattern count cross-check: buf[248] == size1 (offset 378) == size2 (offset 380)
  if (buf[248] !== u16BE(buf, 378)) return false;
  if (u16BE(buf, 378) !== u16BE(buf, 380)) return false;

  return true;
}

// -- Instrument header -------------------------------------------------------

interface MFPInstrument {
  length: number;     // sample length in bytes (raw word value * 2)
  finetune: number;   // signed 4-bit finetune shifted to int8 range (<< 4)
  volume: number;     // 0-64
  loopStart: number;  // loop start offset in bytes (raw word value * 2)
  loopSize: number;   // loop length in bytes (raw word value * 2)
  hasLoop: boolean;   // true when loopSize > 1 (matching libxmp convention)
}

// -- ProTracker 4-byte event decoder -----------------------------------------

/**
 * Decode one 4-byte ProTracker MOD event at byte offset `off` within `buf`.
 *
 *   byte0: [ instHiNibble(4) ][ periodHi(4) ]
 *   byte1: [ periodLo(8) ]
 *   byte2: [ instLoNibble(4) ][ effectType(4) ]
 *   byte3: [ effectParam(8) ]
 *
 * Matches libxmp libxmp_decode_protracker_event() in common.c.
 */
function decodeProTrackerEvent(buf: Uint8Array, off: number): TrackerCell {
  const byte0 = buf[off];
  const byte1 = buf[off + 1];
  const byte2 = buf[off + 2];
  const byte3 = buf[off + 3];

  const period = ((byte0 & 0x0f) << 8) | byte1;
  const instrument = (byte0 & 0xf0) | (byte2 >> 4);
  const effTyp = byte2 & 0x0f;
  const eff = byte3;

  const noteIdx = period > 0 ? periodToNoteIndex(period) : 0;
  const note = amigaNoteToXM(noteIdx);

  return { note, instrument, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0 };
}

// -- Main parser -------------------------------------------------------------

/**
 * Parse a Magnetic Fields Packer song file into a TrackerSong.
 *
 * All 31 instruments are created as named placeholders because sample PCM data
 * lives in a companion smp.* file that is not supplied to this parser.
 */
export async function parseMFPFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  if (buf.length < 384) {
    throw new Error('File too small to be a Magnetic Fields Packer module');
  }

  // -- 31 Instrument headers (offsets 0-247, 8 bytes each) ------------------
  // All size fields are in 16-bit words -- multiply by 2 to get bytes.
  const instruments: MFPInstrument[] = [];

  for (let i = 0; i < 31; i++) {
    const base = i * 8;
    const lenWords = u16BE(buf, base);
    // finetune: the file stores the signed 4-bit value in the low nibble;
    // left-shift by 4 to place it in the int8 range used by libxmp.
    const finetune = s8(buf, base + 2) << 4;
    const volume = u8(buf, base + 3);
    const lpsWords = u16BE(buf, base + 4);
    const lszWords = u16BE(buf, base + 6);

    instruments.push({
      length: lenWords * 2,
      finetune,
      volume,
      loopStart: lpsWords * 2,
      loopSize: lszWords * 2,
      hasLoop: lszWords > 1,
    });
  }

  // -- Song/pattern count (offset 248) --------------------------------------
  const numPatterns = u8(buf, 248);
  // buf[249] = restart byte (0x7F) -- validated in isMFPFormat; not used here

  // -- 128-entry order table (offsets 250-377) -------------------------------
  const orderTable: number[] = [];
  for (let i = 0; i < 128; i++) {
    orderTable.push(u8(buf, 250 + i));
  }

  // -- Pattern table (offsets 378+) -----------------------------------------
  const size1 = u16BE(buf, 378);   // number of active entries in the pattern table
  // size2 at 380 equals size1 and is used only for cross-check -- skip reading
  let pos = 382;

  // patTable[patIdx][chanIdx] = byte offset from patAddr for that channel block
  const patTable: number[][] = [];
  for (let i = 0; i < size1; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) {
      row.push(u16BE(buf, pos));
      pos += 2;
    }
    patTable.push(row);
  }

  // patAddr: file offset immediately after the pattern table header
  const patAddr = pos;

  // -- Decode patterns -------------------------------------------------------
  // Each pattern: 64 rows x 4 channels.
  // The 64 rows for each channel are reached via a 4-level indirect lookup
  // (k=0..3, x=0..3, y=0..3) as implemented in libxmp mfp_load.c:
  //
  //   l1 = k
  //   l2 = chanBuf[l1] + x
  //   l3 = chanBuf[l2] + y
  //   eventBase = chanBuf[l3] * 2
  //   -> read 4-byte ProTracker event at chanBuf[eventBase]

  const trackerPatterns: Pattern[] = [];

  for (let i = 0; i < numPatterns; i++) {
    const channelRows: TrackerCell[][] = [[], [], [], []];

    for (let j = 0; j < 4; j++) {
      // Load up to 1024 bytes of channel data into a local buffer
      const chanOff = patAddr + (patTable[i]?.[j] ?? 0);
      const chanEnd = Math.min(chanOff + 1024, buf.length);
      const chanLen = chanEnd > chanOff ? chanEnd - chanOff : 0;
      const chanBuf = new Uint8Array(chanLen);
      if (chanLen > 0) {
        chanBuf.set(buf.subarray(chanOff, chanOff + chanLen));
      }

      for (let k = 0; k < 4; k++) {
        for (let x = 0; x < 4; x++) {
          for (let y = 0; y < 4; y++) {
            const l1 = k;
            const l2 = chanLen > l1 ? chanBuf[l1] + x : 0;
            const l3 = chanLen > l2 ? chanBuf[l2] + y : 0;
            const eventBase = chanLen > l3 ? chanBuf[l3] * 2 : 0;

            if (
              chanLen <= l1 ||
              chanLen <= l2 ||
              chanLen <= l3 ||
              eventBase + 4 > chanLen
            ) {
              channelRows[j].push(emptyCell());
              continue;
            }

            channelRows[j].push(decodeProTrackerEvent(chanBuf, eventBase));
          }
        }
      }
    }

    trackerPatterns.push({
      id: `pattern-${i}`,
      name: `Pattern ${i}`,
      length: 64,
      channels: channelRows.map((rows, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        // Amiga standard LRRL stereo panning
        pan: (ch === 0 || ch === 3) ? -50 : 50,
        instrumentId: null,
        color: null,
        rows,
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 4,
        originalPatternCount: numPatterns,
        originalInstrumentCount: 31,
      },
    });
  }

  if (trackerPatterns.length === 0) {
    trackerPatterns.push(createEmptyPattern(filename));
  }

  const songPositions = orderTable
    .slice(0, numPatterns)
    .map((idx) => Math.min(idx, trackerPatterns.length - 1));

  const instrConfigs: InstrumentConfig[] = instruments.map((inst, i) => {
    const id = i + 1;
    return {
      id,
      name: 'Sample ' + id,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: inst.volume > 0 ? 20 * Math.log10(inst.volume / 64) : -60,
      pan: 0,
      metadata: {
        modPlayback: {
          usePeriodPlayback: true,
          periodMultiplier: 3546895,
          finetune: inst.finetune,
          defaultVolume: inst.volume,
        },
        mfpSample: {
          lengthBytes: inst.length,
          loopStart: inst.loopStart,
          loopSize: inst.loopSize,
          hasLoop: inst.hasLoop,
        },
      },
    } as InstrumentConfig;
  });

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/\..*$/, '') || baseName;

  return {
    name: moduleName + ' [Magnetic Fields Packer]',
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments: instrConfigs,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function createEmptyPattern(filename: string): Pattern {
  return {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: 'channel-' + ch,
      name: 'Channel ' + (ch + 1),
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: 64 }, () => emptyCell()),
    })),
    importMetadata: {
      sourceFormat:            'MFP',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    4,
      originalPatternCount:    1,
      originalInstrumentCount: 31,
    },
  };
}
