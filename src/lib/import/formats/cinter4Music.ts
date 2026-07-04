/**
 * cinter4Music.ts — decode the music section of a compiled `.cinter4` file back into
 * the per-tick streams that `Cinter4Exporter.encodeFromStreams` consumes.
 *
 * A `.cinter4` file has no editable tracker structure: at compile time CinterConvert
 * flattened every ProTracker row, effect, and speed command into four parallel 50 Hz
 * per-tick tracks of 16-bit note words (see
 * `thoughts/shared/research/2026-07-02_cinter4-music-section-bytemap.md`). This module
 * inverts that encoding: it replays the player's running-state machine over the note
 * words to recover, per tick per track, the absolute (instrument, period, volume,
 * offset) tuple — i.e. exactly the `notedata/perioddata/volumedata/offsetdata` streams
 * the exporter builds from a MOD. Feeding the decoded streams straight back into
 * `encodeFromStreams` reproduces the original songdata byte-for-byte (the two functions
 * are exact inverses), which is what makes edit-and-re-export lossless.
 *
 * All words are big-endian. Reference: player/Cinter4.S (CinterPlay2, _noteloop) and
 * convert/CinterConvert.py (note-word packing, lines 442-505).
 */
import type { Pattern, ChannelData, TrackerCell } from '@/types/tracker';

// Standard 36-entry ProTracker period table (C-1..B-3). Note value indexes it directly.
const PERIOD_TABLE = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

const VOLUME_SHIFT = 9;

/** A parsed instrument header: verbatim stored words + raw/generated classification. */
export interface Cinter4InstHeader {
  index: number;           // global index (raw instruments first, then generated)
  isRaw: boolean;
  words: number[];         // the exact stored words (2 for raw [len,replen], 11 for generated)
}

/** One note-range table entry (drives the noteId → instrument/note walk). */
export interface Cinter4NoteRange {
  noteMin: number;
  count: number;
  offsetWords: number;     // sample offset in words (off128 / 128)
}

export interface Cinter4DecodedMusic {
  notedata: number[][];    // [track][tick] 1-based instrument index (0 = no trigger); instHeaders[v-1]
  perioddata: number[][];  // [track][tick] absolute Paula period
  volumedata: number[][];  // [track][tick] absolute volume 0..63
  offsetdata: number[][];  // [track][tick] sample offset (words)
  instHeaders: Cinter4InstHeader[]; // file order; also the encoder instList order
  noteRanges: Cinter4NoteRange[];
  trackSizeBytes: number;
  ticksPerTrack: number;
  restartTick: number;     // loop-back tick index in stream space
}

const signExtend9 = (x: number): number => (x & 0x100 ? x - 0x200 : x);

/**
 * Resolve a trigger word's 9-bit noteId to (instrument index, note) via the note-range
 * walk. 1:1 port of Cinter4.S:229-243 (`_noteloop`): subtract each range's count until
 * the id fits; every range whose offset is 0 starts a new instrument.
 */
export function resolveNoteId(
  noteId: number,
  ranges: Cinter4NoteRange[],
): { instIndex: number; note: number; offsetWords: number } {
  let d0 = noteId;
  let instIndex = -1;
  let i = 0;
  let e = ranges[0];
  for (;;) {
    e = ranges[i++];
    if (e.offsetWords === 0) instIndex += 1;
    d0 -= e.count;
    if (d0 < 0) break;
  }
  d0 += e.count;
  return { instIndex, note: e.noteMin + d0, offsetWords: e.offsetWords };
}

/**
 * Parse + decode a full `.cinter4` file into per-tick streams.
 * Returns null if the buffer is too short or structurally invalid.
 */
export function decodeCinter4Music(bytes: Uint8Array): Cinter4DecodedMusic | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const u16 = (): number => { const v = view.getUint16(off, false); off += 2; return v; };
  const i16 = (): number => { const v = view.getInt16(off, false); off += 2; return v; };
  const canRead = (n: number): boolean => off + n <= bytes.length;

  if (!canRead(2)) return null;

  // ── Instrument section ──
  const instHeaders: Cinter4InstHeader[] = [];
  const firstWord = view.getInt16(0, false);
  const nRaw = firstWord < 0 ? -firstWord : 0;
  if (firstWord < 0) off = 2; // consume the raw-count word only when present
  for (let r = 0; r < nRaw; r++) {
    if (!canRead(4)) return null;
    const length = u16();
    const replength = u16();
    instHeaders.push({ index: r, isRaw: true, words: [length, replength] });
  }
  if (!canRead(2)) return null;
  const nGen = i16() + 1; // stored as count-1 (dbra convention)
  if (nGen < 0 || nGen > 512) return null;
  for (let g = 0; g < nGen; g++) {
    if (!canRead(22)) return null;
    const words: number[] = [];
    for (let w = 0; w < 11; w++) words.push(u16());
    instHeaders.push({ index: nRaw + g, isRaw: false, words });
  }

  // ── Music header ──
  if (!canRead(4)) return null;
  const trackSizeBytes = i16() & 0xffff; // len(notes_data)//4 = bytes per track
  const noteRangeLen = i16() & 0xffff;   // bytes of note-range block (INCLUDES trailing restart word)
  if (noteRangeLen < 2 || (noteRangeLen - 2) % 4 !== 0) return null;
  const nRanges = (noteRangeLen - 2) / 4;
  if (!canRead(noteRangeLen)) return null;

  const noteRanges: Cinter4NoteRange[] = [];
  for (let n = 0; n < nRanges; n++) {
    const noteMin = view.getUint8(off); off += 1;
    const count = view.getUint8(off); off += 1;
    const off128 = u16();
    noteRanges.push({ noteMin, count, offsetWords: off128 / 128 });
  }
  const restartWord = i16(); // final word of the note-range block

  // ── Notes data: 4 tracks in file order [3,2,1,0], TrackSize bytes each ──
  const ticksPerTrack = Math.floor(trackSizeBytes / 2);
  if (!canRead(4 * trackSizeBytes)) return null;
  const notesStart = off;
  const restartTick = ticksPerTrack - 1 + restartWord / 2;

  const notedata: number[][] = [[], [], [], []];
  const perioddata: number[][] = [[], [], [], []];
  const volumedata: number[][] = [[], [], [], []];
  const offsetdata: number[][] = [[], [], [], []];

  // File track slots map to Paula channels 3,2,1,0. The exporter packs its logical
  // tracks 0..3 in the order [3,2,1,0], so file slot s holds exporter track (3 - s).
  for (let slot = 0; slot < 4; slot++) {
    const track = 3 - slot;
    const base = notesStart + slot * trackSizeBytes;
    let pper = 0, pvol = 0, pdper = 0;
    let initial = true;
    for (let t = 0; t < ticksPerTrack; t++) {
      const w = view.getUint16(base + t * 2, false);
      if (w & 0x8000) {
        // Trigger: absolute note + absolute volume, instrument via range-walk.
        const noteId = w & 0x1ff;
        const vol = (w >> VOLUME_SHIFT) & 0x3f;
        const { instIndex, note, offsetWords } = resolveNoteId(noteId, noteRanges);
        const per = PERIOD_TABLE[note];
        // notedata is 1-based (0 = no trigger, matching the exporter's MOD-instrument
        // convention), so a trigger for global instrument 0 must store 1.
        notedata[track].push(instIndex + 1);
        perioddata[track].push(per);
        volumedata[track].push(vol);
        offsetdata[track].push(offsetWords);
        pper = per; pvol = vol; pdper = 0; initial = false;
      } else if (initial) {
        // Before the first trigger the encoder emits 0 regardless — hold silence.
        notedata[track].push(0);
        perioddata[track].push(0);
        volumedata[track].push(0);
        offsetdata[track].push(0);
      } else {
        const f9 = w & 0x1ff;
        const dvol = (w >> VOLUME_SHIFT) & 0x3f;
        const vol = (pvol + dvol) & 63;
        if (((f9 >> 7) ^ (f9 >> 6)) & 1) {
          // Absolute-note word (no retrigger): period set from table index.
          const note = f9 & 0x7f;
          const per = PERIOD_TABLE[note];
          notedata[track].push(0);
          perioddata[track].push(per);
          volumedata[track].push(vol);
          offsetdata[track].push(0);
          pper = per; pvol = vol; pdper = 0;
        } else {
          // Slide word: signed 9-bit period delta relative to running period.
          const dper = signExtend9(f9);
          const per = pper + dper;
          notedata[track].push(0);
          perioddata[track].push(per);
          volumedata[track].push(vol);
          offsetdata[track].push(0);
          pper = per; pvol = vol; pdper = f9;
        }
      }
    }
    void pdper; // retained to mirror the encoder's running state for clarity
  }

  return {
    notedata, perioddata, volumedata, offsetdata,
    instHeaders, noteRanges, trackSizeBytes, ticksPerTrack, restartTick,
  };
}

// ── Editable pattern representation ──────────────────────────────────────────

/** XM note number for Cinter period-table index 0 (C-1, period 856). */
export const CINTER4_XM_NOTE_BASE = 13;
/** Effect-type carrier for a 9xx sample offset (offset in words lives in `eff`). */
export const CINTER4_OFFSET_EFF = 9;
/** Rows per generated pattern — Cinter is decoded speed-1 (one row per 50 Hz tick). */
export const CINTER4_ROWS_PER_PATTERN = 64;

const emptyCell = (): TrackerCell => ({
  note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
});

const CHANNEL_PAN = [-50, 50, 50, -50] as const;

/**
 * Fold decoded per-tick streams into editable 64-row patterns (speed-1: one row per
 * tick). Trigger ticks become note+instrument+volume cells (period-index → XM note);
 * automation/hold ticks carry their exact absolute period+volume so re-encoding is
 * lossless. A 9xx sample offset (rare) rides in the first effect column.
 *
 * The exporter packs logical tracks in the order [3,2,1,0]; `decodeCinter4Music`
 * already un-mapped file slots to those logical tracks, so channel c === track c here.
 */
export function foldCinter4ToPatterns(d: Cinter4DecodedMusic): {
  patterns: Pattern[];
  songPositions: number[];
  restartPosition: number;
} {
  const total = d.ticksPerTrack;
  const count = Math.max(1, Math.ceil(total / CINTER4_ROWS_PER_PATTERN));
  const patterns: Pattern[] = [];

  for (let p = 0; p < count; p++) {
    const channels: ChannelData[] = [];
    for (let c = 0; c < 4; c++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < CINTER4_ROWS_PER_PATTERN; row++) {
        const tick = p * CINTER4_ROWS_PER_PATTERN + row;
        if (tick >= total) { rows.push(emptyCell()); continue; }
        const instN = d.notedata[c][tick];
        const per = d.perioddata[c][tick];
        const vol = d.volumedata[c][tick];
        const off = d.offsetdata[c][tick];
        const cell = emptyCell();
        cell.volume = vol;
        cell.period = per;
        if (instN !== 0) {
          const idx = PERIOD_TABLE.indexOf(per);
          cell.note = idx >= 0 ? idx + CINTER4_XM_NOTE_BASE : 0;
          cell.instrument = instN;
          if (off !== 0) { cell.effTyp = CINTER4_OFFSET_EFF; cell.eff = off; }
        }
        rows.push(cell);
      }
      channels.push({
        id: `channel-${c}`,
        name: `Channel ${c + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: CHANNEL_PAN[c] ?? 0,
        instrumentId: null, color: null,
        rows,
      });
    }
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: CINTER4_ROWS_PER_PATTERN, channels });
  }

  const restartPosition = Math.min(
    count - 1,
    Math.max(0, Math.floor(d.restartTick / CINTER4_ROWS_PER_PATTERN)),
  );
  const songPositions = Array.from({ length: count }, (_, i) => i);
  return { patterns, songPositions, restartPosition };
}

const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));

/**
 * Recover the ProTracker speed (ticks per row) that the song was compiled at, as the GCD
 * of the tick-spacing between consecutive note triggers across all four tracks. CinterConvert
 * expands every MOD row into `speed` ticks, so trigger positions are always multiples of the
 * speed — their GCD recovers it. Verified: Wasp-Octorubber → 6 (matches MOD), all triggers land
 * exactly on row boundaries. Falls back to 6 (the Cinter default) when a song is too sparse.
 */
export function recoverCinter4Speed(d: Cinter4DecodedMusic): number {
  let g = 0;
  for (let t = 0; t < 4; t++) {
    let prev = -1;
    for (let i = 0; i < d.notedata[t].length; i++) {
      if (d.notedata[t][i] !== 0) {
        if (prev >= 0) g = gcd2(g, i - prev);
        prev = i;
      }
    }
  }
  // Clamp to a sane ProTracker speed range; default 6 when undetermined.
  if (g < 1 || g > 31) return 6;
  return g;
}

// MOD/XM effect-type numbers for recovered automation (ProTracker command nibbles).
const EFF_ARPEGGIO = 0x0;
const EFF_PORTA_UP = 0x1;
const EFF_PORTA_DOWN = 0x2;
const EFF_VOLUME_SLIDE = 0xa;

/**
 * Detect a linear volume slide across a row's per-tick volumes. Returns the per-tick delta
 * (negative = fade out) if the window ramps consistently, else 0. The first step is ignored
 * (it can carry the trigger's volume clamp); the remaining deltas must agree within ±1.
 */
function detectVolumeSlide(vol: number[]): number {
  const n = vol.length;
  if (n < 3) return n === 2 ? vol[1] - vol[0] : 0;
  const slide = Math.round((vol[n - 1] - vol[1]) / (n - 2));
  if (slide === 0) return 0;
  for (let i = 2; i < n; i++) {
    if (Math.abs((vol[i] - vol[i - 1]) - slide) > 1) return 0;
  }
  return slide;
}

/**
 * Detect a period-domain effect (portamento or arpeggio) from a row's per-tick periods.
 * Returns null when the period is static or the shape doesn't match a known effect.
 */
function detectPeriodEffect(per: number[]): { effTyp: number; eff: number } | null {
  const n = per.length;
  if (n < 2) return null;
  if (per.every((p) => p === per[0])) return null;

  // Arpeggio: all periods are table pitches cycling among ≤3 values (base = first tick).
  const idxs = per.map((p) => PERIOD_TABLE.indexOf(p));
  if (idxs.every((i) => i >= 0)) {
    const distinct = [...new Set(idxs)];
    if (distinct.length <= 3) {
      const base = idxs[0];
      const offs = distinct.map((i) => i - base).filter((o) => o > 0 && o < 16).sort((a, b) => a - b);
      if (offs.length >= 1) {
        const x = offs[0] ?? 0;
        const y = offs[1] ?? 0;
        return { effTyp: EFF_ARPEGGIO, eff: ((x & 0xf) << 4) | (y & 0xf) };
      }
    }
  }

  // Portamento: consistent per-tick period delta (period down = pitch up = 1xx).
  const slide = Math.round((per[n - 1] - per[0]) / (n - 1));
  if (slide !== 0) {
    let linear = true;
    for (let i = 1; i < n; i++) if (Math.abs((per[i] - per[i - 1]) - slide) > 1) { linear = false; break; }
    if (linear) {
      const mag = Math.min(0xff, Math.abs(slide));
      return slide < 0 ? { effTyp: EFF_PORTA_UP, eff: mag } : { effTyp: EFF_PORTA_DOWN, eff: mag };
    }
  }
  return null;
}

/**
 * Analyze one row's `speed`-tick window (one track) into a MOD-like cell: note+instrument
 * on a trigger, plus the recovered volume-slide / portamento / arpeggio effect (Phase B).
 */
function analyzeCinter4Row(d: Cinter4DecodedMusic, c: number, base: number, speed: number): TrackerCell {
  const cell = emptyCell();
  const n = Math.min(speed, d.ticksPerTrack - base);
  if (n <= 0) return cell;
  const vol: number[] = [];
  const per: number[] = [];
  for (let k = 0; k < n; k++) { vol.push(d.volumedata[c][base + k]); per.push(d.perioddata[c][base + k]); }

  const instN = d.notedata[c][base];
  if (instN !== 0) {
    const idx = PERIOD_TABLE.indexOf(per[0]);
    cell.note = idx >= 0 ? idx + CINTER4_XM_NOTE_BASE : 0;
    cell.instrument = instN;
    cell.volume = vol[0];
    const off = d.offsetdata[c][base];
    if (off !== 0) { cell.effTyp = CINTER4_OFFSET_EFF; cell.eff = off; return cell; }
  }

  // One effect slot: prefer a volume slide, else a period effect.
  const vslide = detectVolumeSlide(vol);
  if (vslide !== 0) {
    const mag = Math.min(0xf, Math.abs(vslide));
    cell.effTyp = EFF_VOLUME_SLIDE;
    cell.eff = vslide < 0 ? mag : (mag << 4); // Axy: high nibble = up, low = down
    return cell;
  }
  const pe = detectPeriodEffect(per);
  if (pe) { cell.effTyp = pe.effTyp; cell.eff = pe.eff; }
  return cell;
}

/**
 * Fold decoded per-tick streams into MOD-like patterns at the recovered speed: one row per
 * `speed` ticks. Note triggers become clean note+instrument+volume cells; per-tick automation
 * is heuristically lifted into MOD effect columns (volume slide `Axy`, portamento `1xx/2xx`,
 * arpeggio `0xy` — Phase B of the decompile-to-MOD work, see the 2026-07-02 plan Rev 2).
 * Recovered effects are musically equivalent, not byte-identical to the original MOD.
 * Playback of the imported song stays on the bit-exact WASM engine (cinter4FileData).
 */
export function foldCinter4ToModPatterns(d: Cinter4DecodedMusic): {
  patterns: Pattern[];
  songPositions: number[];
  restartPosition: number;
  speed: number;
} {
  const speed = recoverCinter4Speed(d);
  const totalRows = Math.max(1, Math.ceil(d.ticksPerTrack / speed));
  const count = Math.max(1, Math.ceil(totalRows / CINTER4_ROWS_PER_PATTERN));
  const patterns: Pattern[] = [];

  for (let p = 0; p < count; p++) {
    const channels: ChannelData[] = [];
    for (let c = 0; c < 4; c++) {
      const rows: TrackerCell[] = [];
      for (let row = 0; row < CINTER4_ROWS_PER_PATTERN; row++) {
        const globalRow = p * CINTER4_ROWS_PER_PATTERN + row;
        const tick = globalRow * speed;
        rows.push(tick < d.ticksPerTrack ? analyzeCinter4Row(d, c, tick, speed) : emptyCell());
      }
      channels.push({
        id: `channel-${c}`,
        name: `Channel ${c + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: CHANNEL_PAN[c] ?? 0,
        instrumentId: null, color: null,
        rows,
      });
    }
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: CINTER4_ROWS_PER_PATTERN, channels });
  }

  const restartRow = Math.floor(d.restartTick / speed);
  const restartPosition = Math.min(count - 1, Math.max(0, Math.floor(restartRow / CINTER4_ROWS_PER_PATTERN)));
  const songPositions = Array.from({ length: count }, (_, i) => i);
  return { patterns, songPositions, restartPosition, speed };
}

/**
 * Rebuild the per-tick streams from the (possibly edited) pattern representation — the
 * inverse of {@link foldCinter4ToPatterns}. Trigger cells derive their period from the
 * editable note (so retuning a note changes the export); automation cells use their
 * stored absolute period. Emits exactly `ticksPerTrack` ticks per track.
 */
export function rebuildCinter4Streams(
  patterns: Pattern[],
  songPositions: number[],
  ticksPerTrack: number,
): { notedata: number[][]; perioddata: number[][]; volumedata: number[][]; offsetdata: number[][] } {
  const notedata: number[][] = [[], [], [], []];
  const perioddata: number[][] = [[], [], [], []];
  const volumedata: number[][] = [[], [], [], []];
  const offsetdata: number[][] = [[], [], [], []];

  let globalTick = 0;
  outer:
  for (const pos of songPositions) {
    const pat = patterns[pos];
    if (!pat) continue;
    const rowCount = pat.channels[0]?.rows.length ?? CINTER4_ROWS_PER_PATTERN;
    for (let row = 0; row < rowCount; row++) {
      if (globalTick >= ticksPerTrack) break outer;
      for (let c = 0; c < 4; c++) {
        const cell = pat.channels[c]?.rows[row] ?? emptyCell();
        const instN = cell.instrument || 0;
        let per: number;
        let off = 0;
        if (instN !== 0) {
          const idx = Math.min(35, Math.max(0, (cell.note || CINTER4_XM_NOTE_BASE) - CINTER4_XM_NOTE_BASE));
          per = PERIOD_TABLE[idx];
          off = cell.effTyp === CINTER4_OFFSET_EFF ? (cell.eff || 0) : 0;
        } else {
          per = cell.period ?? 0;
        }
        notedata[c].push(instN);
        perioddata[c].push(per);
        volumedata[c].push(cell.volume || 0);
        offsetdata[c].push(off);
      }
      globalTick++;
    }
  }

  return { notedata, perioddata, volumedata, offsetdata };
}
