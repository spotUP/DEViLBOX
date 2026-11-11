/**
 * organyaGrid.ts - Organya (.org, Cave Story) module carrier and grid mapping.
 *
 * File layout (organya.h, read from obj0640-1.org): 6 byte magic "Org-0x", u16
 * wait (ms per position tick), u8 steps per bar, u8 beats per step, u32 loop
 * start, u32 loop end (18 bytes). Then 16 track records of 6 bytes: u16 freq,
 * u8 instrument, u8 pipi, u16 event count. Then, per track with events, five
 * arrays of that count: u32 positions (ascending), u8 pitch (255 = keep the
 * running note), u8 length, u8 volume (255 = keep), u8 pan (255 = keep, 6 is
 * centre). Tracks 0-7 are melody, 8-15 drums.
 *
 * The carrier is the original image. The grid only places the file's own
 * events, so an edit rewrites the pitch, length, volume and pan bytes of
 * existing events and nothing else: same-length edits only, no event is added,
 * removed or moved.
 *
 * Grid mapping:
 *  - Row zoom is the gcd of all event positions (position ticks per row), so
 *    every event sits on a row. Rows are cut into 64-row patterns in sequence.
 *  - Channels are the 16 tracks; two events of one track on one position take
 *    consecutive extra channels in file order.
 *  - note = pitch + 13: pitch 36 is 262 Hz (wave_size * freq_table * 2^j / 8,
 *    organya.h:514), tracker C-4 is 261.6 Hz = note 49. Pitch 255 shows no note.
 *  - instrument = the track's instrument + 1 (per track, so not editable per cell).
 *  - volume = 0x10 + (vol >> 2) (0 = keep). A volume edit writes (v << 2) | 2.
 *  - effTyp 0x14 / eff = the event's length in ticks. effTyp2 8 / eff2 = pan * 21 (0 = keep).
 *  - freq, pipi, loop points and wait are carried, never shown.
 */
import type { TrackerCell } from '@/types';

export const ORGANYA_ROWS = 64;
export const ORGANYA_TRACKS = 16;
export const ORGANYA_NO_VALUE = 255;
const NOTE_BIAS = 13;
const MAX_PITCH = 95;
const LENGTH_EFFECT = 0x14;
const PAN_EFFECT = 8;
const PAN_STEP = 21;
const HEADER = 18;
const RECORD = 6;

export interface OrganyaPlace { pattern: number; row: number; channel: number }

export interface OrganyaModule {
  /** Position ticks of 1 ms * wait. */
  wait: number;
  count: number[];
  /** Byte offset of each track's position array (-1 when the track has no events). */
  start: number[];
  zoom: number;
  /** First channel of each track and the channels it owns. */
  firstChannel: number[];
  lanes: number[];
  channels: number;
  patterns: number;
  /** Per track, the grid place of each event. */
  place: OrganyaPlace[][];
  image: Uint8Array;
}

const u16 = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Byte offset of array k (0 position u32, 1 pitch, 2 length, 3 volume, 4 pan) of track t. */
export function organyaArrayOffset(m: Pick<OrganyaModule, 'start' | 'count'>, t: number, k: number): number {
  return k === 0 ? m.start[t] : m.start[t] + 4 * m.count[t] + (k - 1) * m.count[t];
}

/** The module, or null when the bytes are not an Org-0x file of exactly the size its records imply. */
export function decodeOrganyaModule(bytes: Uint8Array): OrganyaModule | null {
  if (bytes.length < HEADER + ORGANYA_TRACKS * RECORD) return null;
  if (bytes[0] !== 0x4f || bytes[1] !== 0x72 || bytes[2] !== 0x67 || bytes[3] !== 0x2d || bytes[4] !== 0x30) return null;
  const wait = u16(bytes, 6);
  const count: number[] = [];
  const start: number[] = [];
  let at = HEADER + ORGANYA_TRACKS * RECORD;
  for (let t = 0; t < ORGANYA_TRACKS; t++) {
    const n = u16(bytes, HEADER + t * RECORD + 4);
    count.push(n);
    start.push(n > 0 ? at : -1);
    at += 8 * n;
  }
  if (at !== bytes.length) return null;
  let zoom = 0;
  let last = 0;
  const positions: number[][] = [];
  for (let t = 0; t < ORGANYA_TRACKS; t++) {
    const ps: number[] = [];
    for (let i = 0; i < count[t]; i++) {
      const p = u32(bytes, start[t] + 4 * i);
      if (i > 0 && p < ps[i - 1]) return null;
      ps.push(p);
      zoom = gcd(zoom, p);
      if (p > last) last = p;
    }
    positions.push(ps);
  }
  if (zoom === 0) zoom = 1;
  const lanes: number[] = new Array<number>(ORGANYA_TRACKS).fill(1);
  const lane: number[][] = positions.map((ps) => {
    const seen = new Map<number, number>();
    return ps.map((p) => { const l = seen.get(p) ?? 0; seen.set(p, l + 1); return l; });
  });
  lane.forEach((ls, t) => ls.forEach((l) => { if (l + 1 > lanes[t]) lanes[t] = l + 1; }));
  const firstChannel: number[] = [];
  let channels = 0;
  for (let t = 0; t < ORGANYA_TRACKS; t++) { firstChannel.push(channels); channels += lanes[t]; }
  const place = positions.map((ps, t) => ps.map((p, i): OrganyaPlace => {
    const r = p / zoom;
    return { pattern: Math.floor(r / ORGANYA_ROWS), row: r % ORGANYA_ROWS, channel: firstChannel[t] + lane[t][i] };
  }));
  return {
    wait, count, start, zoom, firstChannel, lanes, channels,
    patterns: Math.floor(last / zoom / ORGANYA_ROWS) + 1, place, image: bytes.slice(),
  };
}

export const isOrganyaModule = (bytes: Uint8Array): boolean => decodeOrganyaModule(bytes) !== null;

const byteAt = (m: OrganyaModule, t: number, k: number, i: number): number => m.image[organyaArrayOffset(m, t, k) + i];

/** The grid cell event i of track t shows. */
export function organyaEventCell(m: OrganyaModule, t: number, i: number): TrackerCell {
  const pitch = byteAt(m, t, 1, i), length = byteAt(m, t, 2, i), vol = byteAt(m, t, 3, i), pan = byteAt(m, t, 4, i);
  const cell: TrackerCell = { note: 0, instrument: m.image[HEADER + t * RECORD + 2] + 1, volume: 0, effTyp: LENGTH_EFFECT, eff: length, effTyp2: 0, eff2: 0 };
  if (pitch <= MAX_PITCH && pitch + NOTE_BIAS <= 96) cell.note = pitch + NOTE_BIAS;
  if (vol !== ORGANYA_NO_VALUE) cell.volume = 0x10 + (vol >> 2);
  if (pan !== ORGANYA_NO_VALUE) { cell.effTyp2 = PAN_EFFECT; cell.eff2 = pan * PAN_STEP; }
  return cell;
}

export interface OrganyaGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

/**
 * The file bytes with grid edits written into the events they sit on; the same
 * array when no cell differs from what it shows. Cells with no event are
 * ignored (the grid cannot add events), as is the instrument (a track's).
 */
export function applyOrganyaGridEdits(bytes: Uint8Array, edits: readonly OrganyaGridEdit[]): Uint8Array {
  const m = decodeOrganyaModule(bytes);
  if (!m) return bytes;
  const at = new Map<string, [number, number]>();
  m.place.forEach((ps, t) => ps.forEach((p, i) => at.set(`${p.pattern}:${p.row}:${p.channel}`, [t, i])));
  const out = m.image;
  let changed = false;
  const put = (t: number, k: number, i: number, v: number): void => { out[organyaArrayOffset(m, t, k) + i] = v & 0xff; changed = true; };
  for (const e of edits) {
    const hit = at.get(`${e.pattern}:${e.row}:${e.channel}`);
    if (!hit) continue;
    const [t, i] = hit;
    const before = organyaEventCell(m, t, i);
    const c = e.cell;
    if ((c.note ?? 0) !== before.note) {
      if ((c.note ?? 0) === 0) put(t, 1, i, ORGANYA_NO_VALUE);
      else if (c.note! >= NOTE_BIAS && c.note! <= 96) put(t, 1, i, c.note! - NOTE_BIAS);
    }
    if ((c.volume ?? 0) !== before.volume) {
      if ((c.volume ?? 0) === 0) put(t, 3, i, ORGANYA_NO_VALUE);
      else if (c.volume! >= 0x10) put(t, 3, i, Math.min(254, ((c.volume! - 0x10) << 2) | 2));
    }
    if ((c.effTyp ?? 0) === LENGTH_EFFECT && (c.eff ?? 0) !== before.eff) put(t, 2, i, c.eff ?? 0);
    if ((c.effTyp2 ?? 0) === PAN_EFFECT && (c.eff2 ?? 0) !== before.eff2) put(t, 4, i, Math.min(12, Math.round((c.eff2 ?? 0) / PAN_STEP)));
    else if ((c.effTyp2 ?? 0) === 0 && before.effTyp2 === PAN_EFFECT) put(t, 4, i, ORGANYA_NO_VALUE);
  }
  return changed ? out : bytes;
}
