/**
 * FMTrackerParser.ts — Davey W Taylor's FM Tracker (.fmt) format parser
 *
 * FM Tracker is an OPL/FM-only DOS tracker format with 8 channels.
 * No PCM samples — all channels use OPL FM patches stored in the header.
 *
 * Binary layout:
 *   +0    magic[11]         — "FMTracker\x01\x01" (11 bytes including version)
 *   +11   trackerName[20]   — null-terminated tracker name string
 *   +31   songName[32]      — null-terminated song name string
 *   +63   channels[8]       — 8 × FMTChannelSetting (19 bytes each = 152 bytes total)
 *         Each FMTChannelSetting: name[8] + settings[11]
 *   +215  lastRow (uint8)   — last row index (numRows = lastRow + 1)
 *   +216  lastOrder (uint8) — last order index (numOrders = lastOrder + 1)
 *   +217  lastPattern(uint8)— last pattern index (numPatterns = lastPattern + 1)
 *   Header total: 218 bytes
 *
 *   After header:
 *   +218  orders[numOrders]       — uint8 order list
 *   +218+numOrders  delays[numOrders] — uint8 speed per order (1-8)
 *   +218+2*numOrders  patternMap[numPatterns] — uint8 pattern index mapping
 *
 *   Pattern data (event-driven per channel):
 *     0x80|n   — skip n rows (run-length skip)
 *     0        — no event
 *     1        — NOTE_CUT
 *     2-97     — note (data + NOTE_MIN + 11 → XM note, chn+1 as instrument)
 *
 * OPL validation: channel.settings[8] & 0xFC, [9] & 0xFC, [10] & 0xF0 must all be 0
 * (rejects anything that looks like OPL3)
 *
 * Tempo: 18.2 Hz timer → ~45.5 BPM equivalent
 * Speed: from delays[0] initially, then from last row of each pattern (tempo quirk)
 *
 * Reference: OpenMPT soundlib/Load_fmt.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u8(v: DataView, off: number): number { return v.getUint8(off); }

function readNullTerminated(v: DataView, off: number, maxLen: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const b = v.getUint8(off + i);
    if (b === 0) break;
    bytes.push(b);
  }
  return String.fromCharCode(...bytes).trim();
}

// ── Constants ──────────────────────────────────────────────────────────────

const HEADER_SIZE         = 218;
const CHANNEL_SETTING_SIZE = 19;  // name[8] + settings[11]
const NUM_CHANNELS        = 8;
const MAGIC               = 'FMTracker\x01\x01';

const OFFSET_MAGIC        = 0;
const OFFSET_TRACKER_NAME = 11;
const OFFSET_SONG_NAME    = 31;
const OFFSET_CHANNELS     = 63;
const OFFSET_LAST_ROW     = 215;
const OFFSET_LAST_ORDER   = 216;
const OFFSET_LAST_PATTERN = 217;

// NOTE_NOTECUT value (matches OpenMPT NOTE_NOTECUT = 97 in 1-based note space)
const NOTE_NOTECUT = 97;

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Returns true if the buffer looks like an FM Tracker (.fmt) file.
 * Mirrors ValidateHeader() from OpenMPT Load_fmt.cpp.
 */
export function isFMTrackerFormat(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_SIZE) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check magic: "FMTracker\x01\x01"
  for (let i = 0; i < MAGIC.length; i++) {
    if (v.getUint8(OFFSET_MAGIC + i) !== MAGIC.charCodeAt(i)) return false;
  }

  // Validate OPL2-only: reject anything that looks like OPL3
  for (let chn = 0; chn < NUM_CHANNELS; chn++) {
    const settingsBase = OFFSET_CHANNELS + chn * CHANNEL_SETTING_SIZE + 8; // settings[] at offset +8 in struct
    if ((u8(v, settingsBase + 0) & 0xFC) !== 0) return false;  // settings[8]
    if ((u8(v, settingsBase + 1) & 0xFC) !== 0) return false;  // settings[9]
    if ((u8(v, settingsBase + 2) & 0xF0) !== 0) return false;  // settings[10]
  }

  const lastOrder   = u8(v, OFFSET_LAST_ORDER);
  const lastPattern = u8(v, OFFSET_LAST_PATTERN);

  // Minimum additional size: order list + delays + pattern map
  const minAdditional = (lastOrder + 1) * 2 + (lastPattern + 1);
  if (bytes.length < HEADER_SIZE + minAdditional) return false;

  return true;
}

// ── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse an FM Tracker (.fmt) file into a TrackerSong.
 * Returns null on any parse failure (never throws).
 */
export function parseFMTrackerFile(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return _parse(bytes, filename);
  } catch {
    return null;
  }
}

function _parse(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isFMTrackerFormat(bytes)) return null;

  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const _trackerName = readNullTerminated(v, OFFSET_TRACKER_NAME, 20);
  const songName    = readNullTerminated(v, OFFSET_SONG_NAME, 32);
  const numRows     = u8(v, OFFSET_LAST_ROW)     + 1;
  const numOrders   = u8(v, OFFSET_LAST_ORDER)   + 1;
  const numPatterns = u8(v, OFFSET_LAST_PATTERN) + 1;

  // Read channel names and OPL patch data
  const channelNames: string[] = [];
  // We store OPL settings for metadata but use placeholder instruments
  for (let chn = 0; chn < NUM_CHANNELS; chn++) {
    const nameBase = OFFSET_CHANNELS + chn * CHANNEL_SETTING_SIZE;
    channelNames.push(readNullTerminated(v, nameBase, 8) || `Channel ${chn + 1}`);
  }

  // Read order list: bytes [HEADER_SIZE .. HEADER_SIZE+numOrders)
  let pos = HEADER_SIZE;
  const orders: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    orders.push(u8(v, pos++));
  }

  // Read delays: bytes [pos .. pos+numOrders)
  const delays: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    const d = u8(v, pos++);
    if (d < 1 || d > 8) return null;  // Invalid delay
    delays.push(d);
  }

  // Read pattern map: bytes [pos .. pos+numPatterns)
  const patternMap: number[] = [];
  for (let i = 0; i < numPatterns; i++) {
    patternMap.push(u8(v, pos++));
  }

  // Build instruments — FM-only, use placeholder synth instruments
  const instruments: InstrumentConfig[] = [];
  for (let chn = 0; chn < NUM_CHANNELS; chn++) {
    const id   = chn + 1;
    const name = channelNames[chn];
    instruments.push({
      id,
      name,
      type:      'sample' as const,
      synthType: 'Sampler' as const,
      effects:   [],
      volume:    0,
      pan:       0,
    } as unknown as InstrumentConfig);
  }

  // Parse all unique patterns referenced by the pattern map.
  // patternMap[i] gives the actual pattern slot for pattern i.
  // We need to read pattern data sequentially: each pattern = 8 channels × numRows cells.
  // Cell encoding (from OpenMPT Load_fmt.cpp):
  //   0x80|n  = skip n rows
  //   0       = nothing
  //   1       = note cut
  //   2-97    = note (data + NOTE_MIN + 11)
  //
  // Track current position in file as we read pattern data sequentially.
  const patternCells: Map<number, TrackerCell[][]> = new Map();

  // Read patterns in order (0 to numPatterns-1)
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const actualPat = patternMap[patIdx];
    // cells[channel][row]
    const cells: TrackerCell[][] = Array.from({ length: NUM_CHANNELS }, () =>
      Array.from({ length: numRows }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0,
        effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      }))
    );

    for (let chn = 0; chn < NUM_CHANNELS; chn++) {
      let row = 0;
      while (row < numRows) {
        if (pos >= bytes.length) break;
        const data = u8(v, pos++);

        if (data & 0x80) {
          // Skip rows
          row += data & 0x7F;
        } else if (data === 0) {
          // No event — advance row
          row++;
        } else if (data === 1) {
          // Note cut
          cells[chn][row].note = NOTE_NOTECUT;
          row++;
        } else if (data >= 2 && data <= 97) {
          // Note: data + NOTE_MIN + 11; NOTE_MIN=1 → note = data + 12
          cells[chn][row].note       = data + 12;
          cells[chn][row].instrument = chn + 1;
          row++;
        } else {
          // Unknown — skip
          row++;
        }
      }
    }

    patternCells.set(actualPat, cells);
  }

  // Build TrackerSong patterns — one per order entry.
  // Speed quirk from OpenMPT: the delay for order[ord] is applied to the LAST ROW
  // of that pattern (not the first row of the next pattern). We model this by
  // injecting CMD_SPEED on the last row of each pattern.
  const CMD_SPEED = 0x0F;

  const patterns: Pattern[] = orders.map((patIdx, orderPos) => {
    const cells = patternCells.get(patIdx);
    const speed = delays[orderPos];
    // Next order's delay applies to the last row of THIS pattern
    const nextSpeed = delays[(orderPos + 1) % numOrders];

    const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, chn) => {
      const rows: TrackerCell[] = Array.from({ length: numRows }, (_, row): TrackerCell => {
        const src: TrackerCell = cells
          ? { ...cells[chn][row] }
          : { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

        // Inject initial speed on row 0, channel 0
        if (chn === 0 && row === 0 && src.effTyp === 0) {
          src.effTyp = CMD_SPEED;
          src.eff    = speed;
        }

        // Inject next-pattern speed on last row, channel 0 (matches OpenMPT tempo quirk)
        if (chn === 0 && row === numRows - 1 && nextSpeed !== speed) {
          if (src.effTyp === 0 || src.effTyp === CMD_SPEED) {
            src.effTyp = CMD_SPEED;
            src.eff    = nextSpeed;
          }
        }

        return src;
      });

      return {
        id:           `c${orderPos}-ch${chn}`,
        name:         channelNames[chn],
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          0,
        instrumentId: null,
        color:        null,
        rows,
      };
    });

    return {
      id:     `pattern-${orderPos}-${patIdx}`,
      name:   `Pattern ${patIdx}`,
      length: numRows,
      channels,
      importMetadata: {
        sourceFormat:            'fmt',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: NUM_CHANNELS,
      },
    };
  });

  const songPositions = patterns.map((_, i) => i);
  const songName_ = songName || filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName_,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength:      songPositions.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    delays[0] ?? 4,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
