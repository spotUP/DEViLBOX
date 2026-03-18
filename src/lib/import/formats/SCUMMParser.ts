/**
 * SCUMMParser.ts — SCUMM Amiga music format detection and native pattern parser
 *
 * The SCUMM Amiga music format is used by early LucasArts SCUMM games (e.g. Maniac Mansion).
 * Each .scumm file is a self-contained 68k binary: player code + music data fused together.
 *
 * UADE eagleplayer: scumm.* prefix (force-classic streaming).
 * Replayer source: docs/formats/Replayers/DeliPlayers/AndySilva/DP_SCUMM.s (thin wrapper).
 *
 * Binary layout:
 *   +0    4 bytes  Entry code / call vector
 *   +4    2 bytes  BRA.W opcode (0x6000)
 *   +6    2 bytes  BRA displacement → player_start = 6 + disp
 *   +8    N bytes  Null-terminated title string
 *   +N+1  ...      Music data (channel state tables + waveform tables + 4 voice event streams)
 *   [player_start] 68k player code
 *
 * Voice event record (16 bytes, big-endian):
 *   [0-1]   uint16  Note duration in ticks (usually 0x000A = 10)
 *   [2-3]   uint16  Voice index (0-3) or 0xFFFF (separator / end-of-stream)
 *   [4-5]   uint16  Instrument index (same as voice)
 *   [6-11]  6 bytes Padding zeros
 *   [12-13] uint16  Absolute tick timestamp (monotonically increasing per voice)
 *   [14-15] uint16  Amiga period (0xFFFF = end-of-voice stream marker)
 *
 * The four voice streams are stored sequentially, separated by 0xFFFF records:
 *   Voice 0 events → 0xFFFF separator → Voice 1 events → 0xFFFF separator
 *   → Voice 2 events → 0xFFFF separator → Voice 3 events → (player code)
 *
 * Audio: UADE classic streaming; pattern display: this native parser.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ---------------------------------------------------------------------------
// ProTracker period table (finetune = 0, octaves 1–4)
// ---------------------------------------------------------------------------
const PT_PERIODS: [number, string][] = [
  [856,'C-1'],[808,'C#1'],[762,'D-1'],[720,'D#1'],[678,'E-1'],[640,'F-1'],
  [604,'F#1'],[570,'G-1'],[538,'G#1'],[508,'A-1'],[480,'A#1'],[453,'B-1'],
  [428,'C-2'],[404,'C#2'],[381,'D-2'],[360,'D#2'],[339,'E-2'],[320,'F-2'],
  [302,'F#2'],[285,'G-2'],[269,'G#2'],[254,'A-2'],[240,'A#2'],[226,'B-2'],
  [214,'C-3'],[202,'C#3'],[190,'D-3'],[180,'D#3'],[170,'E-3'],[160,'F-3'],
  [151,'F#3'],[143,'G-3'],[135,'G#3'],[127,'A-3'],[120,'A#3'],[113,'B-3'],
  [107,'C-4'],[101,'C#4'],[ 95,'D-4'],[ 90,'D#4'],[ 85,'E-4'],[ 80,'F-4'],
  [ 76,'F#4'],[ 71,'G-4'],[ 67,'G#4'],[ 64,'A-4'],[ 60,'A#4'],[ 57,'B-4'],
];

/** Convert Amiga period to the nearest XM note index (1-based; 0 = no note). */
function periodToNote(period: number): number {
  if (period <= 0 || period === 0xFFFF) return 0;
  let bIdx = 0;
  let bDist = Math.abs(PT_PERIODS[0][0] - period);
  for (let i = 1; i < PT_PERIODS.length; i++) {
    const d = Math.abs(PT_PERIODS[i][0] - period);
    if (d < bDist) { bDist = d; bIdx = i; }
  }
  return bIdx + 1; // 1-based
}

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/**
 * Detect SCUMM Amiga music format.
 * Heuristic: BRA.W opcode at offset 4, null-terminated title at offset 8,
 * followed by voice event data, with player code at BRA destination.
 */
export function isSCUMMFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 64) return false;
  // BRA.W opcode at offset 4
  if (buf[4] !== 0x60 || buf[5] !== 0x00) return false;
  // BRA destination must be within the file
  const braDisp = u16BE(buf, 6);
  const playerStart = 6 + braDisp;
  if (playerStart <= 8 || playerStart >= buf.length) return false;
  // Title: printable ASCII starting at offset 8
  if (buf[8] < 0x20 || buf[8] > 0x7E) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Event collection
// ---------------------------------------------------------------------------

interface VoiceEvent {
  tick: number;
  voice: number;
  period: number;
  duration: number;
}

/** Scan buf[start..end) for the start of the voice event data section. */
function findEventsStart(buf: Uint8Array, start: number, end: number): number {
  // Align to the next 16-byte file boundary so we step on the event records
  // (which are laid out at file-aligned multiples of 16).
  const alignedStart = Math.ceil(start / 16) * 16;
  // Validity criteria for a genuine voice event block:
  //   ch (bytes[2-3]) ∈ {0,1,2,3} or 0xFFFF (separator)
  //   inst (bytes[4-5]) == ch  ← format says "instrument index (same as voice)"
  //   bytes[6-11] all zero
  //   tick (bytes[12-13]) monotonically non-decreasing
  //   at least one non-separator record with Amiga period in 50–900
  //   all non-separator records share the same ch value
  for (let off = alignedStart; off <= end - 128; off += 16) {
    let valid = true;
    let periodCount = 0;
    let firstVoice = -1;
    let lastTick = -1;
    for (let i = 0; i < 8 && valid; i++) {
      const base = off + i * 16;
      const ch   = u16BE(buf, base + 2);
      if (ch === 0xFFFF) continue; // separator — OK
      if (ch > 3) { valid = false; break; }
      // Instrument index must equal voice index
      const inst = u16BE(buf, base + 4);
      if (inst !== ch) { valid = false; break; }
      // All non-separator records must share the same voice
      if (firstVoice === -1) firstVoice = ch;
      else if (ch !== firstVoice) { valid = false; break; }
      // bytes[6-11] should be zeros
      for (let j = 6; j < 12; j++) {
        if (buf[base + j] !== 0) { valid = false; break; }
      }
      if (!valid) break;
      // Ticks must be monotonically non-decreasing
      const tick = u16BE(buf, base + 12);
      if (tick < lastTick) { valid = false; break; }
      lastTick = tick;
      const period = u16BE(buf, base + 14);
      if (period >= 50 && period <= 900) periodCount++;
    }
    // At least 5/8 test records must have a valid Amiga period (rejects zero-filled padding)
    if (valid && periodCount >= 5 && firstVoice !== -1) return off;
  }
  return start; // fallback
}

/** Collect all note events from the voice streams. */
function collectEvents(buf: Uint8Array, eventsStart: number, playerStart: number): VoiceEvent[] {
  const events: VoiceEvent[] = [];
  for (let off = eventsStart; off <= playerStart - 16; off += 16) {
    const ch = u16BE(buf, off + 2);
    // Skip separator / all-FF blocks
    if (ch === 0xFFFF) continue;
    if (ch > 3) break; // unexpected — stop parsing
    // Verify padding zeros
    let padOk = true;
    for (let j = 6; j < 12; j++) {
      if (buf[off + j] !== 0) { padOk = false; break; }
    }
    if (!padOk) continue;

    const dur    = u16BE(buf, off);
    const tick   = u16BE(buf, off + 12);
    const period = u16BE(buf, off + 14);
    if (period !== 0xFFFF) {
      events.push({ tick, voice: ch, period, duration: dur });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseSCUMMFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSCUMMFormat(buf)) throw new Error('Not a SCUMM Amiga music file');

  // -- Locate sections -------------------------------------------------------
  const braDisp    = u16BE(buf, 6);
  const playerStart = 6 + braDisp; // BRA destination

  // Find null terminator of title (starting at offset 8)
  let titleEnd = 8;
  while (titleEnd < playerStart && buf[titleEnd] !== 0) titleEnd++;
  const title     = String.fromCharCode(...buf.slice(8, titleEnd));
  const dataStart = titleEnd + 1;

  const eventsStart = findEventsStart(buf, dataStart, playerStart);
  const events      = collectEvents(buf, eventsStart, playerStart);

  // -- Determine time grid ---------------------------------------------------
  // Events are timed in SCUMM vblank ticks (~50Hz PAL).
  // Most eighth-note events are spaced 11-12 ticks apart.
  // Map 1 row ≈ 11 ticks to get a musically reasonable grid.
  const TICKS_PER_ROW  = 11;
  const ROWS_PER_PATTERN = 64;

  const maxTick    = events.reduce((m, e) => Math.max(m, e.tick), 0);
  const totalRows  = Math.ceil(maxTick / TICKS_PER_ROW) + 1;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));
  const NUM_CHANNELS = 4;

  // -- Build pattern grid ----------------------------------------------------
  type CellData = { note: number; instrument: number; volume: number;
                    effTyp: number; eff: number; effTyp2: number; eff2: number; };
  const emptyCell = (): CellData => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

  // grid[patIdx][chIdx][rowIdx] = CellData
  const grid: CellData[][][] = Array.from({ length: numPatterns }, () =>
    Array.from({ length: NUM_CHANNELS }, () =>
      Array.from({ length: ROWS_PER_PATTERN }, () => emptyCell())
    )
  );

  for (const ev of events) {
    const rowIdx    = Math.round(ev.tick / TICKS_PER_ROW);
    const patIdx    = Math.floor(rowIdx / ROWS_PER_PATTERN);
    const localRow  = rowIdx % ROWS_PER_PATTERN;
    if (patIdx >= numPatterns) continue;

    const note = periodToNote(ev.period);
    const ch   = ev.voice;
    const cell = grid[patIdx][ch][localRow];
    if (cell.note === 0) { // don't overwrite if already placed (quantization collision)
      cell.note       = note;
      cell.instrument = ch + 1; // 1-based voice → instrument
    }
  }

  // -- Build TrackerPattern objects ------------------------------------------
  const patterns = [];
  for (let p = 0; p < numPatterns; p++) {
    const rowsInPat = p === numPatterns - 1
      ? Math.max(1, totalRows - p * ROWS_PER_PATTERN)
      : ROWS_PER_PATTERN;
    const clampedRows = Math.min(rowsInPat, ROWS_PER_PATTERN);

    patterns.push({
      id:   `pattern-${p}`,
      name: `Pattern ${p}`,
      length: clampedRows,
      channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
        id:           `channel-${ch}`,
        name:         `Voice ${ch + 1}`,
        muted:        false,
        solo:         false,
        collapsed:    false,
        volume:       100,
        pan:          ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color:        null,
        rows:         grid[p][ch].slice(0, clampedRows),
      })),
      importMetadata: {
        sourceFormat:            'MOD' as const,
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    numPatterns,
        originalInstrumentCount: NUM_CHANNELS,
      },
    });
  }

  // -- Instruments (one per voice; synthesis-only) ---------------------------
  const instruments: InstrumentConfig[] = Array.from({ length: NUM_CHANNELS }, (_, i) => ({
    id:        i + 1,
    name:      `Voice ${i + 1}`,
    type:      'synth' as const,
    synthType: 'Synth' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig));

  const baseName   = filename.split('/').pop() ?? filename;
  const moduleName = title || baseName.replace(/^scumm\./i, '').replace(/\.scumm$/i, '') || baseName;

  return {
    name:            `${moduleName} [SCUMM]`,
    format:          'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   patterns.map((_, i) => i),
    songLength:      patterns.length,
    restartPosition: 0,
    numChannels:     NUM_CHANNELS,
    // Exact sync with UADE classic audio:
    // SCUMM runs at PAL 50Hz vblank. ProTracker CIA fires at 2×BPM/5 Hz = 50Hz when BPM=125.
    // Setting speed=TICKS_PER_ROW (11) locks the cursor to the 50Hz grid: 11×(1/50Hz)=220ms/row.
    initialSpeed:    TICKS_PER_ROW,
    initialBPM:      125,
    linearPeriods:   false,
  };
}
