/**
 * kdmGrid.ts - Ken Silverman KDM (.kdm) module carrier and grid mapping.
 *
 * File layout (kdm_engine.c, kdm_load): int32 version (0), int32 notes M
 * (1..8192), int32 tracks T (1..256); then per track four bytes wave,
 * quantize, defL, defR; then M int32 times (1/120 s ticks, ascending); then
 * the byte arrays track, pitch, volL (0 = note off), volR, fxF, fxV and, in
 * newer songs, fxP (older songs, e.g. flysong and klabsong, have no fxP and
 * are 12+4T+10M bytes instead of 12+4T+11M).
 *
 * The carrier is the original image. An edit rewrites fields of existing
 * events in place. A note typed on a cell with no event inserts one event at
 * that row's tick (after the events already on that tick, so the cell's lane
 * is kept): every array grows by one entry and the note count by one. Events
 * are never removed from the grid.
 *
 * Grid mapping:
 *  - Row zoom is the song's gcd of (time - time[0]) in ticks, so every event
 *    sits on a row and no row is wasted (measured per song, see kdmZoom).
 *    Rows are cut into 64-row patterns played in sequence.
 *  - Channels are per track x lane. Several events of one track on one tick
 *    (chords) take consecutive lanes in file order.
 *  - note = signed pitch + 15 (pitch -14..75 maps to 1..90, pitch 1 is
 *    about C7 in the engine); volL 0 is note off (97).
 *  - instrument = the track's wave + 1 (per track, so not editable per cell).
 *  - volume = 0x10 + (volL >> 2).
 *  - effTyp/eff = fxF/fxV (fxF 0 shows nothing). effTyp2 8 / eff2 = volR.
 *  - fxP, quantize and defL/defR are carried, never shown.
 */
import type { TrackerCell } from '@/types';

export const KDM_ROWS = 64;
export const KDM_GRID_NOTE_OFF = 97;
const NOTE_BIAS = 15;
const PAN_EFFECT = 8;

export interface KdmPlace { pattern: number; row: number; channel: number }

export interface KdmModule {
  notes: number;
  tracks: number;
  hasFxP: boolean;
  times: Int32Array;
  /** Ticks per grid row (gcd of the event times relative to the first). */
  zoom: number;
  /** First channel of each track; track t owns lanes[t] channels from there. */
  firstChannel: number[];
  lanes: number[];
  channels: number;
  patterns: number;
  /** Grid place of event i. */
  place: KdmPlace[];
  /** The original file bytes. */
  image: Uint8Array;
}

const HEADER = 12;
const i32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) | 0;

/** Byte offset of array k (0 track, 1 pitch, 2 volL, 3 volR, 4 fxF, 5 fxV, 6 fxP). */
export const kdmArrayOffset = (m: Pick<KdmModule, 'tracks' | 'notes'>, k: number): number =>
  HEADER + 4 * m.tracks + 4 * m.notes + k * m.notes;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The module, or null when the bytes are not a version 0 kdm of exactly the size the header implies. */
export function decodeKdmModule(bytes: Uint8Array): KdmModule | null {
  if (bytes.length < HEADER) return null;
  const version = i32(bytes, 0), notes = i32(bytes, 4), tracks = i32(bytes, 8);
  if (version !== 0 || notes < 1 || notes > 8192 || tracks < 1 || tracks > 256) return null;
  const base = HEADER + 4 * tracks + 4 * notes;
  const hasFxP = bytes.length === base + 7 * notes;
  if (!hasFxP && bytes.length !== base + 6 * notes) return null;
  const times = new Int32Array(notes);
  for (let i = 0; i < notes; i++) {
    times[i] = i32(bytes, HEADER + 4 * tracks + 4 * i);
    if (i > 0 && times[i] < times[i - 1]) return null;
  }
  const trackOf = (i: number): number => bytes[base + i];
  let zoom = 0;
  for (let i = 0; i < notes; i++) {
    if (trackOf(i) >= tracks) return null;
    zoom = gcd(zoom, times[i] - times[0]);
  }
  if (zoom === 0) zoom = 1;
  const laneCount = new Map<string, number>();
  const lanes = new Array<number>(tracks).fill(1);
  const lane: number[] = [];
  for (let i = 0; i < notes; i++) {
    const key = `${trackOf(i)}:${times[i]}`;
    const l = laneCount.get(key) ?? 0;
    laneCount.set(key, l + 1);
    lane.push(l);
    if (l + 1 > lanes[trackOf(i)]) lanes[trackOf(i)] = l + 1;
  }
  const firstChannel: number[] = [];
  let channels = 0;
  for (let t = 0; t < tracks; t++) { firstChannel.push(channels); channels += lanes[t]; }
  const lastRow = (times[notes - 1] - times[0]) / zoom;
  const patterns = Math.floor(lastRow / KDM_ROWS) + 1;
  const place: KdmPlace[] = [];
  for (let i = 0; i < notes; i++) {
    const r = (times[i] - times[0]) / zoom;
    place.push({ pattern: Math.floor(r / KDM_ROWS), row: r % KDM_ROWS, channel: firstChannel[trackOf(i)] + lane[i] });
  }
  return { notes, tracks, hasFxP, times, zoom, firstChannel, lanes, channels, patterns, place, image: bytes.slice() };
}

export const isKdmModule = (bytes: Uint8Array): boolean => decodeKdmModule(bytes) !== null;

const byteAt = (m: KdmModule, k: number, i: number): number => m.image[kdmArrayOffset(m, k) + i];

/** The grid cell event i shows. */
export function kdmEventCell(m: KdmModule, i: number): TrackerCell {
  const pitch = byteAt(m, 1, i), volL = byteAt(m, 2, i), volR = byteAt(m, 3, i);
  const fxF = byteAt(m, 4, i), fxV = byteAt(m, 5, i);
  const signed = pitch >= 242 ? pitch - 256 : pitch;
  const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const wave = m.image[HEADER + 4 * byteAt(m, 0, i)];
  cell.instrument = wave + 1;
  if (volL === 0) {
    cell.note = KDM_GRID_NOTE_OFF;
  } else {
    cell.note = signed >= -14 && signed <= 75 ? signed + NOTE_BIAS : 0;
    cell.volume = 0x10 + (volL >> 2);
    cell.effTyp2 = PAN_EFFECT;
    cell.eff2 = volR;
  }
  if (fxF !== 0) { cell.effTyp = fxF; cell.eff = fxV; }
  return cell;
}

export interface KdmGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

const same = (a: TrackerCell, b: TrackerCell): boolean =>
  (a.note ?? 0) === (b.note ?? 0) && (a.volume ?? 0) === (b.volume ?? 0) &&
  (a.effTyp ?? 0) === (b.effTyp ?? 0) && (a.eff ?? 0) === (b.eff ?? 0) &&
  (a.effTyp2 ?? 0) === (b.effTyp2 ?? 0) && (a.eff2 ?? 0) === (b.eff2 ?? 0);

/**
 * The bytes with one event inserted for a note typed on an empty cell, or a
 * reason it cannot be: the cell is not on the track's next free lane of that
 * tick, the note is outside the pitch range, the instrument is not the
 * track's wave, or the song already has 8192 events.
 */
function insertKdmEvent(bytes: Uint8Array, e: KdmGridEdit): Uint8Array | string {
  const m = decodeKdmModule(bytes);
  if (!m) return 'module does not decode';
  const t = m.firstChannel.findIndex((f, k) => e.channel >= f && e.channel < f + m.lanes[k]);
  if (t < 0) return `channel ${e.channel} has no track`;
  const c = e.cell;
  const note = c.note ?? 0;
  const off = note === KDM_GRID_NOTE_OFF;
  if (!off && (note < 1 || note > 75 + NOTE_BIAS)) return `note ${note} is outside the KDM pitch range`;
  const wave = bytes[HEADER + 4 * t];
  if ((c.instrument ?? 0) > 0 && c.instrument !== wave + 1) return `instrument ${c.instrument} is not track ${t}'s wave (${wave + 1}); KDM sets the instrument per track`;
  if (m.notes >= 8192) return 'the song already has 8192 events';
  const time = m.times[0] + (e.pattern * KDM_ROWS + e.row) * m.zoom;
  const trackOf = (i: number): number => bytes[kdmArrayOffset(m, 0) + i];
  let j = 0;
  let lane = 0;
  while (j < m.notes && m.times[j] <= time) { if (m.times[j] === time && trackOf(j) === t) lane++; j++; }
  if (e.channel !== m.firstChannel[t] + lane) return `track ${t} takes its next event on tick ${time} in channel ${m.firstChannel[t] + lane}`;
  const volL = off ? 0 : (c.volume ?? 0) >= 0x10 ? Math.max(1, (((c.volume ?? 0) - 0x10) << 2) | 2) : 0x80;
  const volR = !off && (c.effTyp2 ?? 0) === PAN_EFFECT ? (c.eff2 ?? 0) : 0x80;
  const fxF = Math.min(16, c.effTyp ?? 0);
  const value = [t, off ? 0 : note - NOTE_BIAS, volL, volR, fxF, fxF === 0 ? 0 : (c.eff ?? 0), 0];
  const arrays = m.hasFxP ? 7 : 6;
  const n = m.notes + 1;
  const out = new Uint8Array(bytes.length + 4 + arrays);
  const timesAt = HEADER + 4 * m.tracks;
  out.set(bytes.subarray(0, timesAt));
  const dv = new DataView(out.buffer);
  dv.setInt32(4, n, true);
  for (let i = 0, k = 0; i < n; i++) dv.setInt32(timesAt + 4 * i, i === j ? time : m.times[k++], true);
  for (let a = 0; a < arrays; a++) {
    const from = kdmArrayOffset(m, a), to = timesAt + 4 * n + a * n;
    out.set(bytes.subarray(from, from + j), to);
    out[to + j] = value[a] & 0xff;
    out.set(bytes.subarray(from + j, from + m.notes), to + j + 1);
  }
  return out;
}

/**
 * The file bytes with grid edits written into the events they sit on, and an
 * event inserted for each note typed on a cell with no event; the same array
 * when no cell differs from what it shows. The instrument (a track's wave) is
 * not editable per cell. Refused inserts are reported in warnings.
 */
export function applyKdmGridEdits(bytes: Uint8Array, edits: readonly KdmGridEdit[], warnings?: string[]): Uint8Array {
  const m = decodeKdmModule(bytes);
  if (!m) return bytes;
  const at = new Map<string, number>();
  m.place.forEach((p, i) => at.set(`${p.pattern}:${p.row}:${p.channel}`, i));
  const out = m.image;
  let changed = false;
  const put = (k: number, i: number, v: number): void => { out[kdmArrayOffset(m, k) + i] = v & 0xff; changed = true; };
  const adds: KdmGridEdit[] = [];
  for (const e of edits) {
    const i = at.get(`${e.pattern}:${e.row}:${e.channel}`);
    if (i === undefined) { if ((e.cell.note ?? 0) > 0) adds.push(e); continue; }
    const before = kdmEventCell(m, i);
    const c = e.cell;
    if (same(before, c)) continue;
    const wasOff = byteAt(m, 2, i) === 0;
    if ((c.note ?? 0) !== (before.note ?? 0)) {
      if (c.note === KDM_GRID_NOTE_OFF) put(2, i, 0);
      else if ((c.note ?? 0) > 0) {
        put(1, i, (c.note ?? 0) - NOTE_BIAS);
        if (wasOff) { put(2, i, 0x80); put(3, i, 0x80); }
      }
    }
    if ((c.volume ?? 0) >= 0x10 && (c.volume ?? 0) !== before.volume && byteAt(m, 2, i) !== 0) {
      put(2, i, Math.max(1, (((c.volume ?? 0) - 0x10) << 2) | 2));
    }
    if ((c.effTyp ?? 0) !== before.effTyp || (c.eff ?? 0) !== before.eff) {
      put(4, i, Math.min(16, c.effTyp ?? 0));
      put(5, i, (c.effTyp ?? 0) === 0 ? 0 : (c.eff ?? 0));
    }
    if ((c.effTyp2 ?? 0) === PAN_EFFECT && (c.eff2 ?? 0) !== before.eff2) put(3, i, c.eff2 ?? 0);
  }
  // Inserted in time order so each insert sees the lanes the earlier ones took.
  adds.sort((a, b) => (a.pattern - b.pattern) || (a.row - b.row) || (a.channel - b.channel));
  let result = changed ? out : bytes;
  for (const e of adds) {
    const next = insertKdmEvent(result, e);
    if (typeof next === 'string') warnings?.push(`KDM: the note on pattern ${e.pattern} row ${e.row} channel ${e.channel} was not written: ${next}.`);
    else result = next;
  }
  return result;
}
